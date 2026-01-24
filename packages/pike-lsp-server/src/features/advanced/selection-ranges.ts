/**
 * Selection Ranges Handler
 *
 * Provides smart selection expansion for Pike code.
 */

import {
    Connection,
    SelectionRange,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register selection ranges handler.
 */
export function registerSelectionRangesHandler(
    connection: Connection,
    _services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const log = new Logger('Advanced');

    /**
     * Selection Range - smart selection expansion
     */
    connection.onSelectionRanges((params): SelectionRange[] | null => {
        log.debug('Selection ranges request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return null;
            }

            const text = document.getText();
            const results: SelectionRange[] = [];

            for (const position of params.positions) {
                const offset = document.offsetAt(position);

                let wordStart = offset;
                let wordEnd = offset;
                while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
                    wordStart--;
                }
                while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
                    wordEnd++;
                }

                let lineStart = offset;
                while (lineStart > 0 && text[lineStart - 1] !== '\n') {
                    lineStart--;
                }
                let lineEnd = offset;
                while (lineEnd < text.length && text[lineEnd] !== '\n') {
                    lineEnd++;
                }

                // Build selection range hierarchy: word → line → document
                // Parent points to the LARGER enclosing range
                const docRange: SelectionRange = {
                    range: {
                        start: { line: 0, character: 0 },
                        end: document.positionAt(text.length),
                    },
                };

                const lineRange: SelectionRange = {
                    range: {
                        start: document.positionAt(lineStart),
                        end: document.positionAt(lineEnd),
                    },
                    parent: docRange,
                };

                const wordRange: SelectionRange = {
                    range: {
                        start: document.positionAt(wordStart),
                        end: document.positionAt(wordEnd),
                    },
                    parent: lineRange,
                };

                results.push(wordRange);
            }

            return results.length > 0 ? results : null;
        } catch (err) {
            log.error('Selection ranges failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });
}
