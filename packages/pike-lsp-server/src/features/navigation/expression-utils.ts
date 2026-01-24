/**
 * Expression Utilities
 *
 * Extracts and analyzes Pike expressions at cursor position.
 * Handles module paths (Stdio.File) and member access (file->read).
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Position } from 'vscode-languageserver/node.js';
import type { ExpressionInfo } from '@pike-lsp/pike-bridge';

/**
 * Extract full expression at cursor position.
 *
 * Handles dotted module paths (Stdio.File, Parser.Pike.split) and
 * arrow member access (file->read, mapping->key).
 *
 * @param document - The document to analyze
 * @param position - Cursor position in the document
 * @returns ExpressionInfo or null if cursor is on whitespace/unknown
 */
export function extractExpressionAtPosition(
    document: TextDocument,
    position: Position
): ExpressionInfo | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find word boundaries at cursor position
    const wordAtCursor = findWordAtOffset(text, offset);
    if (!wordAtCursor) {
        return null;
    }

    // Find the full extent of the dotted/arrows expression containing the cursor
    const bounds = findExpressionBounds(text, wordAtCursor.start, wordAtCursor.end);

    const fullText = text.slice(bounds.start, bounds.end).trim();

    return parseExpression(fullText, bounds.start, bounds.end);
}

/**
 * Find the word (identifier) at the given offset.
 */
function findWordAtOffset(
    text: string,
    offset: number
): { text: string; start: number; end: number } | null {
    if (offset < 0 || offset >= text.length) {
        return null;
    }

    // Check if we're on a non-word character
    const currentChar = text[offset] ?? '';
    if (!isWordChar(currentChar)) {
        return null;
    }

    // Find word start
    let start = offset;
    while (start > 0 && isWordChar(text[start - 1] ?? '')) {
        start--;
    }

    // Find word end
    let end = offset;
    while (end < text.length && isWordChar(text[end] ?? '')) {
        end++;
    }

    const word = text.slice(start, end);
    if (!word) {
        return null;
    }

    return { text: word, start, end };
}

/**
 * Find the full extent of an expression (module path or member access)
 * containing the given word boundaries.
 */
function findExpressionBounds(
    text: string,
    wordStart: number,
    wordEnd: number
): { start: number; end: number } {
    let start = wordStart;
    let end = wordEnd;

    // Scan left to find the start of the expression
    while (start > 0) {
        // Skip whitespace
        while (start > 0 && isWhitespace(text[start - 1] ?? '')) {
            start--;
        }

        // Check for arrow operator "->" (note: '>' comes first when scanning left)
        if (start >= 2 && text[start - 1] === '>' && text[start - 2] === '-') {
            start -= 2; // Skip "->"

            // Skip whitespace before arrow
            while (start > 0 && isWhitespace(text[start - 1] ?? '')) {
                start--;
            }

            // Find the identifier before the arrow
            let idEnd = start;
            while (start > 0 && isWordChar(text[start - 1] ?? '')) {
                start--;
            }

            if (start < idEnd) {
                continue;
            }
            break;
        }

        // Check for dot operator "."
        if (start >= 1 && text[start - 1] === '.') {
            start--; // Skip "."

            // Skip whitespace after dot (shouldn't be there, but handle it)
            while (start > 0 && isWhitespace(text[start - 1] ?? '')) {
                start--;
            }

            // Find the identifier before the dot
            let idEnd = start;
            while (start > 0 && isWordChar(text[start - 1] ?? '')) {
                start--;
            }

            if (start < idEnd) {
                continue;
            }
            break;
        }

        // No more operators
        break;
    }

    // Scan right to find the end of the expression
    while (end < text.length) {
        // Skip whitespace
        while (end < text.length && isWhitespace(text[end] ?? '')) {
            end++;
        }

        // Check for arrow operator "->"
        if (end + 1 < text.length && (text[end] ?? '') === '-' && (text[end + 1] ?? '') === '>') {
            end += 2; // Skip "->"

            // Skip whitespace after arrow
            while (end < text.length && isWhitespace(text[end] ?? '')) {
                end++;
            }

            // Find the identifier after the arrow
            let idStart = end;
            while (end < text.length && isWordChar(text[end] ?? '')) {
                end++;
            }

            if (end > idStart) {
                continue;
            }
            break;
        }

        // Check for dot operator "."
        if (end < text.length && (text[end] ?? '') === '.') {
            // First check if there's an identifier after the dot
            let afterDot = end + 1;

            // Skip whitespace after dot
            while (afterDot < text.length && isWhitespace(text[afterDot] ?? '')) {
                afterDot++;
            }

            // Check if there's a word character after the dot
            if (afterDot < text.length && isWordChar(text[afterDot] ?? '')) {
                end++; // Skip "."
                end = afterDot; // Skip to the identifier start

                // Find the identifier after the dot
                while (end < text.length && isWordChar(text[end] ?? '')) {
                    end++;
                }
                continue;
            }
            // No identifier after the dot, stop here
            break;
        }

        // Check for parentheses - stop at them (end of function call like Stdio.File())
        const endChar = text[end] ?? '';
        if (end < text.length && (endChar === '(' || endChar === ')' || endChar === ',' || endChar === ';')) {
            break;
        }

        // No more relevant operators
        break;
    }

    // Trim trailing whitespace from end position
    while (end > start && isWhitespace(text[end - 1] ?? '')) {
        end--;
    }

    return { start, end };
}

/**
 * Parse the extracted expression into structured components.
 */
function parseExpression(
    expression: string,
    startOffset: number,
    endOffset: number
): ExpressionInfo {
    // Check for arrow operator (member access)
    const arrowIndex = expression.lastIndexOf('->');
    if (arrowIndex !== -1) {
        const base = expression.slice(0, arrowIndex).trim();
        const member = expression.slice(arrowIndex + 2).trim();
        return {
            fullPath: expression,
            base,
            member: member || null,
            operator: '->',
            isModulePath: false,
            range: { start: startOffset, end: endOffset },
        };
    }

    // Check for dot operator (module path or member access)
    const lastDotIndex = expression.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        const base = expression.slice(0, lastDotIndex).trim();
        const member = expression.slice(lastDotIndex + 1).trim();

        // Determine if this is a module path (has dots in base)
        const isModulePath = base.includes('.');

        return {
            fullPath: expression,
            base,
            member: member || null,
            operator: '.',
            isModulePath,
            range: { start: startOffset, end: endOffset },
        };
    }

    // Simple identifier
    return {
        fullPath: expression,
        base: expression,
        member: null,
        operator: null,
        isModulePath: false,
        range: { start: startOffset, end: endOffset },
    };
}

/**
 * Check if a character is a word character (for identifiers).
 */
function isWordChar(char: string): boolean {
    if (!char) return false;
    const code = char.charCodeAt(0);
    // Allow letters, digits, and underscore
    return (
        (code >= 48 && code <= 57) || // 0-9
        (code >= 65 && code <= 90) || // A-Z
        (code >= 97 && code <= 122) || // a-z
        code === 95 // underscore
    );
}

/**
 * Check if a character is whitespace.
 */
function isWhitespace(char: string): boolean {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || code === 32; // TAB, LF, CR, SPACE
}
