/**
 * Editing Feature Handlers
 *
 * Handlers for code editing operations:
 * - Completion: code completion suggestions
 * - Completion resolve: documentation for selected completion
 * - Signature help: function parameter hints
 * - Prepare rename: validation for rename operations
 * - Rename: symbol renaming across files
 */

import {
    Connection,
    CompletionItem,
    CompletionItemKind,
    CompletionItemTag,
    InsertTextFormat,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    TextEdit,
    TextDocuments,
    Range,
    MarkupKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs/promises';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../services/index.js';
import { IDENTIFIER_PATTERNS } from '../utils/regex-patterns.js';

/**
 * Register all editing handlers with the LSP connection.
 *
 * @param connection - The LSP connection
 * @param services - The services bundle
 * @param documents - The text documents manager
 */
export function registerEditingHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { bridge, logger, documentCache, stdlibIndex, workspaceIndex } = services;

    /**
     * Code completion handler
     */
    connection.onCompletion(async (params): Promise<CompletionItem[]> => {
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
                pikeContext = await bridge.getCompletionContext(text, params.position.line + 1, params.position.character);
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

        // Add workspace symbols
        if (cached) {
            for (const symbol of cached.symbols) {
                if (!symbol.name) continue;

                if (!prefix || symbol.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                    const item = buildCompletionItem(symbol.name, symbol, 'Local symbol', cached.symbols, completionContext);
                    item.data = { uri, name: symbol.name };
                    completions.push(item);
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

    /**
     * Signature help handler - show function parameters
     */
    connection.onSignatureHelp(async (params): Promise<SignatureHelp | null> => {
        const uri = params.textDocument.uri;
        const document = documents.get(uri);
        const cached = documentCache.get(uri);

        if (!document || !cached) {
            return null;
        }

        const text = document.getText();
        const offset = document.offsetAt(params.position);

        // Find the function call context
        let parenDepth = 0;
        let funcStart = offset;
        let paramIndex = 0;

        for (let i = offset - 1; i >= 0; i--) {
            const char = text[i];
            if (char === ')') {
                parenDepth++;
            } else if (char === '(') {
                if (parenDepth === 0) {
                    funcStart = i;
                    break;
                }
                parenDepth--;
            } else if (char === ',' && parenDepth === 0) {
                paramIndex++;
            } else if (char === ';' || char === '{' || char === '}') {
                return null;
            }
        }

        // Get the function name before the paren
        const textBefore = text.slice(0, funcStart);
        const qualifiedMatch = textBefore.match(/([\w.]+)\s*$/);
        if (!qualifiedMatch) {
            return null;
        }

        const funcName = qualifiedMatch[1]!;
        let funcSymbol: PikeSymbol | null = null;

        // Check if this is a qualified stdlib symbol
        if (funcName.includes('.') && stdlibIndex) {
            const lastDotIndex = funcName.lastIndexOf('.');
            const modulePath = funcName.substring(0, lastDotIndex);
            const symbolName = funcName.substring(lastDotIndex + 1);

            logger.debug('Signature help for qualified symbol', { modulePath, symbolName });

            try {
                const currentFile = decodeURIComponent(uri.replace(new RegExp('^file://', ''), ''));
                const module = await stdlibIndex.getModule(modulePath);

                if (module?.symbols && module.symbols.has(symbolName)) {
                    const targetPath = module.resolvedPath
                        ? module.resolvedPath
                        : bridge ? await bridge.resolveModule(modulePath, currentFile) : null;

                    if (targetPath) {
                        const cleanPath = targetPath.split(':')[0] ?? targetPath;
                        const targetUri = `file://${cleanPath}`;

                        const targetCached = documentCache.get(targetUri);
                        if (targetCached) {
                            funcSymbol = findSymbolByName(targetCached.symbols, symbolName) ?? null;
                        }

                        if (!funcSymbol && bridge) {
                            try {
                                const code = await fs.readFile(cleanPath, 'utf-8');
                                const parseResult = await bridge.parse(code, cleanPath);
                                funcSymbol = findSymbolByName(parseResult.symbols, symbolName) ?? null;
                            } catch (parseErr) {
                                logger.debug('Failed to parse for signature', { error: parseErr instanceof Error ? parseErr.message : String(parseErr) });
                            }
                        }
                    }
                }
            } catch (err) {
                logger.debug('Error resolving stdlib symbol', { error: err instanceof Error ? err.message : String(err) });
            }
        }

        // Fallback: search in current document
        if (!funcSymbol) {
            funcSymbol = cached.symbols.find(s => s.name === funcName && s.kind === 'method') ?? null;
        }

        if (!funcSymbol) {
            return null;
        }

        // Build signature
        const params_list: ParameterInformation[] = [];
        const symbolAny = funcSymbol as any;
        const argNames: string[] = symbolAny.argNames ?? [];
        const argTypes: unknown[] = symbolAny.argTypes ?? [];

        const returnType = formatPikeType(symbolAny.returnType);
        let signatureLabel = `${returnType} ${funcName}(`;

        for (let i = 0; i < argNames.length; i++) {
            const typeName = formatPikeType(argTypes[i]);
            const paramStr = `${typeName} ${argNames[i]}`;

            const startOffset = signatureLabel.length;
            signatureLabel += paramStr;
            const endOffset = signatureLabel.length;

            params_list.push({
                label: [startOffset, endOffset],
            });

            if (i < argNames.length - 1) {
                signatureLabel += ', ';
            }
        }
        signatureLabel += ')';

        const signature: SignatureInformation = {
            label: signatureLabel,
            parameters: params_list,
        };

        logger.debug('Signature help', { func: funcName, paramIndex, paramsCount: params_list.length });

        return {
            signatures: [signature],
            activeSignature: 0,
            activeParameter: Math.min(paramIndex, params_list.length - 1),
        };
    });

    /**
     * Prepare rename handler - check if rename is allowed
     */
    connection.onPrepareRename((params): Range | null => {
        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            return null;
        }

        const text = document.getText();
        const offset = document.offsetAt(params.position);

        // Find word boundaries
        let start = offset;
        let end = offset;
        while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
            start--;
        }
        while (end < text.length && /\w/.test(text[end] ?? '')) {
            end++;
        }

        if (start === end) {
            return null;
        }

        return {
            start: document.positionAt(start),
            end: document.positionAt(end),
        };
    });

    /**
     * Rename handler - rename symbol across files
     */
    connection.onRenameRequest((params): { changes: { [uri: string]: TextEdit[] } } | null => {
        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            return null;
        }

        const text = document.getText();
        const offset = document.offsetAt(params.position);

        // Find the word to rename
        let start = offset;
        let end = offset;
        while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
            start--;
        }
        while (end < text.length && /\w/.test(text[end] ?? '')) {
            end++;
        }

        const oldName = text.slice(start, end);
        if (!oldName) {
            return null;
        }

        const newName = params.newName;
        const changes: { [uri: string]: TextEdit[] } = {};

        // Replace all occurrences in current document
        const edits: TextEdit[] = [];
        const lines = text.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line) continue;
            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    edits.push({
                        range: {
                            start: { line: lineNum, character: matchIndex },
                            end: { line: lineNum, character: matchIndex + oldName.length },
                        },
                        newText: newName,
                    });
                }
                searchStart = matchIndex + 1;
            }
        }

        if (edits.length > 0) {
            changes[uri] = edits;
        }

        // Also rename in other open documents
        for (const [otherUri] of documentCache.entries()) {
            if (otherUri === uri) continue;

            const otherDoc = documents.get(otherUri);
            if (!otherDoc) continue;

            const otherText = otherDoc.getText();
            const otherEdits: TextEdit[] = [];
            const otherLines = otherText.split('\n');

            for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                const line = otherLines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                        otherEdits.push({
                            range: {
                                start: { line: lineNum, character: matchIndex },
                                end: { line: lineNum, character: matchIndex + oldName.length },
                            },
                            newText: newName,
                        });
                    }
                    searchStart = matchIndex + 1;
                }
            }

            if (otherEdits.length > 0) {
                changes[otherUri] = otherEdits;
            }
        }

        // Also search workspace index for files not currently open
        const workspaceUris = workspaceIndex.getAllDocumentUris();
        for (const wsUri of workspaceUris) {
            if (documentCache.has(wsUri)) continue;

            try {
                const filePath = decodeURIComponent(wsUri.replace(/^file:\/\//, ''));
                const fileContent = require('fs').readFileSync(filePath, 'utf-8');
                const fileEdits: TextEdit[] = [];
                const fileLines = fileContent.split('\n');

                for (let lineNum = 0; lineNum < fileLines.length; lineNum++) {
                    const line = fileLines[lineNum];
                    if (!line) continue;
                    let searchStart = 0;
                    let matchIndex: number;

                    while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                        const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                            fileEdits.push({
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + oldName.length },
                                },
                                newText: newName,
                            });
                        }
                        searchStart = matchIndex + 1;
                    }
                }

                if (fileEdits.length > 0) {
                    changes[wsUri] = fileEdits;
                }
            } catch (err) {
                logger.warn('Failed to read file for rename', { uri: wsUri, error: err instanceof Error ? err.message : String(err) });
            }
        }

        logger.debug('Rename request', { oldName, newName, fileCount: Object.keys(changes).length });
        return { changes };
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
 * Build a completion item with optional snippet support
 */
function buildCompletionItem(
    name: string,
    symbol: { kind?: string; type?: unknown; argNames?: (string | null)[]; argTypes?: unknown[] },
    source: string,
    allSymbols?: Array<{ name: string; kind?: string; argNames?: (string | null)[]; argTypes?: unknown[] }>,
    context: 'type' | 'expression' = 'type'
): CompletionItem {
    const isFunction = symbol.kind === 'method';
    const isClass = symbol.kind === 'class';
    const typeObj = symbol.type as Record<string, unknown> | undefined;
    const symbolAny = symbol as Record<string, unknown>;

    // For classes, try to find the 'create' constructor
    let constructorArgNames: (string | null)[] | undefined;
    let constructorArgTypes: unknown[] | undefined;
    if (isClass && allSymbols) {
        const classSymbol = symbol as Record<string, unknown>;
        const classLine = (classSymbol['position'] as { line?: number } | undefined)?.line ?? 0;

        const classPositions = allSymbols
            .filter(s => s.kind === 'class')
            .map(s => {
                const pos = (s as Record<string, unknown>)['position'] as { line?: number } | undefined;
                return pos?.line ?? 0;
            })
            .sort((a, b) => a - b);

        const nextClassLine = classPositions.find(line => line > classLine) ?? Infinity;

        const createMethod = allSymbols.find(s => {
            if (s.name !== 'create' || s.kind !== 'method') return false;
            const pos = (s as Record<string, unknown>)['position'] as { line?: number } | undefined;
            const createLine = pos?.line ?? 0;
            return createLine > classLine && createLine < nextClassLine;
        });

        if (createMethod) {
            const createMethodAny = createMethod as Record<string, unknown>;
            constructorArgNames = createMethodAny['argNames'] as (string | null)[] | undefined;
            constructorArgTypes = createMethodAny['argTypes'] as unknown[] | undefined;
        }
    }

    let detail = formatPikeType(symbol.type);
    if (isFunction) {
        if (typeObj?.['signature']) {
            detail = typeObj['signature'] as string;
        } else if (symbolAny['argNames'] && symbolAny['argTypes']) {
            const argNames = symbolAny['argNames'] as (string | null)[];
            const argTypes = symbolAny['argTypes'] as unknown[];
            const returnType = formatPikeType(symbolAny['returnType']);
            const params: string[] = [];
            for (let i = 0; i < argNames.length; i++) {
                const typeName = formatPikeType(argTypes[i]);
                const argName = argNames[i] ?? `arg${i}`;
                params.push(`${typeName} ${argName}`);
            }
            detail = `${returnType} ${name}(${params.join(', ')})`;
        }
    } else if (isClass && constructorArgNames && constructorArgNames.length > 0) {
        const params: string[] = [];
        for (let i = 0; i < constructorArgNames.length; i++) {
            const typeName = constructorArgTypes ? formatPikeType(constructorArgTypes[i]) : 'mixed';
            const argName = constructorArgNames[i] ?? `arg${i}`;
            params.push(`${typeName} ${argName}`);
        }
        detail = `${name}(${params.join(', ')})`;
    } else {
        detail = source;
    }

    const kind = convertCompletionKind(symbol.kind);

    const item: CompletionItem = {
        label: name,
        kind,
        detail,
    };

    // Add deprecated tag if applicable
    if ((symbolAny['deprecated'] as boolean) === true) {
        item.tags = [CompletionItemTag.Deprecated];
    }

    // Add snippet for methods in expression context
    if (isFunction && context === 'expression') {
        const snippetInfo = buildMethodSnippet(name, symbol.type, symbolAny['argNames'] as (string | null)[] | undefined, symbolAny['argTypes'] as unknown[] | undefined);
        if (snippetInfo.isSnippet) {
            item.insertText = snippetInfo.snippet;
            item.insertTextFormat = InsertTextFormat.Snippet;
        }
    }

    // Add snippet for classes in expression context
    if (isClass && context === 'expression' && constructorArgNames && constructorArgNames.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < constructorArgNames.length; i++) {
            const argName = constructorArgNames[i] ?? `arg${i + 1}`;
            const safeName = argName.replace(/[$}\\]/g, '\\$&');
            placeholders.push(`\${${i + 1}:${safeName}}`);
        }
        item.insertText = `${name}(${placeholders.join(', ')})`;
        item.insertTextFormat = InsertTextFormat.Snippet;
    }

    return item;
}

/**
 * Build a snippet string for method completion
 */
function buildMethodSnippet(
    name: string,
    typeObj: unknown,
    argNames?: (string | null)[],
    argTypes?: unknown[]
): { snippet: string; isSnippet: boolean } {
    if (argNames && argNames.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < argNames.length; i++) {
            const argName = argNames[i] ?? `arg${i + 1}`;
            const safeName = argName.replace(/[$}\\]/g, '\\$&');
            placeholders.push(`\${${i + 1}:${safeName}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }

    if (!typeObj || typeof typeObj !== 'object') {
        return { snippet: name, isSnippet: false };
    }

    const t = typeObj as Record<string, unknown>;

    if (t['kind'] !== 'function') {
        return { snippet: name, isSnippet: false };
    }

    const args = t['arguments'] as unknown[] | undefined;
    if (args && args.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < args.length; i++) {
            const arg = args[i] as Record<string, unknown> | undefined;
            const argName = arg?.['name'] as string | undefined ?? `arg${i + 1}`;
            const safeName = argName.replace(/[$}\\]/g, '\\$&');
            placeholders.push(`\${${i + 1}:${safeName}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }

    const effectiveArgTypes = argTypes ?? (t['argTypes'] as unknown[] | undefined);
    if (effectiveArgTypes && effectiveArgTypes.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < effectiveArgTypes.length; i++) {
            placeholders.push(`\${${i + 1}:arg${i + 1}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }

    return {
        snippet: `${name}(\${1})`,
        isSnippet: true
    };
}

/**
 * Convert Pike symbol kind to LSP completion kind
 */
function convertCompletionKind(kind?: string): CompletionItemKind {
    switch (kind) {
        case 'class': return CompletionItemKind.Class;
        case 'method': case 'function': return CompletionItemKind.Function;
        case 'variable': return CompletionItemKind.Variable;
        case 'constant': return CompletionItemKind.Constant;
        case 'module': return CompletionItemKind.Module;
        case 'inherit': return CompletionItemKind.Reference;
        default: return CompletionItemKind.Text;
    }
}

/**
 * Format a Pike type for display
 */
function formatPikeType(typeObj: unknown): string {
    if (!typeObj || typeof typeObj !== 'object') {
        if (typeof typeObj === 'string') {
            return typeObj;
        }
        return 'mixed';
    }

    const t = typeObj as Record<string, unknown>;
    const name = t['name'] as string | undefined;

    if (!name) {
        return 'mixed';
    }

    if (name === 'function') {
        const returnType = t['returnType'] ? formatPikeType(t['returnType']) : 'mixed';
        const argTypes = t['argTypes'] as unknown[] | undefined;

        if (argTypes && argTypes.length > 0) {
            const params = argTypes.map((arg) => {
                const typeStr = formatPikeType(arg);
                const isVarargs = typeStr.includes('...') ||
                    (typeof arg === 'object' && (arg as Record<string, unknown>)['kind'] === 'varargs');
                return isVarargs ? typeStr : `${typeStr} arg`;
            }).join(', ');
            return `function(${params})${returnType !== 'void' ? ` : ${returnType}` : ''}`;
        }
        return `function : ${returnType}`;
    }

    if (name === 'or' && Array.isArray(t['types'])) {
        const parts = (t['types'] as unknown[]).map(sub => formatPikeType(sub));
        return parts.join('|');
    }

    if (name === 'array' && t['valueType']) {
        return `array(${formatPikeType(t['valueType'])})`;
    }

    if (name === 'mapping') {
        const key = t['indexType'] ? formatPikeType(t['indexType']) : 'mixed';
        const val = t['valueType'] ? formatPikeType(t['valueType']) : 'mixed';
        return `mapping(${key}:${val})`;
    }

    if (name === 'varargs' && t['type']) {
        return `${formatPikeType(t['type'])}...`;
    }

    return name;
}

/**
 * Extract a class/module name from a Pike type object
 */
function extractTypeName(typeObj: unknown): string | null {
    if (!typeObj || typeof typeObj !== 'object') {
        return null;
    }

    const t = typeObj as Record<string, unknown>;
    const name = t['name'] as string | undefined;

    if (!name) {
        return null;
    }

    // Direct object type
    if (name === 'object' && t['classname']) {
        return t['classname'] as string;
    }

    // Function return type
    if (t['kind'] === 'function' && t['returnType']) {
        return extractTypeName(t['returnType']);
    }

    // Object with name that's a class reference
    if (/^[A-Z][a-zA-Z0-9_]*/.test(name)) {
        return name;
    }

    return null;
}

/**
 * Find symbol by name in an array of symbols
 */
function findSymbolByName(symbols: PikeSymbol[], name: string): PikeSymbol | null {
    for (const symbol of symbols) {
        if (symbol.name === name) {
            return symbol;
        }
    }
    return null;
}

/**
 * Build markdown content for hover
 */
function buildHoverContent(symbol: PikeSymbol): string | null {
    const sym = symbol as unknown as Record<string, unknown>;
    const parts: string[] = [];

    if (symbol.kind === 'method') {
        if (symbol.type && symbol.type.kind === 'function') {
            const funcType = symbol.type as any;
            const returnType = funcType.returnType ? formatPikeType(funcType.returnType) : 'void';

            let argList = '';
            if (Array.isArray(funcType.arguments) && funcType.arguments.length > 0) {
                argList = funcType.arguments.map((arg: unknown, i: number) => {
                    if (typeof arg === 'object' && arg !== null) {
                        const argObj = arg as Record<string, unknown>;
                        const type = formatPikeType(argObj['type'] ?? arg);
                        const name = (argObj['name'] as string) ?? `arg${i}`;
                        return `${type} ${name}`;
                    }
                    return `${formatPikeType(arg)} arg${i}`;
                }).join(', ');
            } else if (funcType.argTypes && Array.isArray(funcType.argTypes)) {
                argList = funcType.argTypes.map((t: unknown, i: number) => {
                    const type = formatPikeType(t);
                    return `${type} arg${i}`;
                }).join(', ');
            }

            parts.push('```pike');
            parts.push(`${returnType} ${symbol.name}(${argList})`);
            parts.push('```');
        } else {
            const returnType = formatPikeType(sym['returnType']);
            const argNames = sym['argNames'] as string[] | undefined;
            const argTypes = sym['argTypes'] as unknown[] | undefined;

            let argList = '';
            if (argTypes && argNames) {
                argList = argTypes.map((t, i) => {
                    const type = formatPikeType(t);
                    const name = argNames[i] ?? `arg${i}`;
                    return `${type} ${name}`;
                }).join(', ');
            }

            parts.push('```pike');
            parts.push(`${returnType} ${symbol.name}(${argList})`);
            parts.push('```');
        }
    } else if (symbol.kind === 'variable' || symbol.kind === 'constant') {
        const type = symbol.type
            ? formatPikeType(symbol.type)
            : (sym['type'] as { name?: string })?.name ?? 'mixed';

        parts.push('```pike');
        parts.push(`${type} ${symbol.name}`);
        parts.push('```');
    } else if (symbol.kind === 'class') {
        parts.push('```pike');
        parts.push(`class ${symbol.name}`);
        parts.push('```');
    }

    // Add documentation if available
    const documentation = sym['documentation'] as string | undefined;
    if (documentation) {
        parts.push('');
        parts.push(documentation);
    }

    return parts.length > 0 ? parts.join('\n') : null;
}
