/**
 * On-Type Formatting Handler
 *
 * Provides automatic formatting while typing.
 * Triggers on specific characters like Enter, semicolon, closing brace.
 *
 * Issue #182: Add on-type formatting support
 */

import {
    TextEdit,
    TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register on-type formatting handler.
 */
export function registerOnTypeFormattingHandler(
     
    connection: any,
    _services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const log = new Logger('OnTypeFormatting');

    // Check if the connection supports on-type formatting
    if (typeof connection.languages.onTypeFormatting !== 'function') {
        log.debug('On-type formatting support not available in this LSP connection version');
        return;
    }

    // Characters that trigger formatting
    const triggerCharacters = ['\n', ';', '}'];

    // Register the handler
    connection.languages.onTypeFormatting(async (params): Promise<TextEdit[]> => {
        log.debug('On-type format request', {
            uri: params.textDocument.uri,
            trigger: params.ch[0],
        });

        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            return [];
        }

        const text = document.getText();
        const edits: TextEdit[] = [];
        const line = params.position.line;
        const ch = params.ch;

        // Format on newline (Enter key)
        if (ch === '\n') {
            const lineText = document.getText({
                start: { line: line - 1, character: 0 },
                end: { line: line, character: 0 },
            });

            const tabSize = Math.max(1, params.options.tabSize ?? 4);
            const insertSpaces = params.options.insertSpaces ?? true;
            const indentUnit = insertSpaces ? ' '.repeat(tabSize) : '\t';

            // Calculate indentation for the new line
            const indentColumns = calculateIndentation(lineText, text, line - 1, tabSize);
            const indent = toIndentText(indentColumns, indentUnit, tabSize, insertSpaces);
            const insertPosition = { line, character: 0 };

            if (indent.length > 0) {
                edits.push({
                    range: {
                        start: insertPosition,
                        end: insertPosition,
                    },
                    newText: indent,
                });
            }
        }

        // Format on semicolon - auto-indent current line if needed
        if (ch === ';') {
            const lineText = document.getText().split('\n')[line] ?? '';
            const trimmed = lineText.trimLeft();

            // Check if line needs extra indentation
            if (trimmed.startsWith('}') || trimmed.startsWith('{')) {
                // Closing/opening brace logic
                const currentIndent = lineText.search(/\S|$/);
                const expectedIndent = currentIndent + 2;

                edits.push({
                    range: {
                        start: { line, character: currentIndent },
                        end: { line, character: currentIndent },
                    },
                    newText: ' '.repeat(expectedIndent - currentIndent),
                });
            }
        }

        // Format on closing brace - align with opening brace
        if (ch === '}') {
            const lineText = document.getText().split('\n')[line] ?? '';

            // Find matching opening brace
            const openingBraceLine = findMatchingOpeningBrace(text, line);
            if (openingBraceLine !== null) {
                const openingLineText = text.split('\n')[openingBraceLine] ?? '';
                const openingIndent = openingLineText.search(/\S|$/);

                const currentIndent = lineText.search(/\S|$/);
                if (currentIndent !== openingIndent) {
                    edits.push({
                        range: {
                            start: { line, character: 0 },
                            end: { line, character: currentIndent },
                        },
                        newText: ' '.repeat(openingIndent),
                    });
                }
            }
        }

        log.debug('On-type format edits', { count: edits.length });
        return edits;
    }, triggerCharacters);
}

function toIndentText(indentColumns: number, indentUnit: string, tabSize: number, insertSpaces: boolean): string {
    if (indentColumns <= 0) {
        return '';
    }

    if (insertSpaces) {
        return ' '.repeat(indentColumns);
    }

    const tabs = Math.floor(indentColumns / Math.max(1, tabSize));
    return indentUnit.repeat(Math.max(0, tabs));
}

/**
 * Calculate indentation for a new line based on previous line.
 */
export function calculateIndentation(lineText: string, fullText: string, lineNum: number, tabSize: number = 2): number {
    const trimmed = lineText.trim();
    const currentIndent = getIndentColumns(lineText, tabSize);

    // Increase indent after opening brace
    if (trimmed.endsWith('{')) {
        return currentIndent + tabSize;
    }

    // Check if we're inside a parenthesized expression
    let openParens = 0;
    for (let i = 0; i <= lineNum; i++) {
        const checkLine = fullText.split('\n')[i] ?? '';
        openParens += (checkLine.match(/\(/g) || []).length;
        openParens -= (checkLine.match(/\)/g) || []).length;
    }

    if (openParens > 0) {
        // Indent to align with opening paren plus 4 spaces
        return currentIndent + (tabSize * 2);
    }

    // Otherwise maintain current indentation
    return currentIndent;
}

function getIndentColumns(lineText: string, tabSize: number): number {
    let columns = 0;
    for (const ch of lineText) {
        if (ch === ' ') {
            columns++;
            continue;
        }
        if (ch === '\t') {
            columns += tabSize;
            continue;
        }
        break;
    }
    return columns;
}

/**
 * Find the line containing the matching opening brace.
 */
export function findMatchingOpeningBrace(text: string, closingBraceLine: number): number | null {
    const lines = text.split('\n');

    // Start at 0 - we'll find the first } and increment from there
    let braceCount = 0;

    // Search backwards from the closing brace line
    for (let i = closingBraceLine; i >= 0; i--) {
        const line = lines[i] ?? '';

        // Process line in reverse to find } before {
        for (let j = line.length - 1; j >= 0; j--) {
            const char = line[j]!;
            if (char === '}') {
                braceCount++;
            } else if (char === '{') {
                braceCount--;
                if (braceCount === 0) {
                    return i;
                }
            }
        }
    }

    return null;
}
