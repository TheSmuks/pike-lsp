/**
 * Parser Helper Utilities for Roxen RXML Support
 *
 * Provides position mapping and string manipulation utilities for
 * parsing embedded RXML content in Pike multiline strings.
 *
 * Phase 4 - Mixed Pike + RXML Content Support
 */

import type { Position, Range } from 'vscode-languageserver';

/**
 * Convert a character offset to line and column position.
 *
 * Similar to vscode-languageserver's Position utility but
 * works with our internal position calculations.
 *
 * @param text - Source text to calculate position in
 * @param offset - Character offset (0-indexed)
 * @returns Position with line and character (0-indexed)
 */
export function positionAt(text: string, offset: number): Position {
    let line = 0;
    let character = 0;

    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            character = 0;
        } else {
            character++;
        }
    }

    return { line, character };
}

/**
 * Convert a line and column position to character offset.
 *
 * @param text - Source text to calculate offset in
 * @param position - Position with line and character (0-indexed)
 * @returns Character offset (0-indexed)
 */
export function offsetAt(text: string, position: Position): number {
    let offset = 0;
    let currentLine = 0;

    for (let i = 0; i < text.length; i++) {
        if (currentLine === position.line) {
            return Math.min(offset + position.character, text.length);
        }

        if (text[i] === '\n') {
            currentLine++;
            offset = i + 1;
        }
    }

    // If we didn't find the line, return end of text
    return text.length;
}

/**
 * Build an array of newline offsets for O(1) line/column lookup.
 *
 * This is useful when you need to do many position calculations
 * on the same text. The returned array contains the character offset
 * of the start of each line.
 *
 * @param text - Source text to build offsets for
 * @returns Array of character offsets where each line starts
 */
export function buildLineOffsets(text: string): number[] {
    const offsets = [0];
    let offset = 0;

    while ((offset = text.indexOf('\n', offset)) !== -1) {
        offsets.push(offset + 1); // Next line starts after newline
        offset++;
    }

    return offsets;
}

/**
 * Convert character offset to position using pre-computed line offsets.
 *
 * More efficient than positionAt() when doing multiple lookups.
 *
 * @param offset - Character offset (0-indexed)
 * @param lineOffsets - Array from buildLineOffsets()
 * @returns Position with line and character (0-indexed)
 */
export function offsetToPosition(offset: number, lineOffsets: number[]): Position {
    // Binary search for the line
    let line = 0;
    let low = 0;
    let high = lineOffsets.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lineOffsets[mid]! <= offset) {
            line = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    const character = offset - (lineOffsets[line] ?? 0);
    return { line, character };
}

/**
 * Convert position to character offset using pre-computed line offsets.
 *
 * More efficient than offsetAt() when doing multiple lookups.
 *
 * @param position - Position with line and character (0-indexed)
 * @param lineOffsets - Array from buildLineOffsets()
 * @returns Character offset (0-indexed)
 */
export function positionToOffset(position: Position, lineOffsets: number[]): number {
    if (position.line >= lineOffsets.length) {
        return lineOffsets[lineOffsets.length - 1] ?? 0;
    }

    return (lineOffsets[position.line] ?? 0) + position.character;
}

/**
 * Check if a position is within a range.
 *
 * @param position - Position to check
 * @param range - Range to check against
 * @returns true if position is within or on the boundary of the range
 */
export function isPositionInRange(position: Position, range: Range): boolean {
    return (
        position.line > range.start.line ||
        (position.line === range.start.line && position.character >= range.start.character)
    ) && (
        position.line < range.end.line ||
        (position.line === range.end.line && position.character <= range.end.character)
    );
}

/**
 * Compare two positions.
 *
 * @param a - First position
 * @param b - Second position
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function comparePositions(a: Position, b: Position): number {
    if (a.line !== b.line) {
        return a.line < b.line ? -1 : 1;
    }
    if (a.character !== b.character) {
        return a.character < b.character ? -1 : 1;
    }
    return 0;
}

/**
 * Check if a range is valid (start <= end).
 *
 * @param range - Range to check
 * @returns true if the range is valid
 */
export function isValidRange(range: Range): boolean {
    return comparePositions(range.start, range.end) <= 0;
}

/**
 * Get the full text range of a document.
 *
 * @param text - Document text
 * @returns Range covering the entire document
 */
export function getFullRange(text: string): Range {
    const lines = text.split('\n');
    return {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: (lines[lines.length - 1] ?? '').length }
    };
}

/**
 * Find the position of a substring in text.
 *
 * @param text - Text to search in
 * @param substring - Substring to find
 * @param startOffset - Starting offset for search (default: 0)
 * @returns Position of the substring, or null if not found
 */
export function findSubstringPosition(
    text: string,
    substring: string,
    startOffset = 0
): Position | null {
    const offset = text.indexOf(substring, startOffset);
    if (offset === -1) {
        return null;
    }
    return positionAt(text, offset);
}

/**
 * Extract a substring from text by range.
 *
 * @param text - Source text
 * @param range - Range to extract
 * @returns The substring within the range
 */
export function extractRange(text: string, range: Range): string {
    const startOffset = offsetAt(text, range.start);
    const endOffset = offsetAt(text, range.end);
    return text.substring(startOffset, endOffset);
}

/**
 * Count lines between two positions.
 *
 * @param start - Start position
 * @param end - End position
 * @returns Number of lines (inclusive of start, exclusive of end)
 */
export function countLinesBetween(start: Position, end: Position): number {
    return end.line - start.line;
}

/**
 * Calculate the length of a line at a given line number.
 *
 * @param text - Source text
 * @param lineNumber - Line number (0-indexed)
 * @returns Length of the line, excluding the newline character
 */
export function getLineLength(text: string, lineNumber: number): number {
    const lines = text.split('\n');
    if (lineNumber < 0 || lineNumber >= lines.length) {
        return 0;
    }
    return (lines[lineNumber] ?? '').length;
}

/**
 * Convert Pike-side 1-indexed positions to LSP 0-indexed positions.
 *
 * Pike's Parser.Pike.split() returns 1-indexed positions,
 * while LSP uses 0-indexed positions.
 *
 * @param pikePosition - Position with 1-indexed line and column
 * @returns Position with 0-indexed line and character
 */
export function pikePositionToLSP(pikePosition: { line: number; column: number }): Position {
    return {
        line: Math.max(0, pikePosition.line - 1),
        character: Math.max(0, pikePosition.column - 1)
    };
}

/**
 * Convert LSP 0-indexed positions to Pike-side 1-indexed positions.
 *
 * @param lspPosition - Position with 0-indexed line and character
 * @returns Position with 1-indexed line and column
 */
export function lspPositionToPike(lspPosition: Position): { line: number; column: number } {
    return {
        line: lspPosition.line + 1,
        column: lspPosition.character + 1
    };
}

/**
 * Normalize a range by converting Pike positions to LSP positions.
 *
 * @param pikeRange - Range with 1-indexed positions
 * @returns Range with 0-indexed positions
 */
export function pikeRangeToLSP(pikeRange: {
    start: { line: number; column: number };
    end: { line: number; column: number };
}): Range {
    return {
        start: pikePositionToLSP(pikeRange.start),
        end: pikePositionToLSP(pikeRange.end)
    };
}
