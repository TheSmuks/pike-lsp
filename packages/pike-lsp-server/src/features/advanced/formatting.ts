/**
 * Document Formatting Handlers
 *
 * Provides code formatting for Pike code.
 */

import {
    Connection,
    TextEdit,
    ResponseError,
    ErrorCodes,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { INDENT_PATTERNS } from '../../utils/regex-patterns.js';
import { Logger } from '@pike-lsp/core';

/**
 * Validate formatting options
 * @throws {ResponseError} If options are invalid
 */
function validateFormattingOptions(options: { tabSize?: number; insertSpaces?: boolean }): void {
    const { tabSize, insertSpaces } = options;

    // Validate tabSize: must be a positive number (1-16)
    if (tabSize !== undefined) {
        if (typeof tabSize !== 'number') {
            throw new ResponseError(
                ErrorCodes.InvalidParams,
                `tabSize must be a number, got: ${typeof tabSize}`
            );
        }
        if (tabSize < 1 || tabSize > 16) {
            throw new ResponseError(
                ErrorCodes.InvalidParams,
                `tabSize must be between 1 and 16, got: ${tabSize}`
            );
        }
    }

    // Validate insertSpaces: must be a boolean
    if (insertSpaces !== undefined && typeof insertSpaces !== 'boolean') {
        throw new ResponseError(
            ErrorCodes.InvalidParams,
            `insertSpaces must be a boolean, got: ${typeof insertSpaces}`
        );
    }
}

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

        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            throw new ResponseError(
                ErrorCodes.InvalidRequest,
                `Document not found: ${uri}`
            );
        }

        try {
            validateFormattingOptions(params.options);

            const text = document.getText();
            const options = params.options;
            const tabSize = options.tabSize ?? 4;
            const insertSpaces = options.insertSpaces ?? true;
            const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

            return formatPikeCode(text, indent);
        } catch (err) {
            if (err instanceof ResponseError) {
                // Re-throw ResponseError as-is (validation errors)
                throw err;
            }
            log.error(`Document formatting failed for ${uri}: ${err instanceof Error ? err.message : String(err)}`);
            throw new ResponseError(
                ErrorCodes.InternalError,
                `Document formatting failed: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    });

    /**
     * Range Formatting handler - format selected range
     */
    connection.onDocumentRangeFormatting((params): TextEdit[] => {
        log.debug('Range formatting request', { uri: params.textDocument.uri });

        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            throw new ResponseError(
                ErrorCodes.InvalidRequest,
                `Document not found: ${uri}`
            );
        }

        try {
            validateFormattingOptions(params.options);

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
            if (err instanceof ResponseError) {
                // Re-throw ResponseError as-is (validation errors)
                throw err;
            }
            log.error(`Range formatting failed for ${uri} (lines ${params.range.start.line + 1}-${params.range.end.line + 1}): ${err instanceof Error ? err.message : String(err)}`);
            throw new ResponseError(
                ErrorCodes.InternalError,
                `Range formatting failed: ${err instanceof Error ? err.message : String(err)}`
            );
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
    let inMultilineString = false; // Issue #102: Handle Pike's #"..."# multi-line strings
    let switchBaseLevel: number | null = null; // Store the level of the switch's opening brace
    let caseExtraIndent = false; // Track if we need extra indent after a case label

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

        // Issue #102: Handle Pike multi-line strings (#" ... "#)
        if (trimmed.startsWith('#"') && !trimmed.endsWith('"#')) {
            inMultilineString = true;
        } else if (trimmed.endsWith('"#')) {
            inMultilineString = false;
        }

        // Skip formatting for multi-line string content (preserve as-is)
        if (inMultilineString) {
            continue;
        }

        if (trimmed.startsWith('/*')) {
            inMultilineComment = true;
        }

        const isCommentEnd = trimmed.endsWith('*/') || trimmed.includes('*/');

        // Handle comments
        if (inMultilineComment || trimmed.startsWith('//') || trimmed.startsWith('*')) {
            let commentIndentLevel = indentStack[indentStack.length - 1] ?? 0;
            if (pendingIndent) {
                commentIndentLevel++;
            }
            if (caseExtraIndent) {
                commentIndentLevel++;
            }
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

        // Check if this line is a case/default label
        const isCaseLabel = /^(case\s+[^:]+|default\s*):/.test(trimmed);

        // Calculate indentation for this line
        let currentLevel = indentStack[indentStack.length - 1] ?? 0;

        // If we have a pending indent from previous line (e.g. "if (x)"), apply it
        const hadPendingIndent = pendingIndent;
        if (pendingIndent) {
            currentLevel++;
            pendingIndent = false;
        }

        // Check if this line starts a switch statement - detect AFTER checking for case/break
        // We need to know we're in a switch before we process the {
        if (/^switch\s*\(/.test(trimmed) && switchBaseLevel === null) {
            // Mark that we're entering a switch - the actual base level will be set
            // after the { is processed
            switchBaseLevel = -1; // Sentinel value - will be set after { processing
        }

        // In switch: case/default should be at same level as the opening brace
        // The body after case: should be indented one more
        if (switchBaseLevel !== null && switchBaseLevel > 0 && isCaseLabel) {
            // case/default at the stored switch base level
            currentLevel = switchBaseLevel;
            // After a case label, the next line gets extra indent
            caseExtraIndent = true;
        } else if (caseExtraIndent) {
            // Body of case gets extra indent (switch base level + 1)
            if (switchBaseLevel !== null && switchBaseLevel > 0) {
                currentLevel = switchBaseLevel + 1;
            } else {
                currentLevel++;
            }
            // Reset extra indent after one line unless it's another case/default
            if (!isCaseLabel) {
                caseExtraIndent = false;
            }
        }

        // If line starts with closing brace, dedent visually
        if (trimmed.startsWith('}') || trimmed.startsWith(')')) {
             currentLevel = Math.max(0, currentLevel - 1);
        }

        // Check if we're exiting a switch
        if (trimmed.startsWith('}') && switchBaseLevel !== null) {
            switchBaseLevel = null;
            caseExtraIndent = false;
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
                // If this { ends a switch(...) line, set the switch base level
                if (switchBaseLevel === -1) {
                    // The switch base level is the level where the { is (trackingLevel - 1)
                    // case/break should be at this same level as the {
                    switchBaseLevel = trackingLevel - 1;
                }
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
