/**
 * Folding Range Handler
 *
 * Provides code folding regions for Pike code.
 */

import {
    Connection,
    FoldingRange,
    FoldingRangeKind,
    ResponseError,
    ErrorCodes,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Compute folding ranges for a Pike document.
 *
 * @param document - The document to analyze
 * @returns Array of folding ranges (empty array if none)
 * @throws {ResponseError} If document is invalid or parsing fails
 */
export function getFoldingRanges(document: TextDocument): FoldingRange[] {
    if (!document || !document.uri) {
        throw new ResponseError(
            ErrorCodes.InvalidRequest,
            'Document not found or invalid'
        );
    }

    try {
        const text = document.getText();
        const lines = text.split('\n');
        const foldingRanges: FoldingRange[] = [];

        const braceStack: { line: number; kind: FoldingRangeKind | undefined }[] = [];
        let commentStart: number | null = null;
        let inBlockComment = false;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum] ?? '';
            const trimmed = line.trim();

            if (!inBlockComment && trimmed.startsWith('/*')) {
                commentStart = lineNum;
                inBlockComment = true;
            }
            if (inBlockComment && trimmed.includes('*/')) {
                if (commentStart !== null && lineNum > commentStart) {
                    foldingRanges.push({
                        startLine: commentStart,
                        endLine: lineNum,
                        kind: FoldingRangeKind.Comment,
                    });
                }
                inBlockComment = false;
                commentStart = null;
            }

            if (trimmed.startsWith('//!')) {
                if (commentStart === null) {
                    commentStart = lineNum;
                }
            } else if (commentStart !== null && !trimmed.startsWith('//!') && !inBlockComment) {
                if (lineNum - 1 > commentStart) {
                    foldingRanges.push({
                        startLine: commentStart,
                        endLine: lineNum - 1,
                        kind: FoldingRangeKind.Comment,
                    });
                }
                commentStart = null;
            }

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '{') {
                    let kind: FoldingRangeKind | undefined;
                    if (trimmed.startsWith('class ') || trimmed.startsWith('inherit ')) {
                        kind = FoldingRangeKind.Region;
                    }
                    braceStack.push({ line: lineNum, kind });
                } else if (char === '}') {
                    const start = braceStack.pop();
                    if (start && lineNum > start.line) {
                        const range: FoldingRange = {
                            startLine: start.line,
                            endLine: lineNum,
                        };
                        if (start.kind) {
                            range.kind = start.kind;
                        }
                        foldingRanges.push(range);
                    }
                }
            }
        }

        // PROTOCOL FIX: Return empty array, not null (Phase 1)
        return foldingRanges;
    } catch (err) {
        // PROTOCOL FIX: Propagate errors as ResponseError (Phase 1)
        if (err instanceof ResponseError) {
            throw err; // Re-throw ResponseError as-is
        }
        throw new ResponseError(
            ErrorCodes.InternalError,
            `Parse error: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}

/**
 * Register folding range handler.
 */
export function registerFoldingRangeHandler(
    connection: Connection,
    _services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const log = new Logger('Advanced');

    /**
     * Folding Range - provide collapsible regions
     */
    connection.onFoldingRanges((params): FoldingRange[] => {
        log.debug('Folding ranges request', { uri: params.textDocument.uri });

        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        // Call extracted function (throws ResponseError on error)
        return getFoldingRanges(document!);
    });
}
