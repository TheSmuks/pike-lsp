/**
 * Selection Ranges Handler
 *
 * Provides smart selection expansion for Pike code.
 */

import {
    Connection,
    SelectionRange,
    Position,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * Find symbol at position in hierarchical symbol tree
 */
function findSymbolAtPosition(
    symbols: PikeSymbol[],
    position: Position
): PikeSymbol | null {
    for (const symbol of symbols) {
        if (!symbol.range) continue;

        // Check if position is within symbol's range
        const inRange =
            position.line >= symbol.range.start.line &&
            position.line <= symbol.range.end.line &&
            (position.line === symbol.range.start.line
                ? position.character >= symbol.range.start.character
                : true) &&
            (position.line === symbol.range.end.line
                ? position.character <= symbol.range.end.character
                : true);

        if (inRange) {
            // Check children first (more specific)
            if (symbol.children && symbol.children.length > 0) {
                const childMatch = findSymbolAtPosition(symbol.children, position);
                if (childMatch) return childMatch;
            }
            return symbol;
        }
    }
    return null;
}

/**
 * Build selection range hierarchy from symbol and its parent chain
 */
function buildSymbolHierarchy(
    symbol: PikeSymbol | null,
    document: TextDocument,
    position: Position,
    _services: Services,
    _uri: string
): SelectionRange | null {
    if (!symbol) {
        return null;
    }

    // Build the range for this symbol
    const symbolRange: SelectionRange = {
        range: symbol.range || symbol.selectionRange || {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
        }
    };

    // If symbol has selectionRange (identifier only), create word-level range
    if (symbol.selectionRange) {
        const wordRange: SelectionRange = {
            range: symbol.selectionRange,
            parent: symbolRange
        };

        // Check if we're at the identifier level
        const offset = document.offsetAt(position);
        const text = document.getText();
        let wordStart = offset;
        let wordEnd = offset;

        // Find word boundaries using character scanning (ADR-001: this is NOT parsing)
        while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
            wordStart--;
        }
        while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
            wordEnd++;
        }

        // Use the word boundary if it's smaller than selectionRange
        const wordBoundary = {
            start: document.positionAt(wordStart),
            end: document.positionAt(wordEnd)
        };

        // If position is within the identifier, use the more precise word range
        if (wordBoundary.start.line === symbol.selectionRange.start.line &&
            wordBoundary.start.character >= symbol.selectionRange.start.character &&
            wordBoundary.end.character <= symbol.selectionRange.end.character) {
            wordRange.range = wordBoundary;
        }

        return wordRange;
    }

    return symbolRange;
}

/**
 * Register selection ranges handler.
 */
export function registerSelectionRangesHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const log = new Logger('Advanced');

    /**
     * Selection Range - smart selection expansion with semantic analysis
     */
    connection.onSelectionRanges(async (params): Promise<SelectionRange[] | null> => {
        log.debug('Selection ranges request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return null;
            }

            const text = document.getText();
            const results: SelectionRange[] = [];

            // Phase 1: Try semantic ranges from documentCache
            const cached = services.documentCache.get(uri);

            for (const position of params.positions) {
                let semanticRange: SelectionRange | null = null;

                // If we have cached symbols, use semantic analysis
                if (cached?.symbols) {
                    const symbol = findSymbolAtPosition(cached.symbols, position);
                    if (symbol) {
                        semanticRange = buildSymbolHierarchy(symbol, document, position, services, uri);
                        log.debug('Found semantic range from symbol', {
                            symbol: symbol.name,
                            kind: symbol.kind
                        });
                    }
                }

                // Fallback to heuristic if no semantic range found
                if (!semanticRange) {
                    const offset = document.offsetAt(position);

                    let wordStart = offset;
                    let wordEnd = offset;
                    while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
                        wordStart--;
                    }
                    while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
                        wordEnd++;
                    }

                    let lineStart = offset;
                    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
                        lineStart--;
                    }
                    let lineEnd = offset;
                    while (lineEnd < text.length && text[lineEnd] !== '\n') {
                        lineEnd++;
                    }

                    // Build selection range hierarchy: word → line → document
                    // Parent points to the LARGER enclosing range
                    const docRange: SelectionRange = {
                        range: {
                            start: { line: 0, character: 0 },
                            end: document.positionAt(text.length),
                        },
                    };

                    const lineRange: SelectionRange = {
                        range: {
                            start: document.positionAt(lineStart),
                            end: document.positionAt(lineEnd),
                        },
                        parent: docRange,
                    };

                    semanticRange = {
                        range: {
                            start: document.positionAt(wordStart),
                            end: document.positionAt(wordEnd),
                        },
                        parent: lineRange,
                    };
                }

                if (semanticRange) {
                    results.push(semanticRange);
                }
            }

            return results.length > 0 ? results : null;
        } catch (err) {
            log.error('Selection ranges failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });
}
