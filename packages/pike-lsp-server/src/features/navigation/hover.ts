/**
 * Hover Handler
 *
 * Provides type information and documentation on hover.
 */

import {
    Connection,
    Hover,
    MarkupKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { buildHoverContent } from '../utils/hover-builder.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register hover handler.
 */
export function registerHoverHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache, stdlibIndex } = services;
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

            // Get word at position
            const word = getWordAtPosition(document, params.position);
            if (!word) {
                return null;
            }

            // 1. Try to find symbol in local document
            let symbol = findSymbolInCollection(cached.symbols, word);
            let parentScope: string | undefined;

            // 2. If not found, try to find in stdlib
            if (!symbol && stdlibIndex) {
                // Check if it's a known module
                const moduleInfo = await stdlibIndex.getModule(word);
                if (moduleInfo) {
                    // Create a synthetic symbol for the module
                    symbol = {
                        name: word,
                        kind: 'module',
                        // We don't have location info for stdlib modules in the editor
                        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                        selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                        children: [],
                        modifiers: []
                    } as unknown as PikeSymbol;
                }
            }

            if (!symbol) {
                return null;
            }

            // Build hover content
            const content = buildHoverContent(symbol, parentScope);
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
}

/**
 * Get word at position in document.
 */
function getWordAtPosition(document: TextDocument, position: { line: number; character: number }): string | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    let start = offset;
    let end = offset;

    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    const word = text.slice(start, end);
    return word || null;
}

/**
 * Find symbol with matching name in collection.
 * Prioritizes non-variant symbols over variant symbols.
 */
function findSymbolInCollection(symbols: PikeSymbol[], name: string): PikeSymbol | null {
    // First pass: find non-variant symbols
    for (const symbol of symbols) {
        if (symbol.name === name && !symbol.modifiers?.includes('variant')) {
            return symbol;
        }
        if (symbol.children) {
            const found = findSymbolInCollection(symbol.children, name);
            if (found && !found.modifiers?.includes('variant')) {
                return found;
            }
        }
    }

    // Second pass: if no non-variant found, return variant (for completeness)
    for (const symbol of symbols) {
        if (symbol.name === name) {
            return symbol;
        }
        if (symbol.children) {
            const found = findSymbolInCollection(symbol.children, name);
            if (found) return found;
        }
    }

    return null;
}
