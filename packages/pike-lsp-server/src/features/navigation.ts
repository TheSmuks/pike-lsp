/**
 * Navigation Feature Handlers
 *
 * Groups "what is this symbol?" handlers:
 * - Hover: type info and documentation
 * - Definition: go to symbol definition
 * - Declaration: navigate to declaration
 * - TypeDefinition: navigate to type definition
 * - Implementation: find implementations/usages
 * - References: find all symbol references
 * - DocumentHighlight: highlight occurrences
 *
 * Each handler includes try/catch with logging fallback (SRV-12).
 */

import {
    Connection,
    Hover,
    Location,
    DocumentHighlight,
    DocumentHighlightKind,
    MarkupKind,
    Position,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';

import type { Services } from '../services/index.js';
import type {
    PikeSymbol,
    PikeFunctionType,
} from '@pike-lsp/pike-bridge';
import { Logger } from '../core/logging.js';

/**
 * Register all navigation handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Bundle of server services
 * @param documents - TextDocuments manager for LSP document synchronization
 */
export function registerNavigationHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Navigation');

    /**
     * Hover handler - show type info and documentation
     */
    connection.onHover(async (params): Promise<Hover | null> => {
        log.debug('Hover request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            // Find symbol at position
            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol) {
                return null;
            }

            // Build hover content
            const content = buildHoverContent(symbol);
            if (!content) {
                return null;
            }

            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: content,
                },
            };
        } catch (err) {
            log.error('Hover failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Definition handler - go to symbol definition
     * If cursor is already on a definition, returns usages of that symbol instead
     */
    connection.onDefinition(async (params): Promise<Location | Location[] | null> => {
        log.debug('Definition request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            // Normal case: find symbol and go to its definition
            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol || !symbol.position) {
                return null;
            }

            // Return location of symbol definition
            const line = Math.max(0, (symbol.position.line ?? 1) - 1);
            return {
                uri,
                range: {
                    start: { line, character: 0 },
                    end: { line, character: symbol.name.length },
                },
            };
        } catch (err) {
            log.error('Definition failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Declaration handler - navigate to declaration (delegates to definition)
     * For Pike, declaration and definition are the same
     */
    connection.onDeclaration(async (params): Promise<Location | null> => {
        log.debug('Declaration request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol || !symbol.position) {
                return null;
            }

            const line = Math.max(0, (symbol.position.line ?? 1) - 1);
            return {
                uri,
                range: {
                    start: { line, character: 0 },
                    end: { line, character: symbol.name.length },
                },
            };
        } catch (err) {
            log.error('Declaration failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Type definition handler - navigate to type definition
     * For classes, navigates to the class definition
     */
    connection.onTypeDefinition(async (params): Promise<Location | null> => {
        log.debug('Type definition request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol) {
                return null;
            }

            // For classes, navigate to the class definition
            if (symbol.kind === 'class' && symbol.position) {
                const line = Math.max(0, (symbol.position.line ?? 1) - 1);
                return {
                    uri,
                    range: {
                        start: { line, character: 0 },
                        end: { line, character: symbol.name.length },
                    },
                };
            }

            // For variables/methods with type info, could navigate to type
            // For now, fall back to symbol position
            if (symbol.position) {
                const line = Math.max(0, (symbol.position.line ?? 1) - 1);
                return {
                    uri,
                    range: {
                        start: { line, character: 0 },
                        end: { line, character: symbol.name.length },
                    },
                };
            }

            return null;
        } catch (err) {
            log.error('Type definition failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Implementation handler - find where a symbol is used
     * When on a definition, shows where it's used; otherwise behaves like references
     */
    connection.onImplementation(async (params): Promise<Location[]> => {
        log.debug('Implementation request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return [];
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

            const word = text.slice(start, end);
            if (!word) {
                return [];
            }

            // Check if we're on a definition
            const symbolAtPosition = cached.symbols.find(s => {
                if (s.name !== word || !s.position) return false;
                const symbolLine = s.position.line - 1;
                const cursorLine = params.position.line;
                return symbolLine === cursorLine;
            });

            const references: Location[] = [];

            // Search for all occurrences of the word in the current document
            const lines = text.split('\n');
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                        // If we're on a definition, skip the definition position itself
                        if (symbolAtPosition && lineNum === params.position.line &&
                            matchIndex <= params.position.character &&
                            matchIndex + word.length >= params.position.character) {
                            // Skip the definition position itself
                        } else {
                            references.push({
                                uri,
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + word.length },
                                },
                            });
                        }
                    }
                    searchStart = matchIndex + 1;
                }
            }

            // Also search in other open documents
            for (const [otherUri] of Array.from(documentCache.entries())) {
                if (otherUri === uri) continue;

                const otherDoc = documents.get(otherUri);
                if (!otherDoc) continue;

                const otherText = otherDoc.getText();
                const otherLines = otherText.split('\n');

                for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                    const line = otherLines[lineNum];
                    if (!line) continue;
                    let searchStart = 0;
                    let matchIndex: number;

                    while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                        const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                            references.push({
                                uri: otherUri,
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + word.length },
                                },
                            });
                        }
                        searchStart = matchIndex + 1;
                    }
                }
            }

            return references;
        } catch (err) {
            log.error('Implementation failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * References handler - find all references to a symbol (Find References / Show Usages)
     */
    connection.onReferences(async (params): Promise<Location[]> => {
        log.debug('References request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return [];
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

            const word = text.slice(start, end);
            if (!word) {
                return [];
            }

            const references: Location[] = [];

            // Search for all occurrences of the word in the current document
            const lines = text.split('\n');
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                // Find all occurrences on this line
                while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                    // Check that it's a word boundary (not part of a larger identifier)
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                        references.push({
                            uri,
                            range: {
                                start: { line: lineNum, character: matchIndex },
                                end: { line: lineNum, character: matchIndex + word.length },
                            },
                        });
                    }
                    searchStart = matchIndex + 1;
                }
            }

            // Also search in other open documents (for cross-file references)
            for (const [otherUri] of Array.from(documentCache.entries())) {
                if (otherUri === uri) continue;

                const otherDoc = documents.get(otherUri);
                if (!otherDoc) continue;

                const otherText = otherDoc.getText();
                const otherLines = otherText.split('\n');

                for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                    const line = otherLines[lineNum];
                    if (!line) continue;
                    let searchStart = 0;
                    let matchIndex: number;

                    while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                        const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                            references.push({
                                uri: otherUri,
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + word.length },
                                },
                            });
                        }
                        searchStart = matchIndex + 1;
                    }
                }
            }

            return references;
        } catch (err) {
            log.error('References failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Document highlight handler - highlight all occurrences of the symbol at cursor
     */
    connection.onDocumentHighlight(async (params): Promise<DocumentHighlight[] | null> => {
        log.debug('Document highlight request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return null;
            }

            const text = document.getText();
            const offset = document.offsetAt(params.position);

            // Find word at cursor
            let wordStart = offset;
            let wordEnd = offset;
            while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
                wordStart--;
            }
            while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
                wordEnd++;
            }
            const word = text.slice(wordStart, wordEnd);

            if (!word || word.length < 2) {
                return null;
            }

            const highlights: DocumentHighlight[] = [];
            const lines = text.split('\n');

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                        highlights.push({
                            range: {
                                start: { line: lineNum, character: matchIndex },
                                end: { line: lineNum, character: matchIndex + word.length },
                            },
                            kind: DocumentHighlightKind.Text,
                        });
                    }
                    searchStart = matchIndex + 1;
                }
            }

            return highlights.length > 0 ? highlights : null;
        } catch (err) {
            log.error('Document highlight failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });
}

/**
 * Find symbol at given position in document.
 */
function findSymbolAtPosition(
    symbols: PikeSymbol[],
    position: Position,
    document: TextDocument
): PikeSymbol | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find word boundaries
    let start = offset;
    let end = offset;

    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    const word = text.slice(start, end);
    if (!word) {
        return null;
    }

    // Find symbol with matching name
    // For now, simple name matching - could be enhanced with scope analysis
    for (const symbol of symbols) {
        if (symbol.name === word) {
            return symbol;
        }
    }

    return null;
}

/**
 * Format a Pike type for display.
 * Handles complex types like OrType (unions), ObjectType, ArrayType etc.
 */
function formatPikeType(typeObj: unknown): string {
    if (!typeObj || typeof typeObj !== 'object') {
        // Handle string type directly (from introspection returnType/argType)
        if (typeof typeObj === 'string') {
            return typeObj;
        }
        return 'mixed';
    }

    const t = typeObj as Record<string, unknown>;
    // Support both 'name' (from parse) and 'kind' (from introspection)
    const name = (t['name'] ?? t['kind']) as string | undefined;

    if (!name) {
        return 'mixed';
    }

    // Handle function types: name="function", returnType, argTypes
    if (name === 'function') {
        const returnType = t['returnType'] ? formatPikeType(t['returnType']) : 'mixed';
        const argTypes = t['argTypes'] as unknown[] | undefined;

        if (argTypes && argTypes.length > 0) {
            const params = argTypes.map((arg) => {
                const typeStr = formatPikeType(arg);
                // Check if this is a varargs parameter (type contains "..." or kind is "varargs")
                const isVarargs = typeStr.includes('...') ||
                    (typeof arg === 'object' && (arg as Record<string, unknown>)['kind'] === 'varargs');
                return isVarargs ? `${typeStr}` : typeStr;
            });
            return `function(${params.join(', ')}:${returnType})`;
        }
        return `function(:${returnType})`;
    }

    // Handle union types (OrType): name="or", types=[...]
    if (name === 'or' && Array.isArray(t['types'])) {
        const parts = (t['types'] as unknown[]).map(sub => formatPikeType(sub));
        return parts.join('|');
    }

    // Handle object types: name="object", className="Gmp.mpz"
    if (name === 'object' && t['className']) {
        return t['className'] as string;
    }

    // Handle program types: name="program", className="..."
    if (name === 'program' && t['className']) {
        return `program(${t['className']})`;
    }

    // Handle array types: name="array", valueType={...}
    if (name === 'array' && t['valueType']) {
        return `array(${formatPikeType(t['valueType'])})`;
    }

    // Handle mapping types: name="mapping", indexType, valueType
    if (name === 'mapping') {
        const key = t['indexType'] ? formatPikeType(t['indexType']) : 'mixed';
        const val = t['valueType'] ? formatPikeType(t['valueType']) : 'mixed';
        return `mapping(${key}:${val})`;
    }

    // Handle varargs: name contains "..."
    if (name === 'varargs' && t['type']) {
        return `${formatPikeType(t['type'])}...`;
    }

    // Simple types: int, string, float, void, mixed, zero
    return name;
}

/**
 * Build markdown content for hover.
 */
function buildHoverContent(symbol: PikeSymbol): string | null {
    const sym = symbol as unknown as Record<string, unknown>;
    const parts: string[] = [];

    // Symbol kind badge
    const kindLabel = symbol.kind.charAt(0).toUpperCase() + symbol.kind.slice(1);

    // Build type signature using introspected type info if available
    if (symbol.kind === 'method') {
        // Try introspected type first
        if (symbol.type && symbol.type.kind === 'function') {
            const funcType = symbol.type as PikeFunctionType;
            const returnType = funcType.returnType ? formatPikeType(funcType.returnType) : 'void';

            let argList = '';
            // Handle both 'argTypes' (from types.ts interface) and 'arguments' (from introspection)
            const funcTypeRaw = symbol.type as unknown as Record<string, unknown>;
            const args = (funcType.argTypes ?? funcTypeRaw['arguments']) as unknown[] | undefined;
            if (args && args.length > 0) {
                argList = args.map((arg, i) => {
                    // Handle introspection format: {type: "string", name: "arg1"}
                    // or argTypes format: PikeType object
                    if (typeof arg === 'object' && arg !== null) {
                        const argObj = arg as Record<string, unknown>;
                        const type = formatPikeType(argObj['type'] ?? arg);
                        const name = (argObj['name'] as string) ?? `arg${i}`;
                        return `${type} ${name}`;
                    }
                    return `${formatPikeType(arg)} arg${i}`;
                }).join(', ');
            }

            parts.push('```pike');
            parts.push(`${returnType} ${symbol.name}(${argList})`);
            parts.push('```');
        } else {
            // Fallback to old parse format
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
        // Try introspected type first
        const type = symbol.type
            ? formatPikeType(symbol.type)
            : (sym['type'] as { name?: string })?.name ?? 'mixed';

        parts.push('```pike');
        const modifier = symbol.kind === 'constant' ? 'constant ' : '';
        parts.push(`${modifier}${type} ${symbol.name}`);
        parts.push('```');
    } else if (symbol.kind === 'class') {
        parts.push('```pike');
        parts.push(`class ${symbol.name}`);
        parts.push('```');
    } else {
        parts.push(`**${kindLabel}**: \`${symbol.name}\``);
    }

    // Add modifiers if present
    if (symbol.modifiers && symbol.modifiers.length > 0) {
        parts.push(`\n*Modifiers*: ${symbol.modifiers.join(', ')}`);
    }

    // Add documentation if present
    const doc = sym['documentation'] as {
        text?: string;
        params?: Record<string, string>;
        returns?: string;
        throws?: string;
        notes?: string[];
        bugs?: string[];
        deprecated?: string;
        examples?: string[];
        seealso?: string[];
        members?: Record<string, string>;
        items?: Array<{ label: string; text: string }>;
    } | undefined;

    if (doc) {
        // Add separator between signature and documentation
        parts.push('\n---\n');

        // Deprecation warning (show first if present)
        if (doc.deprecated) {
            parts.push('**DEPRECATED**');
            parts.push('');
            parts.push(`> ${doc.deprecated}`);
            parts.push('');
        }

        // Main description text
        if (doc.text) {
            parts.push(doc.text);
            parts.push('');
        }

        // Parameters
        if (doc.params && Object.keys(doc.params).length > 0) {
            parts.push('**Parameters:**');
            for (const [paramName, paramDesc] of Object.entries(doc.params)) {
                parts.push(`- \`${paramName}\`: ${paramDesc}`);
            }
            parts.push('');
        }

        // Return value
        if (doc.returns) {
            parts.push(`**Returns:** ${doc.returns}`);
            parts.push('');
        }

        // Throws
        if (doc.throws) {
            parts.push(`**Throws:** ${doc.throws}`);
            parts.push('');
        }

        // Notes
        if (doc.notes && doc.notes.length > 0) {
            for (const note of doc.notes) {
                parts.push(`**Note:** ${note}`);
                parts.push('');
            }
        }

        // Examples
        if (doc.examples && doc.examples.length > 0) {
            parts.push('**Example:**');
            for (const example of doc.examples) {
                parts.push('```pike');
                parts.push(example);
                parts.push('```');
            }
            parts.push('');
        }

        // See also references
        if (doc.seealso && doc.seealso.length > 0) {
            const refs = doc.seealso.map(s => {
                if (s.startsWith('`')) return s;
                return `\`${s}\``;
            }).join(', ');
            parts.push(`**See also:** ${refs}`);
        }
    }

    return parts.join('\n');
}
