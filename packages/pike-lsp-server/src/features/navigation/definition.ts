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
