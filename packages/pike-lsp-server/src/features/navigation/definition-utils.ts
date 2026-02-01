/**
 * Definition Utils
 *
 * Pure utility functions for go-to-definition functionality.
 * Extracted from definition.ts for testability.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * Get word at position in document.
 * Extracts the complete word (identifier) at the given position.
 *
 * @param document - The text document
 * @param position - The position in the document (0-based)
 * @returns The word at position, or null if no word found
 */
export function getWordAtPosition(
    document: TextDocument,
    position: { line: number; character: number }
): string | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Validate offset is within document
    if (offset < 0 || offset >= text.length) {
        return null;
    }

    let start = offset;
    let end = offset;

    // Expand start backwards to find word boundary
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }

    // Expand end forwards to find word boundary
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    const word = text.slice(start, end);
    return word || null;
}

/**
 * Find symbol with matching name in collection.
 * Searches recursively through children.
 *
 * @param symbols - Array of symbols to search
 * @param name - Name of symbol to find
 * @returns The matching symbol, or null if not found
 */
export function findSymbolInCollection(
    symbols: PikeSymbol[],
    name: string
): PikeSymbol | null {
    for (const symbol of symbols) {
        if (symbol.name === name) {
            return symbol;
        }
        if (symbol.children && symbol.children.length > 0) {
            const found = findSymbolInCollection(symbol.children, name);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Check if cursor position is on a symbol's definition line.
 *
 * @param symbol - The symbol to check
 * @param cursorLine - The cursor line number (0-based)
 * @returns True if cursor is on the symbol's definition
 */
export function isCursorOnDefinition(
    symbol: PikeSymbol,
    cursorLine: number
): boolean {
    if (!symbol.position) {
        return false;
    }

    // Pike uses 1-based lines, LSP uses 0-based
    const symbolLine = (symbol.position.line ?? 1) - 1;
    return symbolLine === cursorLine;
}

/**
 * Resolve a relative file path against a base file.
 *
 * @param basePath - The base file path (absolute)
 * @param relativePath - The relative path to resolve
 * @returns The resolved absolute path
 */
export function resolveRelativePath(
    basePath: string,
    relativePath: string
): string {
    // Get directory of base file
    const baseDir = basePath.split('/').slice(0, -1).join('/');

    // Split relative path into components
    const parts = relativePath.split('/');

    // Build absolute path
    const result: string[] = [];
    for (const part of parts) {
        if (part === '..') {
            // Go up one directory
            result.pop();
        } else if (part !== '.') {
            // Ignore '.' (current directory)
            result.push(part);
        }
    }

    // Combine with base directory
    return baseDir ? `${baseDir}/${result.join('/')}` : result.join('/');
}

/**
 * Build Location object for a symbol.
 *
 * @param uri - The document URI
 * @param symbol - The symbol
 * @returns Location object or null
 */
export function buildLocationForSymbol(
    uri: string,
    symbol: PikeSymbol
): { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } | null {
    if (!symbol.position) {
        return null;
    }

    const line = Math.max(0, (symbol.position.line ?? 1) - 1);
    const name = symbol.name || symbol.classname || "";

    return {
        uri,
        range: {
            start: { line, character: 0 },
            end: { line, character: name.length },
        },
    };
}

/**
 * Find all occurrences of a word in document text.
 * Returns positions with word boundary checking.
 *
 * @param text - The document text
 * @param word - The word to search for
 * @returns Array of line numbers where word appears
 */
export function findWordOccurrences(
    text: string,
    word: string
): number[] {
    const lines = text.split('\n');
    const occurrences: number[] = [];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;

        let searchStart = 0;
        let matchIndex: number;

        while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
            const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
            const afterChar = matchIndex + word.length < line.length
                ? line[matchIndex + word.length]
                : ' ';

            // Check word boundaries
            if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                occurrences.push(lineNum);
            }
            searchStart = matchIndex + 1;
        }
    }

    return occurrences;
}
