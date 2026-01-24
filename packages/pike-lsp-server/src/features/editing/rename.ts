/**
 * Rename Handlers
 *
 * Provides prepare rename and rename operations for Pike code.
 */

import {
    Connection,
    Range,
    TextEdit,
    TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import type { Services } from '../../services/index.js';

/**
 * Register rename handlers.
 */
export function registerRenameHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { logger, documentCache, workspaceIndex } = services;

    /**
     * Prepare rename handler - check if rename is allowed
     */
    connection.onPrepareRename((params): Range | null => {
        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            return null;
        }

        const text = document.getText();
        const offset = document.offsetAt(params.position);

        // Find word boundaries
        let start = offset;
        let end = offset;
        while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
            start--;
        }
        while (end < text.length && /\w/.test(text[end] ?? '')) {
            end++;
        }

        if (start === end) {
            return null;
        }

        return {
            start: document.positionAt(start),
            end: document.positionAt(end),
        };
    });

    /**
     * Rename handler - rename symbol across files
     */
    connection.onRenameRequest((params): { changes: { [uri: string]: TextEdit[] } } | null => {
        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            return null;
        }

        const text = document.getText();
        const offset = document.offsetAt(params.position);

        // Find the word to rename
        let start = offset;
        let end = offset;
        while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
            start--;
        }
        while (end < text.length && /\w/.test(text[end] ?? '')) {
            end++;
        }

        const oldName = text.slice(start, end);
        if (!oldName) {
            return null;
        }

        const newName = params.newName;
        const changes: { [uri: string]: TextEdit[] } = {};

        // Replace all occurrences in current document
        const edits: TextEdit[] = [];
        const lines = text.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line) continue;
            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    edits.push({
                        range: {
                            start: { line: lineNum, character: matchIndex },
                            end: { line: lineNum, character: matchIndex + oldName.length },
                        },
                        newText: newName,
                    });
                }
                searchStart = matchIndex + 1;
            }
        }

        if (edits.length > 0) {
            changes[uri] = edits;
        }

        // Also rename in other open documents
        for (const [otherUri] of documentCache.entries()) {
            if (otherUri === uri) continue;

            const otherDoc = documents.get(otherUri);
            if (!otherDoc) continue;

            const otherText = otherDoc.getText();
            const otherEdits: TextEdit[] = [];
            const otherLines = otherText.split('\n');

            for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                const line = otherLines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                        otherEdits.push({
                            range: {
                                start: { line: lineNum, character: matchIndex },
                                end: { line: lineNum, character: matchIndex + oldName.length },
                            },
                            newText: newName,
                        });
                    }
                    searchStart = matchIndex + 1;
                }
            }

            if (otherEdits.length > 0) {
                changes[otherUri] = otherEdits;
            }
        }

        // Also search workspace index for files not currently open
        const workspaceUris = workspaceIndex.getAllDocumentUris();
        for (const wsUri of workspaceUris) {
            if (documentCache.has(wsUri)) continue;

            try {
                const filePath = decodeURIComponent(wsUri.replace(/^file:\/\//, ''));
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const fileEdits: TextEdit[] = [];
                const fileLines = fileContent.split('\n');

                for (let lineNum = 0; lineNum < fileLines.length; lineNum++) {
                    const line = fileLines[lineNum];
                    if (!line) continue;
                    let searchStart = 0;
                    let matchIndex: number;

                    while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                        const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                            fileEdits.push({
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + oldName.length },
                                },
                                newText: newName,
                            });
                        }
                        searchStart = matchIndex + 1;
                    }
                }

                if (fileEdits.length > 0) {
                    changes[wsUri] = fileEdits;
                }
            } catch (err) {
                logger.warn('Failed to read file for rename', { uri: wsUri, error: err instanceof Error ? err.message : String(err) });
            }
        }

        logger.debug('Rename request', { oldName, newName, fileCount: Object.keys(changes).length });
        return { changes };
    });
}
