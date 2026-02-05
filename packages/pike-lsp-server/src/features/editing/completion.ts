/**
 * Code Completion Handler
 *
 * Provides code completion suggestions for Pike code.
 */

import {
    Connection,
    CompletionItem,
    CompletionItemKind,
    TextDocuments,
    MarkupKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { IDENTIFIER_PATTERNS } from '../../utils/regex-patterns.js';
import { buildCompletionItem, extractTypeName as extractTypeNameHelper } from './completion-helpers.js';
import { getAutoDocCompletion } from './autodoc.js';
import { buildHoverContent } from '../utils/hover-builder.js';

/**
 * Register code completion handlers.
 */
export function registerCompletionHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { logger, documentCache, stdlibIndex, moduleContext } = services;

    /**
     * Code completion handler
     */
    connection.onCompletion(async (params): Promise<CompletionItem[]> => {
        const bridge = services.bridge;
        const uri = params.textDocument.uri;
        const document = documents.get(uri);
        const cached = documentCache.get(uri);

        if (!document) {
            logger.debug('Completion request - no document found', { uri });
            return [];
        }

        if (!cached) {
            logger.debug('Completion request - no cached document', { uri });
            return [];
        }

        logger.debug('Completion request', { uri, symbolCount: cached.symbols.length });

        const completions: CompletionItem[] = [];
        const text = document.getText();
        const offset = document.offsetAt(params.position);

        // Check for AutoDoc trigger
        const autoDocItems = getAutoDocCompletion(document, params.position);
        if (autoDocItems.length > 0) {
            return autoDocItems;
        }

        // Get the text before cursor to determine context
        const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
        const lineText = text.slice(lineStart, offset);

        // Determine if we're in a type context or expression context
        const completionContext = getCompletionContext(lineText);
        logger.debug('Completion context', { context: completionContext, lineText: lineText.slice(-50) });

        // Check for scope operator (::) for special cases like this_program::, this::
        const scopeMatch = lineText.match(IDENTIFIER_PATTERNS.SCOPED_ACCESS);

        if (scopeMatch) {
            // Pike scope operator: this_program::, this::, ParentClass::, etc.
            const scopeName = scopeMatch[1] ?? '';
            const prefix = scopeMatch[2] ?? '';

            logger.debug('Scope access completion', { scopeName, prefix });

            if ((scopeName === 'this_program' || scopeName === 'this') && cached) {
                // this_program:: or this:: - show local class members
                for (const symbol of cached.symbols) {
                    if (symbol.kind === 'method' || symbol.kind === 'variable') {
                        if (!symbol.name) continue;

                        if (!prefix || symbol.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                            completions.push(buildCompletionItem(symbol.name, symbol, 'Local member', cached.symbols, completionContext));
                        }
                    }
                }

                // Also add inherited members
                const inherits = cached.symbols.filter(s => s.kind === 'inherit');
                if (stdlibIndex) {
                    for (const inheritSymbol of inherits) {
                        const parentName = (inheritSymbol as any).classname ?? inheritSymbol.name;
                        if (parentName) {
                            try {
                                const parentModule = await stdlibIndex.getModule(parentName);
                                if (parentModule?.symbols) {
                                    for (const [name, symbol] of parentModule.symbols) {
                                        if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                            completions.push(buildCompletionItem(name, symbol, `Inherited from ${parentName}`, undefined, completionContext));
                                        }
                                    }
                                }
                            } catch (err) {
                                logger.debug('Failed to get inherited members', { error: err instanceof Error ? err.message : String(err) });
                            }
                        }
                    }
                }
                return completions;
            } else if (stdlibIndex) {
                // ParentClass:: - show members of that specific parent class
                try {
                    const parentModule = await stdlibIndex.getModule(scopeName);
                    if (parentModule?.symbols) {
                        logger.debug('Found stdlib module members', { module: scopeName, count: parentModule.symbols.size });
                        for (const [name, symbol] of parentModule.symbols) {
                            if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                completions.push(buildCompletionItem(name, symbol, `From ${scopeName}`, undefined, completionContext));
                            }
                        }
                        return completions;
                    }
                } catch (err) {
                    logger.debug('Failed to resolve scope module', { scopeName, error: err instanceof Error ? err.message : String(err) });
                }
            }
        }

        // Use Pike's tokenizer to get accurate completion context
        let pikeContext: import('@pike-lsp/pike-bridge').CompletionContext | null = null;
        if (bridge) {
            try {
                // PERF-003: Pass document URI and version for tokenization caching
                pikeContext = await bridge.getCompletionContext(
                    text,
                    params.position.line + 1,
                    params.position.character,
                    uri,
                    document.version
                );
                logger.debug('Pike completion context', { context: pikeContext });
            } catch (err) {
                logger.debug('Failed to get Pike context', { error: err instanceof Error ? err.message : String(err) });
            }
        }

        // Handle member access (obj->meth, Module.sub, this::member)
        if (pikeContext?.context === 'member_access' || pikeContext?.context === 'scope_access') {
            const objectRef = pikeContext.objectName;
            const prefix = pikeContext.prefix.trim();
            const operator = pikeContext.operator;

            logger.debug('Member/scope access completion', { objectRef, operator, prefix });

            // Determine the type name to look up using a multi-strategy approach
            let typeName: string | null = null;

            // Strategy 1: If it looks like a fully qualified module (e.g., "Stdio.File"), use directly
            if (objectRef.includes('.')) {
                typeName = objectRef;
                logger.debug('Using fully qualified name', { typeName });
            }
            // Strategy 2: Try to resolve as a top-level stdlib module
            else if (stdlibIndex) {
                try {
                    const testModule = await stdlibIndex.getModule(objectRef);
                    if (testModule?.symbols && testModule.symbols.size > 0) {
                        typeName = objectRef;
                        logger.debug('Resolved as stdlib module', { typeName, count: testModule.symbols.size });
                    }
                } catch (err) {
                    logger.debug('Not a stdlib module', { objectRef });
                }
            }

            // Strategy 3: Look up local symbol to get its type
            if (!typeName && cached) {
                const localSymbol = cached.symbols.find(s => s.name === objectRef);
                if (localSymbol?.type) {
                    typeName = extractTypeName(localSymbol.type);
                    logger.debug('Extracted type from local symbol', { objectRef, typeName });
                }
            }

            // Use resolved type to get members
            if (typeName && stdlibIndex) {
                // First try to resolve from stdlib
                try {
                    const module = await stdlibIndex.getModule(typeName);
                    if (module?.symbols) {
                        logger.debug('Found stdlib type members', { typeName, count: module.symbols.size });
                        for (const [name, symbol] of module.symbols) {
                            if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                completions.push(buildCompletionItem(name, symbol, `From ${typeName}`, undefined, completionContext));
                            }
                        }
                        return completions;
                    }
                } catch (err) {
                    logger.debug('Type not in stdlib', { typeName });
                }

                // If not in stdlib, try to find it in workspace documents
                logger.debug('Searching workspace documents', { typeName });
                for (const [docUri, doc] of documentCache.entries()) {
                    const classSymbol = doc.symbols.find(s => s.kind === 'class' && s.name === typeName);
                    if (classSymbol) {
                        logger.debug('Found class in workspace', { typeName, uri: docUri });

                        const members = classSymbol.children || [];
                        logger.debug('Class members', { typeName, count: members.length });

                        for (const member of members) {
                            if (!prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                completions.push(buildCompletionItem(
                                    member.name,
                                    member,
                                    `Member of ${typeName}`,
                                    undefined,
                                    completionContext
                                ));
                            }
                        }
                        return completions;
                    }
                }
            }

            logger.debug('Could not resolve type for member access', { objectRef });
            return [];
        }

        // General completion - suggest all symbols from current document
        const prefix = getWordAtPosition(text, offset);

        // Add local symbols
        if (cached) {
            for (const symbol of cached.symbols) {
                if (!symbol.name) continue;

                if (!prefix || symbol.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                    const item = buildCompletionItem(symbol.name, symbol, 'Local symbol', cached.symbols, completionContext);
                    item.data = { uri, name: symbol.name };
                    completions.push(item);
                }
            }

            // Add waterfall symbols from imports/include/inherit/require using ModuleContext
            // This provides symbols from transitive dependencies with provenance tracking
            if (moduleContext && services.bridge?.bridge) {
                try {
                    const waterfallResult = await moduleContext.getWaterfallSymbolsForDocument(
                        uri,
                        text,
                        services.bridge.bridge,
                        3  // maxDepth for transitive resolution
                    );

                    // Add waterfall symbols with provenance tracking
                    for (const symbol of waterfallResult.symbols) {
                        if (!symbol.name) continue;

                        // Skip if already suggested from local symbols
                        if (cached.symbols.some(s => s.name === symbol.name)) {
                            continue;
                        }

                        if (!prefix || symbol.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                            const provenance = symbol.provenance_file
                                ? `From ${symbol.provenance_file}`
                                : 'Imported symbol';
                            completions.push(buildCompletionItem(symbol.name, symbol, provenance, undefined, completionContext));
                        }
                    }
                } catch (err) {
                    logger.debug('Failed to get waterfall symbols', {
                        error: err instanceof Error ? err.message : String(err)
                    });
                }
            }

            // Legacy fallback: Add symbols from included files via includeResolver
            if (services.includeResolver && cached.dependencies?.includes) {
                for (const include of cached.dependencies.includes) {
                    for (const symbol of include.symbols) {
                        if (!symbol.name) continue;

                        // Skip if already suggested from local symbols
                        if (cached.symbols.some(s => s.name === symbol.name)) {
                            continue;
                        }

                        if (!prefix || symbol.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                            const item = buildCompletionItem(symbol.name, symbol, `From ${include.originalPath}`, undefined, completionContext);
                            item.data = { uri: include.resolvedPath, name: symbol.name };
                            completions.push(item);
                        }
                    }
                }
            }

            // Add symbols from imported modules (stdlib and workspace)
            if (cached.dependencies?.imports) {
                for (const imp of cached.dependencies.imports) {
                    // Try stdlib index first
                    if (imp.isStdlib && stdlibIndex) {
                        try {
                            const moduleInfo = await stdlibIndex.getModule(imp.modulePath);
                            if (moduleInfo?.symbols) {
                                for (const [name, symbol] of moduleInfo.symbols) {
                                    // Skip if already suggested
                                    if (cached.symbols.some(s => s.name === name)) {
                                        continue;
                                    }

                                    if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                        completions.push(buildCompletionItem(name, symbol, `From ${imp.modulePath}`, undefined, completionContext));
                                    }
                                }
                            }
                        } catch (err) {
                            logger.debug('Failed to get stdlib import symbols', {
                                modulePath: imp.modulePath,
                                error: err instanceof Error ? err.message : String(err),
                            });
                        }
                    }

                    // For workspace imports, use cached symbols if available
                    if (!imp.isStdlib && imp.symbols) {
                        for (const symbol of imp.symbols) {
                            if (!symbol.name) continue;

                            // Skip if already suggested
                            if (cached.symbols.some(s => s.name === symbol.name)) {
                                continue;
                            }

                            if (!prefix || symbol.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                completions.push(buildCompletionItem(symbol.name, symbol, `From ${imp.modulePath}`, undefined, completionContext));
                            }
                        }
                    }
                }
            }
        }

        // Add Pike built-in types and common functions
        const pikeBuiltins = [
            { name: 'int', kind: CompletionItemKind.Keyword },
            { name: 'string', kind: CompletionItemKind.Keyword },
            { name: 'float', kind: CompletionItemKind.Keyword },
            { name: 'array', kind: CompletionItemKind.Keyword },
            { name: 'mapping', kind: CompletionItemKind.Keyword },
            { name: 'multiset', kind: CompletionItemKind.Keyword },
            { name: 'object', kind: CompletionItemKind.Keyword },
            { name: 'function', kind: CompletionItemKind.Keyword },
            { name: 'program', kind: CompletionItemKind.Keyword },
            { name: 'mixed', kind: CompletionItemKind.Keyword },
            { name: 'void', kind: CompletionItemKind.Keyword },
            { name: 'class', kind: CompletionItemKind.Keyword },
            { name: 'inherit', kind: CompletionItemKind.Keyword },
            { name: 'import', kind: CompletionItemKind.Keyword },
            { name: 'constant', kind: CompletionItemKind.Keyword },
            { name: 'if', kind: CompletionItemKind.Keyword },
            { name: 'else', kind: CompletionItemKind.Keyword },
            { name: 'for', kind: CompletionItemKind.Keyword },
            { name: 'foreach', kind: CompletionItemKind.Keyword },
            { name: 'while', kind: CompletionItemKind.Keyword },
            { name: 'do', kind: CompletionItemKind.Keyword },
            { name: 'switch', kind: CompletionItemKind.Keyword },
            { name: 'case', kind: CompletionItemKind.Keyword },
            { name: 'default', kind: CompletionItemKind.Keyword },
            { name: 'break', kind: CompletionItemKind.Keyword },
            { name: 'continue', kind: CompletionItemKind.Keyword },
            { name: 'return', kind: CompletionItemKind.Keyword },
            { name: 'public', kind: CompletionItemKind.Keyword },
            { name: 'private', kind: CompletionItemKind.Keyword },
            { name: 'protected', kind: CompletionItemKind.Keyword },
            { name: 'static', kind: CompletionItemKind.Keyword },
            { name: 'final', kind: CompletionItemKind.Keyword },
            { name: 'local', kind: CompletionItemKind.Keyword },
            { name: 'sizeof', kind: CompletionItemKind.Function },
            { name: 'typeof', kind: CompletionItemKind.Function },
            { name: 'Stdio', kind: CompletionItemKind.Module },
            { name: 'Array', kind: CompletionItemKind.Module },
            { name: 'String', kind: CompletionItemKind.Module },
            { name: 'Mapping', kind: CompletionItemKind.Module },
            { name: 'Math', kind: CompletionItemKind.Module },
        ];

        for (const builtin of pikeBuiltins) {
            if (!prefix || builtin.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                completions.push({
                    label: builtin.name,
                    kind: builtin.kind,
                });
            }
        }

        return completions;
    });

    /**
     * Completion item resolve - add documentation for the selected item
     */
    connection.onCompletionResolve((item): CompletionItem => {
        const data = item.data as { uri?: string; name?: string } | undefined;
        if (data?.uri && data?.name) {
            const cached = documentCache.get(data.uri);
            if (cached) {
                const symbol = cached.symbols.find(s => s.name === data.name);
                if (symbol) {
    item.documentation = {
                        kind: MarkupKind.Markdown,
                        value: buildHoverContent(symbol) ?? '',
                    };
                }
            }
        }
        return item;
    });
}

// ==================== Helper Functions ====================

/**
 * Get word at position in text
 */
function getWordAtPosition(text: string, offset: number): string {
    let start = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    let end = offset;
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }
    return text.slice(start, end);
}

/**
 * Determine completion context from text before cursor
 */
function getCompletionContext(lineText: string): 'type' | 'expression' {
    const trimmed = lineText.replace(/\w*$/, '').trimEnd();

    if (trimmed.length === 0) {
        return 'type';
    }

    if (/\breturn\s*$/.test(trimmed)) {
        return 'expression';
    }

    const expressionPatterns = [
        /=\s*$/,
        /\[\s*$/,
        /\(\s*$/,
        /,\s*$/,
        /[+\-*/%]\s*$/,
        /[<>]=?\s*$/,
        /[!=]=\s*$/,
        /&&\s*$/,
        /\|\|\s*$/,
        /!\s*$/,
        /\?\s*$/,
        /:\s*$/,
        /=>\s*$/,
    ];

    const typePatterns = [
        /^\s*$/,
        /;\s*$/,
        /\{\s*$/,
        /\b(public|private|protected|static|local|final|constant|optional)\s+$/i,
        /\bclass\s+\w+\s*$/,
        /\binherit\s+$/,
        /\|$/,
    ];

    for (const pattern of expressionPatterns) {
        if (pattern.test(trimmed)) {
            if (/,\s*$/.test(trimmed)) {
                const beforeComma = trimmed.replace(/,\s*$/, '');
                const lastOpenParen = beforeComma.lastIndexOf('(');
                const lastCloseParen = beforeComma.lastIndexOf(')');

                if (lastOpenParen > lastCloseParen) {
                    const beforeParen = beforeComma.slice(0, lastOpenParen).trimEnd();
                    if (/\b\w+\s+\w+\s*$/.test(beforeParen)) {
                        return 'type';
                    }
                    return 'expression';
                }

                if (/\)\s*\{/.test(trimmed)) {
                    return 'expression';
                }
                return 'expression';
            }

            if (/\(\s*$/.test(trimmed)) {
                if (/\b\w+\s+\w+\s*\(\s*$/.test(trimmed)) {
                    return 'type';
                }
                return 'expression';
            }

            if (/:\s*$/.test(trimmed) && /\binherit\s+\w+\s*:\s*$/.test(trimmed)) {
                return 'type';
            }

            return 'expression';
        }
    }

    for (const pattern of typePatterns) {
        if (pattern.test(trimmed)) {
            return 'type';
        }
    }

    return 'type';
}

/**
 * Extract a class/module name from a Pike type object
 */
function extractTypeName(typeObj: unknown): string | null {
    return extractTypeNameHelper(typeObj);
}
