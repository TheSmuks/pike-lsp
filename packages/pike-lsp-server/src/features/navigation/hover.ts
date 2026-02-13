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
 * Result from getWordRangeAtPosition
 */
interface WordRangeResult {
    word: string;
    range: import('vscode-languageserver/node.js').Range;
}

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

            // 1. Try to find symbol in local document
            let symbol = findSymbolInCollection(cached.symbols, word);
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
            log.error('Hover failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });
}

/**
 * Check if a character is a valid start of a Pike identifier.
 * Pike identifiers start with a letter or underscore only.
 *
 * @param char - Single character to check
 * @returns true if char can start a Pike identifier
 */
function isPikeIdentifierStart(char: string): boolean {
    // First character: letter or underscore only
    return /^[a-zA-Z_]$/.test(char);
}

/**
 * Check if a character is valid within a Pike identifier.
 * Pike identifier characters are letters, digits, or underscores.
 *
 * @param char - Single character to check
 * @returns true if char is valid in a Pike identifier
 */
function isPikeIdentifierChar(char: string): boolean {
    // Subsequent characters: letter, digit, or underscore
    return /^[a-zA-Z0-9_]$/.test(char);
}

/**
 * Get word and range at position in document.
 * Respects Pike identifier rules for boundary detection.
 *
 * @param document - The text document
 * @param position - Position in the document
 * @returns Object with word and range, or null if no identifier found
 */
function getWordRangeAtPosition(
    document: TextDocument,
    position: { line: number; character: number }
): WordRangeResult | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    if (offset < 0 || offset >= text.length) {
        return null;
    }

    let start = offset;
    let end = offset;

    // Scan backward to find identifier start
    // Must respect Pike identifier rules: first char must be letter or underscore
    while (start > 0) {
        const prevChar = text[start - 1] ?? '';
        if (!isPikeIdentifierChar(prevChar)) {
            // Not an identifier character - we found a boundary
            break;
        }
        // Check if this would be a valid identifier start
        if (start === offset || isPikeIdentifierStart(text[start] ?? '')) {
            start--;
        } else {
            // This character is an identifier char but the one at 'start' isn't valid start
            // This means we hit a digit prefix like "123abc" - we should stop before the digit
            break;
        }
    }

    // Verify the start is actually a valid identifier start
    if (start < text.length && !isPikeIdentifierStart(text[start] ?? '')) {
        // The character at 'start' isn't valid (e.g., a digit)
        // We're likely on an invalid identifier - return null or try to find valid part
        // For now, return null to avoid false matches on invalid identifiers
        return null;
    }

    // Scan forward to find identifier end
    while (end < text.length && isPikeIdentifierChar(text[end] ?? '')) {
        end++;
    }

    if (start === end) {
        return null;
    }

    const word = text.slice(start, end);

    // Convert offsets back to positions
    const range = {
        start: document.positionAt(start),
        end: document.positionAt(end),
    };

    return { word, range };
}

/**
 * Check if a symbol has documentation.
 * Used to determine whether to use Markdown or PlainText format.
 *
 * @param symbol - The symbol to check
 * @returns true if symbol has meaningful documentation
 */
function hasDocumentation(symbol: PikeSymbol): boolean {
    const sym = symbol as unknown as Record<string, unknown>;

    // Case 1: Has documentation object with non-empty text
    if (sym['documentation'] && typeof sym['documentation'] === 'object') {
        const docObj = sym['documentation'] as Record<string, unknown>;
        const text = docObj['text'] as string | undefined;
        if (text && text.trim().length > 0) {
            return true;
        }
        // Also check if doc object has other meaningful keys
        if (Object.keys(docObj).length > 0) {
            return true;
        }
    }

    // Case 2: Has string documentation with content
    if (typeof sym['documentation'] === 'string') {
        const docStr = sym['documentation'] as string;
        if (docStr.trim().length > 0) {
            return true;
        }
    }

    // Case 3: Has attached autodoc comment metadata
    if (sym['autodoc'] && typeof sym['autodoc'] === 'object') {
        const autodocObj = sym['autodoc'] as Record<string, unknown>;
        if (Object.keys(autodocObj).length > 0) {
            return true;
        }
    }

    return false;
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
