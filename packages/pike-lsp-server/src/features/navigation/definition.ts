/**
 * Definition Handlers
 *
 * Provides go-to-definition, declaration, and type-definition navigation.
 */

import {
    Connection,
    Location,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCache } from '../../services/document-cache.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register definition handlers.
 */
export function registerDefinitionHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Navigation');

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

            // Find symbol at cursor position
            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol || !symbol.position) {
                return null;
            }

            // Check if we're clicking ON the definition itself
            // Pike uses 1-based lines, LSP uses 0-based
            const symbolLine = (symbol.position.line ?? 1) - 1;
            const isOnDefinition = symbolLine === params.position.line;

            if (isOnDefinition) {
                // User clicked on a definition - show references instead
                log.debug('Definition: cursor on definition, returning references', { symbol: symbol.name });

                const references = findReferencesForSymbol(
                    symbol.name,
                    uri,
                    document,
                    cached,
                    documentCache,
                    documents
                );

                if (references.length > 0) {
                    return references;
                }
                // No references found, return null (nothing to show)
                return null;
            }

            // Normal case: return location of symbol definition
            const line = Math.max(0, symbolLine);
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
}

/**
 * Find symbol at given position in document.
 */
function findSymbolAtPosition(
    symbols: any[],
    position: { line: number; character: number },
    document: TextDocument
): any | null {
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
    for (const symbol of symbols) {
        if (symbol.name === word) {
            return symbol;
        }
    }

    return null;
}

/**
 * Find all references to a symbol in the current and other open documents.
 * Excludes the definition itself from the results.
 */
function findReferencesForSymbol(
    symbolName: string,
    currentUri: string,
    currentDocument: TextDocument,
    cached: any,
    documentCache: DocumentCache,
    documents: TextDocuments<TextDocument>
): Location[] {
    const references: Location[] = [];
    const text = currentDocument.getText();

    // Use symbolPositions index if available (pre-computed positions)
    if (cached.symbolPositions) {
        const positions = cached.symbolPositions.get(symbolName);
        if (positions) {
            for (const pos of positions) {
                references.push({
                    uri: currentUri,
                    range: {
                        start: pos,
                        end: { line: pos.line, character: pos.character + symbolName.length },
                    },
                });
            }
        }
    }

    // Fallback: if symbolPositions didn't have results, do text-based search
    if (references.length === 0) {
        const lines = text.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line) continue;
            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(symbolName, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + symbolName.length < line.length ? line[matchIndex + symbolName.length] : ' ';

                // Check word boundaries
                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    references.push({
                        uri: currentUri,
                        range: {
                            start: { line: lineNum, character: matchIndex },
                            end: { line: lineNum, character: matchIndex + symbolName.length },
                        },
                    });
                }
                searchStart = matchIndex + 1;
            }
        }
    }

    // Search in other open documents
    for (const [otherUri, otherCached] of Array.from(documentCache.entries())) {
        if (otherUri === currentUri) continue;

        // Use symbolPositions if available
        if (otherCached.symbolPositions) {
            const positions = otherCached.symbolPositions.get(symbolName);
            if (positions) {
                for (const pos of positions) {
                    references.push({
                        uri: otherUri,
                        range: {
                            start: pos,
                            end: { line: pos.line, character: pos.character + symbolName.length },
                        },
                    });
                }
            }
        } else {
            // Fallback text search for other documents without symbolPositions
            const otherDoc = documents.get(otherUri);
            if (otherDoc) {
                const otherText = otherDoc.getText();
                const otherLines = otherText.split('\n');
                for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                    const line = otherLines[lineNum];
                    if (!line) continue;
                    let searchStart = 0;
                    let matchIndex: number;

                    while ((matchIndex = line.indexOf(symbolName, searchStart)) !== -1) {
                        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                        const afterChar = matchIndex + symbolName.length < line.length ? line[matchIndex + symbolName.length] : ' ';

                        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                            references.push({
                                uri: otherUri,
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + symbolName.length },
                                },
                            });
                        }
                        searchStart = matchIndex + 1;
                    }
                }
            }
        }
    }

    return references;
}
