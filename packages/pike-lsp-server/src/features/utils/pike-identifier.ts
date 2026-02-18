/**
 * Pike Identifier Utilities
 *
 * Common utilities for parsing and handling Pike identifiers.
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Range } from 'vscode-languageserver/node.js';

/**
 * Result from getWordRangeAtPosition
 */
export interface WordRangeResult {
    word: string;
    range: Range;
}

/**
 * Check if a character is a valid start of a Pike identifier.
 * Pike identifiers start with a letter or underscore only.
 *
 * @param char - Single character to check
 * @returns true if char can start a Pike identifier
 */
export function isPikeIdentifierStart(char: string): boolean {
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
export function isPikeIdentifierChar(char: string): boolean {
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
export function getWordRangeAtPosition(
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
