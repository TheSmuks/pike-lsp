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
import { provideRoxenCompletions } from '../roxen/index.js';
import { detectRXMLStrings, findRXMLStringAtPosition, getRXMLTagCompletions, getRXMLAttributeCompletions } from '../rxml/mixed-content.js';

/**
 * Register code completion handlers.
 */
export function registerCompletionHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    // Note: stdlibIndex accessed via services.stdlibIndex for late binding (initialized after registration)
    const { logger, documentCache, moduleContext } = services;

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

            if (scopeName === 'this_program' || scopeName === 'this') {
                // this_program:: or this:: - show local class members
                if (cached) {
                    // Find the enclosing class by looking for the class with the latest start line before cursor
                    const classSymbols = cached.symbols.filter(s => s.kind === 'class');
                    const enclosingClass = findEnclosingClassSymbol(cached.symbols, params.position.line);

                    logger.debug('[COMPLETION:Q.1] this_program:: scope resolution', {
                        cursorLine: params.position.line,
                        totalSymbols: cached.symbols.length,
                        classCount: classSymbols.length,
                        classes: classSymbols.map(c => ({
                            name: c.name,
                            positionLine: c.position?.line,
                            hasChildren: !!c.children,
                            childrenCount: c.children?.length ?? 0
                        })),
                        foundEnclosingClass: enclosingClass ? {
                            name: enclosingClass.name,
                            hasChildren: !!enclosingClass.children,
                            childrenCount: enclosingClass.children?.length ?? 0
                        } : null
                    });

                    if (enclosingClass && enclosingClass.kind === 'class' && enclosingClass.children) {
                        logger.debug('[COMPLETION:Q.1] Found enclosing class for this_program::', { className: enclosingClass.name, memberCount: enclosingClass.children.length });

                        // Add members from the parsed class children (which includes methods and variables)
                        for (const member of enclosingClass.children) {
                            if (!member.name) continue;

                            // Skip inherit statements in the listing (but we use them below to find parent members)
                            if (member.kind === 'inherit') continue;

                            if (!prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                completions.push(buildCompletionItem(member.name, member, 'Local member', undefined, completionContext));
                            }
                        }

                        // Add inherited members from parent classes
                        const inherits = enclosingClass.children.filter(s => s.kind === 'inherit');
                        if (services.stdlibIndex) {
                            for (const inheritSymbol of inherits) {
                                const parentName = (inheritSymbol as any).classname ?? inheritSymbol.name;
                                if (parentName) {
                                    try {
                                        const parentModule = await services.stdlibIndex.getModule(parentName);
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
                    } else {
                        logger.debug('[COMPLETION:Q.1] No enclosing class found for this_program::', {
                            line: params.position.line,
                            hasEnclosingClass: !!enclosingClass,
                            isClass: enclosingClass?.kind === 'class',
                            hasChildren: !!enclosingClass?.children
                        });
                    }
                } else {
                    logger.debug('[COMPLETION:Q.1] Document not cached for this_program::');
                }

                return completions;
            } else if (services.stdlibIndex) {
                // ParentClass:: - show members of that specific parent class
                try {
                    const parentModule = await services.stdlibIndex.getModule(scopeName);
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

        // WORKAROUND: Pike tokenizer doesn't recognize "obj->" as member_access when cursor
        // is between -> and the next identifier. Detect this pattern manually.
        // Match pattern like "obj->" at the cursor position with possible identifier after
        const cursorChar = params.position.character;
        const beforeCursor = lineText.substring(0, cursorChar);
        const arrowMatch = beforeCursor.match(/(\w+)\s*->\s*$/);
        if (arrowMatch && arrowMatch[1]) {
            const objectRef = arrowMatch[1];
            const prefixAfterCursor = lineText.substring(cursorChar).match(/^(\w*)/)?.[1] || '';
            logger.debug('Detected obj-> pattern (workaround)', { objectRef, prefixAfterCursor, beforeCursor: beforeCursor.slice(-10) });

            // Try to resolve the object's type and get its members
            if (cached) {
                const localSymbol = cached.symbols.find(s => s.name === objectRef);
                if (localSymbol?.type) {
                    const typeName = extractTypeName(localSymbol.type);
                    if (typeName) {
                        logger.debug('Extracted type from obj-> workaround', { objectRef, typeName });

                        // Try stdlib first
                        if (services.stdlibIndex) {
                            try {
                                const module = await services.stdlibIndex.getModule(typeName);
                                if (module?.symbols) {
                                    for (const [name, symbol] of module.symbols) {
                                        if (!prefixAfterCursor || name.toLowerCase().startsWith(prefixAfterCursor.toLowerCase())) {
                                            completions.push(buildCompletionItem(name, symbol, `From ${typeName}`, undefined, completionContext));
                                        }
                                    }
                                    return completions;
                                }
                            } catch (err) {
                                logger.debug('Type not in stdlib (obj-> workaround)', { typeName });
                            }
                        }

                        // Then try workspace documents
                        for (const [, doc] of documentCache.entries()) {
                            const classSymbol = doc.symbols.find(s => s.kind === 'class' && s.name === typeName);
                            if (classSymbol?.children) {
                                // Collect all members including inherited ones
                                const allMembers: import('@pike-lsp/pike-bridge').PikeSymbol[] = [];

                                // Add direct members
                                for (const member of classSymbol.children) {
                                    if (member.kind !== 'inherit') {
                                        allMembers.push(member);
                                    }
                                }

                                // Add inherited members (collect parent classes to resolve)
                                const inheritChildren = classSymbol.children.filter(c => c.kind === 'inherit');
                                for (const inheritChild of inheritChildren) {
                                    const parentClassName = (inheritChild as any).classname ?? inheritChild.name;
                                    if (parentClassName) {
                                        // Find parent class in same document
                                        const parentClass = doc.symbols.find(s => s.kind === 'class' && s.name === parentClassName);
                                        if (parentClass?.children) {
                                            for (const parentMember of parentClass.children) {
                                                if (parentMember.kind !== 'inherit' && parentMember.name) {
                                                    // Mark as inherited
                                                    allMembers.push({ ...parentMember, inherited: true, inheritedFrom: parentClassName });
                                                }
                                            }
                                        }
                                    }
                                }

                                // Build completions for all members
                                for (const member of allMembers) {
                                    if (!member.name) continue;
                                    if (!prefixAfterCursor || member.name.toLowerCase().startsWith(prefixAfterCursor.toLowerCase())) {
                                        // Check for deprecated
                                        const isDeprecated = member.deprecated || member.documentation?.deprecated;
                                        const memberWithDeprecated = isDeprecated && !member.deprecated
                                            ? { ...member, deprecated: true }
                                            : member;
                                        completions.push(buildCompletionItem(
                                            member.name,
                                            memberWithDeprecated,
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
                }
            }
        }

        // WORKAROUND: Pike tokenizer doesn't recognize "Module." as member_access when cursor
        // is immediately after the dot with no partial identifier. Detect this pattern manually.
        // Match "Module." at end of line (with possible whitespace before)
        // NOTE: This workaround is kept as fallback until E2E tests confirm Pike-side fix works
        const moduleDotMatch = lineText.match(/([A-Z][a-zA-Z0-9_]*)\.\s*$/);
        if (moduleDotMatch && moduleDotMatch[1] && services.stdlibIndex) {
            const moduleName = moduleDotMatch[1];
            logger.debug('Detected Module. pattern (workaround)', { moduleName, lineText });
            try {
                const testModule = await services.stdlibIndex.getModule(moduleName);
                if (testModule?.symbols && testModule.symbols.size > 0) {
                    logger.debug('Module. workaround succeeded', { moduleName, count: testModule.symbols.size });
                    for (const [name, symbol] of testModule.symbols) {
                        completions.push(buildCompletionItem(name, symbol, `From ${moduleName}`, undefined, completionContext));
                    }
                    return completions;
                }
            } catch (err) {
                logger.debug('Module. workaround failed', { moduleName, error: err instanceof Error ? err.message : String(err) });
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
            else if (services.stdlibIndex) {
                try {
                    const testModule = await services.stdlibIndex.getModule(objectRef);
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
            if (typeName && services.stdlibIndex) {
                // First try to resolve from stdlib
                try {
                    const module = await services.stdlibIndex.getModule(typeName);
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
                        logger.debug('Found class in workspace', { typeName, uri: docUri, childrenCount: classSymbol.children?.length || 0 });

                        // P.2 FIX: Use parsed children (correct class members) but merge deprecated from introspection
                        const members = classSymbol.children || [];
                        logger.debug('Class members from parse', { typeName, count: members.length });

                        // Build a lookup map from introspection for deprecated flags
                        const deprecatedMap = new Map<string, boolean>();
                        if (doc.introspection?.symbols) {
                            for (const sym of doc.introspection.symbols) {
                                if (sym.deprecated || sym.documentation?.deprecated) {
                                    deprecatedMap.set(sym.name, true);
                                }
                            }
                        }

                        for (const member of members) {
                            if (!prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                // Merge deprecated flag: check parse result, introspection, and documentation
                                let memberWithDeprecated = member;
                                const isDeprecated = member.deprecated ||
                                    deprecatedMap.has(member.name) ||
                                    member.documentation?.deprecated;
                                if (isDeprecated && !member.deprecated) {
                                    memberWithDeprecated = { ...member, deprecated: true };
                                }

                                completions.push(buildCompletionItem(
                                    member.name,
                                    memberWithDeprecated,
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
                    if (imp.isStdlib && services.stdlibIndex) {
                        try {
                            const moduleInfo = await services.stdlibIndex.getModule(imp.modulePath);
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

        // --- Roxen completion integration ---
        try {
            // First check if cursor is inside an RXML string in Pike code
            if (bridge) {
                const rxmlStrings = await detectRXMLStrings(text, uri, bridge);
                const inRXMLString = findRXMLStringAtPosition(params.position, rxmlStrings);

                if (inRXMLString) {
                    // Cursor is inside RXML content - provide RXML tag/attribute completions
                    logger.debug('Completion inside RXML string', {
                        confidence: inRXMLString.confidence,
                        markerCount: inRXMLString.markers.length
                    });

                    // Check if we're completing a tag name or attribute
                    // Look for opening tag pattern: <tagname or <tagname attr=
                    const beforeCursorInString = getBeforeCursorInRXMLString(text, offset, inRXMLString);

                    // Check if we're inside a tag (after < but before >)
                    const tagMatch = beforeCursorInString.match(/<([a-z0-9_]*)$/i);
                    if (tagMatch) {
                        // Completing tag name
                        const tagNames = getRXMLTagCompletions(inRXMLString, params.position);
                        for (const tagName of tagNames) {
                            completions.push({
                                label: tagName,
                                kind: CompletionItemKind.Function,
                                detail: 'RXML tag'
                            });
                        }
                        return completions;
                    }

                    // Check if we're completing an attribute: inside <tag ... |
                    const attrMatch = beforeCursorInString.match(/<[a-z0-9_]+\s+([a-z0-9_]*)$/i);
                    if (attrMatch) {
                        // We're in attribute position - provide attribute completions for the tag
                        const tagNameMatch = beforeCursorInString.match(/<([a-z0-9_]+)/);
                        if (tagNameMatch) {
                            const tagName = tagNameMatch[1] ?? '';
                            const attrNames = getRXMLAttributeCompletions(tagName);
                            for (const attrName of attrNames) {
                                completions.push({
                                    label: attrName,
                                    kind: CompletionItemKind.Property,
                                    detail: `RXML attribute for <${tagName}>`
                                });
                            }
                            return completions;
                        }
                    }
                }
            }

            // Standard Roxen module completions
            const roxenCompletions = provideRoxenCompletions(lineText, params.position);
            if (roxenCompletions && roxenCompletions.length > 0) {
                completions.push(...roxenCompletions);
            }
        } catch (err) {
            logger.debug('Roxen/RXML completion failed', {
                error: err instanceof Error ? err.message : String(err)
            });
        }
        // --- End Roxen integration ---

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

/**
 * Find the enclosing class symbol that contains the given line position.
 * Returns the class symbol if found, null otherwise.
 *
 * Strategy:
 * 1. If position has line info: Find class with latest start line still <= cursor line
 * 2. Fallback: Return the most recent/last class in the symbol list (assumes
 *    code is written in declaration order and we're likely in the last class)
 */
function findEnclosingClassSymbol(
    symbols: import('@pike-lsp/pike-bridge').PikeSymbol[],
    line: number
): import('@pike-lsp/pike-bridge').PikeSymbol | null {
    let bestMatch: import('@pike-lsp/pike-bridge').PikeSymbol | null = null;
    let bestMatchLine = -1;
    let lastClass: import('@pike-lsp/pike-bridge').PikeSymbol | null = null;

    // Find the class with the latest start line that is still <= cursor line
    for (const symbol of symbols) {
        if (symbol.kind === 'class' && symbol.name) {
            lastClass = symbol;  // Track the last class we see

            if (symbol.position) {
                const startLine = (symbol.position.line ?? 1) - 1;  // Convert to 0-indexed

                // Only consider classes that start at or before the cursor
                if (startLine <= line && startLine > bestMatchLine) {
                    bestMatch = symbol;
                    bestMatchLine = startLine;
                }
            }
        }
    }

    // Use position-based match if found, otherwise fallback to last class
    const enclosingClass = bestMatch || lastClass;

    // If we found a match, also check for nested classes
    if (enclosingClass && enclosingClass.children) {
        const nestedClass = findEnclosingClassSymbol(enclosingClass.children, line);
        return nestedClass || enclosingClass;
    }

    return enclosingClass;
}

/**
 * Get the text before cursor position within an RXML string.
 * Used for context-aware RXML completion.
 *
 * @param text - Full document text
 * @param offset - Cursor offset in document
 * @param rxmlString - The RXML string containing the cursor
 * @returns Text before cursor within the RXML string content
 */
function getBeforeCursorInRXMLString(
    text: string,
    offset: number,
    rxmlString: import('../rxml/mixed-content.js').RXMLStringLiteral
): string {
    // Calculate offset within RXML content
    const stringStartOffset = text.indexOf(rxmlString.content, Math.max(0, offset - 1000));
    if (stringStartOffset < 0) {
        return '';
    }

    const contentOffset = offset - stringStartOffset;
    if (contentOffset < 0 || contentOffset > rxmlString.content.length) {
        return '';
    }

    return rxmlString.content.slice(0, contentOffset);
}
