/**
 * Code Actions Handler
 *
 * Provides quick fixes and refactorings for Pike code.
 */

import {
    Connection,
    CodeAction,
    CodeActionKind,
    TextEdit,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register code actions handler.
 */
export function registerCodeActionsHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Advanced');

    /**
     * Code Action handler - provide quick fixes and refactorings
     */
    connection.onCodeAction((params): CodeAction[] => {
        log.debug('Code action request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);
            const cached = documentCache.get(uri);

            if (!document || !cached) {
                return [];
            }

            const actions: CodeAction[] = [];
            const text = document.getText();
            const lines = text.split('\n');

            const startLine = params.range.start.line;
            const lineText = lines[startLine] ?? '';
            const trimmed = lineText.trim();

            if (trimmed.startsWith('inherit') || trimmed.startsWith('import') ||
                trimmed.startsWith('#include')) {

                const importLines: { line: number; text: string; type: string }[] = [];
                for (let i = 0; i < lines.length; i++) {
                    const lt = (lines[i] ?? '').trim();
                    if (lt.startsWith('inherit ')) {
                        importLines.push({ line: i, text: lines[i] ?? '', type: 'inherit' });
                    } else if (lt.startsWith('import ')) {
                        importLines.push({ line: i, text: lines[i] ?? '', type: 'import' });
                    } else if (lt.startsWith('#include ')) {
                        importLines.push({ line: i, text: lines[i] ?? '', type: 'include' });
                    }
                }

                if (importLines.length > 1) {
                    const sorted = [...importLines].sort((a, b) => {
                        const typeOrder = { include: 0, import: 1, inherit: 2 };
                        const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? 3;
                        const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? 3;
                        if (typeA !== typeB) return typeA - typeB;
                        return a.text.localeCompare(b.text);
                    });

                    const needsSort = importLines.some((item, i) => item.text !== sorted[i]?.text);

                    if (needsSort) {
                        const edits: TextEdit[] = [];
                        for (let i = 0; i < importLines.length; i++) {
                            const original = importLines[i];
                            const replacement = sorted[i];
                            if (original && replacement && original.text !== replacement.text) {
                                edits.push({
                                    range: {
                                        start: { line: original.line, character: 0 },
                                        end: { line: original.line, character: original.text.length }
                                    },
                                    newText: replacement.text
                                });
                            }
                        }

                        if (edits.length > 0) {
                            actions.push({
                                title: 'Organize Imports',
                                kind: CodeActionKind.SourceOrganizeImports,
                                edit: {
                                    changes: {
                                        [uri]: edits
                                    }
                                }
                            });
                        }
                    }
                }
            }

            for (const diag of params.context.diagnostics) {
                if (diag.message.includes('syntax error') || diag.message.includes('expected')) {
                    const diagLine = lines[diag.range.start.line] ?? '';
                    if (!diagLine.trim().endsWith(';') && !diagLine.trim().endsWith('{') &&
                        !diagLine.trim().endsWith('}')) {
                        actions.push({
                            title: 'Add missing semicolon',
                            kind: CodeActionKind.QuickFix,
                            diagnostics: [diag],
                            edit: {
                                changes: {
                                    [uri]: [{
                                        range: {
                                            start: { line: diag.range.start.line, character: diagLine.length },
                                            end: { line: diag.range.start.line, character: diagLine.length }
                                        },
                                        newText: ';'
                                    }]
                                }
                            }
                        });
                    }
                }
            }

            return actions;
        } catch (err) {
            log.error('Code action failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });
}
