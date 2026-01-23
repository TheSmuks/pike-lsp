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
}

/**
 * Find symbol at given position in document.
 */
function findSymbolAtPosition(
    symbols: PikeSymbol[],
    position: { line: number; character: number },
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
