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
import { getWordRangeAtPosition } from '../utils/pike-identifier.js';
import { Logger } from '@pike-lsp/core';
import { getKeywordInfo } from './keywords.js';

/**
 * Cache for hasDocumentation results to avoid repeated checks on the same symbol.
 * Uses WeakMap to allow garbage collection when symbol is no longer referenced.
 */
const documentationCache = new WeakMap<PikeSymbol, boolean>();

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

            // Get word and range at position
            const wordResult = getWordRangeAtPosition(document, params.position);
            if (!wordResult) {
                return null;
            }

            const { word, range } = wordResult;

            // 0. Check if it's a Pike keyword first (single lookup)
            const keywordInfo = getKeywordInfo(word);
            if (keywordInfo) {
                const categoryLabel = keywordInfo.category.charAt(0).toUpperCase() + keywordInfo.category.slice(1);
                const hoverContent = `**${keywordInfo.name}** (${categoryLabel})\n\n${keywordInfo.description}`;
                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: hoverContent,
                    },
                    range,
                };
            }

            // 1. Try to find symbol in local document (O(1) lookup using symbolNames index)
            let symbol = cached.symbolNames?.get(word) ?? null;
            let parentScope: string | undefined;

            // 2. If not found, try to find in stdlib
            let isStdlib = false;
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
                    isStdlib = true;
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

            // Determine content format based on documentation presence
            const hasDoc = hasDocumentation(symbol);
            const hoverResult: Hover = {
                contents: {
                    kind: hasDoc ? MarkupKind.Markdown : MarkupKind.PlainText,
                    value: content,
                },
            };

            // Include range for document symbols, omit for stdlib/synthetic symbols
            if (!isStdlib) {
                hoverResult.range = range;
            }

            return hoverResult;
        } catch (err) {
            log.error(`Hover failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    });
}

/**
 * Check if a symbol has documentation.
 * Used to determine whether to use Markdown or PlainText format.
 * Results are cached per symbol to avoid repeated checks.
 *
 * @param symbol - The symbol to check
 * @returns true if symbol has meaningful documentation
 */
function hasDocumentation(symbol: PikeSymbol): boolean {
    // Check cache first
    const cached = documentationCache.get(symbol);
    if (cached !== undefined) {
        return cached;
    }

    const sym = symbol as unknown as Record<string, unknown>;
    let result = false;

    // Case 1: Has documentation object with non-empty text
    if (sym['documentation'] && typeof sym['documentation'] === 'object') {
        const docObj = sym['documentation'] as Record<string, unknown>;
        const text = docObj['text'] as string | undefined;
        if (text && text.trim().length > 0) {
            result = true;
        }
        // Also check if doc object has other meaningful keys
        else if (Object.keys(docObj).length > 0) {
            result = true;
        }
    }

    // Case 2: Has string documentation with content
    if (!result && typeof sym['documentation'] === 'string') {
        const docStr = sym['documentation'] as string;
        if (docStr.trim().length > 0) {
            result = true;
        }
    }

    // Case 3: Has attached autodoc comment metadata
    if (!result && sym['autodoc'] && typeof sym['autodoc'] === 'object') {
        const autodocObj = sym['autodoc'] as Record<string, unknown>;
        if (Object.keys(autodocObj).length > 0) {
            result = true;
        }
    }

    // Cache the result
    documentationCache.set(symbol, result);
    return result;
}
