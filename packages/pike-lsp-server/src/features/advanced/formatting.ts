/**
 * Document Formatting Handlers
 *
 * Provides code formatting for Pike code.
 */

import {
    Connection,
    TextEdit,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { INDENT_PATTERNS } from '../../utils/regex-patterns.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register formatting handlers.
 */
export function registerFormattingHandlers(
    connection: Connection,
    _services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const log = new Logger('Advanced');

    /**
     * Document Formatting handler - format entire document
     */
    connection.onDocumentFormatting((params): TextEdit[] => {
        log.debug('Document formatting request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return [];
            }

            const text = document.getText();
            const options = params.options;
            const tabSize = options.tabSize ?? 4;
            const insertSpaces = options.insertSpaces ?? true;
            const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

            return formatPikeCode(text, indent);
        } catch (err) {
            log.error('Document formatting failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Range Formatting handler - format selected range
     */
    connection.onDocumentRangeFormatting((params): TextEdit[] => {
        log.debug('Range formatting request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return [];
            }

            const text = document.getText();
            const options = params.options;
            const tabSize = options.tabSize ?? 4;
            const insertSpaces = options.insertSpaces ?? true;
            const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

            const lines = text.split('\n');
            const startLine = params.range.start.line;
            const endLine = params.range.end.line;

            const rangeText = lines.slice(startLine, endLine + 1).join('\n');
            const formattedEdits = formatPikeCode(rangeText, indent, startLine);

            return formattedEdits;
        } catch (err) {
            log.error('Range formatting failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });
}

/**
 * Format Pike code with Pike-style indentation
 */
export function formatPikeCode(text: string, indent: string, startLine: number = 0): TextEdit[] {
    const lines = text.split('\n');
    const edits: TextEdit[] = [];

    // Stack of indentation levels. Start with 0.
    const indentStack: number[] = [0];
    let pendingIndent = false;
    let inMultilineComment = false;

    const controlKeywords = ['if', 'else', 'while', 'for', 'foreach', 'do'];

    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i] ?? '';
        const trimmed = originalLine.trim();

        if (trimmed.length === 0) {
            if (pendingIndent) {
                pendingIndent = false;
            }
            continue;
        }

        if (trimmed.startsWith('/*')) {
            inMultilineComment = true;
        }

        const isCommentEnd = trimmed.endsWith('*/') || trimmed.includes('*/');

        // Handle comments
        if (inMultilineComment || trimmed.startsWith('//') || trimmed.startsWith('*')) {
            const currentBase = indentStack[indentStack.length - 1] ?? 0;
            const commentIndentLevel = currentBase + (pendingIndent ? 1 : 0);
            const expectedIndent = indent.repeat(commentIndentLevel);
            const currentIndent = originalLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

            if (currentIndent !== expectedIndent && !trimmed.startsWith('//!')) {
                edits.push({
                    range: {
                        start: { line: startLine + i, character: 0 },
                        end: { line: startLine + i, character: currentIndent.length }
                    },
                    newText: expectedIndent
                });
            }

            if (isCommentEnd) {
                inMultilineComment = false;
            }
            continue;
        }

        // Calculate indentation for this line
        let currentLevel = indentStack[indentStack.length - 1] ?? 0;

        // If we have a pending indent from previous line (e.g. "if (x)"), apply it
        const hadPendingIndent = pendingIndent;
        if (pendingIndent) {
            currentLevel++;
            pendingIndent = false;
        }

        // If line starts with closing brace, dedent visually
        if (trimmed.startsWith('}') || trimmed.startsWith(')')) {
             currentLevel = Math.max(0, currentLevel - 1);
        }

        const expectedIndent = indent.repeat(currentLevel);
        const currentIndent = originalLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

        if (currentIndent !== expectedIndent) {
            edits.push({
                range: {
                    start: { line: startLine + i, character: 0 },
                    end: { line: startLine + i, character: currentIndent.length }
                },
                newText: expectedIndent
            });
        }

        // Update Stack
        let trackingLevel = indentStack[indentStack.length - 1] ?? 0;
        if (hadPendingIndent) {
            trackingLevel++;
        }

        const braceRegex = /[{}]/g;
        let match: RegExpExecArray | null;
        while ((match = braceRegex.exec(originalLine)) !== null) {
            if (match[0] === '{') {
                trackingLevel++;
                indentStack.push(trackingLevel);
            } else if (match[0] === '}') {
                indentStack.pop();
                trackingLevel = indentStack[indentStack.length - 1] ?? 0;
            }
        }

        const isBracelessControl = controlKeywords.some(keyword => {
            const pattern = new RegExp(`^(}\\s*)?${keyword}\\b.*\\)$`);
            return pattern.test(trimmed) && !trimmed.endsWith('{');
        });

        if (isBracelessControl || (trimmed === 'else' || trimmed === '} else')) {
            pendingIndent = true;
        }
    }

    return edits;
}
