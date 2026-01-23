/**
 * Folding Range Handler
 *
 * Provides code folding regions for Pike code.
 */

import {
    Connection,
    FoldingRange,
    FoldingRangeKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

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
    connection.onFoldingRanges((params): FoldingRange[] | null => {
        log.debug('Folding ranges request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return null;
            }

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

            return foldingRanges.length > 0 ? foldingRanges : null;
        } catch (err) {
            log.error('Folding ranges failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });
}
