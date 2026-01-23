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
function formatPikeCode(text: string, indent: string, startLine: number = 0): TextEdit[] {
    const lines = text.split('\n');
    const edits: TextEdit[] = [];
    let indentLevel = 0;
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
        if (trimmed.endsWith('*/') || trimmed.includes('*/')) {
            inMultilineComment = false;
        }

        if (inMultilineComment || trimmed.startsWith('//') || trimmed.startsWith('*')) {
            const expectedIndent = indent.repeat(indentLevel + (pendingIndent ? 1 : 0));
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
            continue;
        }

        let extraIndent = 0;
        if (pendingIndent) {
            extraIndent = 1;
            pendingIndent = false;
        }

        if (trimmed.startsWith('}') || trimmed.startsWith(')')) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        const expectedIndent = indent.repeat(indentLevel + extraIndent);
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

        if (trimmed.endsWith('{')) {
            indentLevel++;
        } else if (trimmed.endsWith('(')) {
            indentLevel++;
        }

        const isBracelessControl = controlKeywords.some(keyword => {
            const pattern = new RegExp(`^(}\\s*)?${keyword}\\b.*\\)$`);
            return pattern.test(trimmed) && !trimmed.endsWith('{');
        });

        if (isBracelessControl || (trimmed === 'else' || trimmed === '} else')) {
            pendingIndent = true;
        }

        const openBraces = (trimmed.match(INDENT_PATTERNS.OPEN_BRACE) ?? []).length;
        const closeBraces = (trimmed.match(INDENT_PATTERNS.CLOSE_BRACE) ?? []).length;
        const netBraces = openBraces - closeBraces;

        if (netBraces < 0 && !trimmed.startsWith('}')) {
            indentLevel = Math.max(0, indentLevel + netBraces);
        }
    }

    return edits;
}
