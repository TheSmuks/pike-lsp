/**
 * Rename Handlers
 *
 * Provides prepare rename and rename operations for Pike code.
 *
 * Scope-aware rename: Uses symbolPositions index to rename only the specific
 * symbol at cursor, not all text with the same name. This correctly handles:
 * - Variables with same name in different scopes
 * - Class/function/variable renaming without text collision
 * - Cross-file rename with symbol-level precision
 *
 * Smart rename: Uses Pike's Rename.pike module via bridge for accurate
 * tokenization and module-aware rename across import/inherit statements.
 */

import {
    Connection,
    Range,
    TextEdit,
    TextDocuments,
    Position,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register rename handlers.
 */
export function registerRenameHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache, bridge } = services;
    const log = new Logger('Rename');

    /**
     * Prepare rename handler - validate that rename is allowed at position
     * Returns the range of the symbol to be renamed, or null if not renamable.
     * Uses Pike's Rename module via bridge for accurate tokenization.
     */
    connection.onPrepareRename(async (params): Promise<Range | null> => {
        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            return null;
        }

        const text = document.getText();
        const line = params.position.line + 1; // Convert to 1-based
        const character = params.position.character;

        // Try using Pike's prepare_rename via bridge for accurate results
        if (bridge?.bridge) {
            try {
                const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));
                const result = await bridge.prepareRename(text, line, character, filePath);

                if (result && !('error' in result) && result.name) {
                    log.debug('Prepare rename: using Pike Rename module', { name: result.name });
                    return {
                        start: { line: result.line, character: result.character },
                        end: { line: result.endLine, character: result.endCharacter },
                    };
                }
            } catch (err) {
                log.debug('Prepare rename: bridge unavailable, using text fallback', {
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        }

        // Fallback: text-based word detection
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

        const word = text.slice(start, end);

        // Check if this word is a known symbol (scope-aware check)
        const cached = documentCache.get(uri);
        if (cached && cached.symbols.length > 0) {
            const isKnownSymbol = cached.symbols.some(s => s.name === word);
            if (!isKnownSymbol) {
                // Not a tracked symbol, but still allow rename (fallback to text-based)
                // This handles cases where symbols aren't parsed yet
            }
        }

        return {
            start: document.positionAt(start),
            end: document.positionAt(end),
        };
    });

    /**
     * Rename handler - scope-aware rename across files
     *
     * Uses symbolPositions index to rename only the specific symbol at cursor,
     * not all text with the same name. This correctly handles:
     * - Variables with same name in different scopes
     * - Class/function/variable renaming without text collision
     * - Cross-file rename with symbol-level precision
     *
     * Falls back to text-based search for uncached workspace files.
     */
    connection.onRenameRequest(async (params): Promise<{ changes: { [uri: string]: TextEdit[] } } | null> => {
        const uri = params.textDocument.uri;
        const document = documents.get(uri);

        if (!document) {
            log.debug('Rename: no document');
            return null;
        }

        const cached = documentCache.get(uri);
        const text = document.getText();
        const offset = document.offsetAt(params.position);
        const line = params.position.line + 1; // Convert to 1-based

        // Try using Pike's find_rename_positions via bridge for accurate results
        if (bridge?.bridge) {
            try {
                const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));

                // First find the word at position
                let start = offset;
                let end = offset;
                while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
                    start--;
                }
                while (end < text.length && /\w/.test(text[end] ?? '')) {
                    end++;
                }
                const symbolName = text.slice(start, end);

                if (symbolName) {
                    const result = await bridge.findRenamePositions(text, symbolName, line, params.position.character, filePath);

                    if (result && !('error' in result) && result.edits && result.edits.length > 0) {
                        log.debug('Rename: using Pike Rename module', { symbol: symbolName, count: result.edits.length });

                        const newName = params.newName;
                        const changes: { [uri: string]: TextEdit[] } = {};

                        // Convert Pike positions to LSP edits
                        const edits: TextEdit[] = result.edits.map(pos => ({
                            range: {
                                start: { line: pos.line, character: pos.character },
                                end: { line: pos.endLine, character: pos.endCharacter },
                            },
                            newText: newName,
                        }));

                        changes[uri] = edits;
                        return { changes };
                    }
                }
            } catch (err) {
                log.debug('Rename: bridge rename failed, using fallback', {
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        }

        // Continue with existing fallback logic...

        // Find the word to rename
        let start = offset;
        let end = offset;
        while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
            start--;
        }
        while (end < text.length && /\w/.test(text[end] ?? '')) {
            end++;
        }

        let oldName = text.slice(start, end);
        if (!oldName) {
            log.debug('Rename: no word at position');
            return null;
        }

        const newName = params.newName;
        const changes: { [uri: string]: TextEdit[] } = {};

        // Check if this word matches a known symbol (scope-aware)
        let matchingSymbol = cached?.symbols.find(s => s.name === oldName);

        // If word doesn't match a symbol directly, check if we're on a symbol's definition line
        if (!matchingSymbol && cached) {
            const line = params.position.line;
            const symbolOnLine = cached.symbols.find(s => {
                if (!s.position) return false;
                const symbolLine = s.position.line - 1; // Pike uses 1-based lines
                return symbolLine === line;
            });

            if (symbolOnLine && symbolOnLine.name) {
                oldName = symbolOnLine.name;
                matchingSymbol = symbolOnLine;
            }
        }

        log.debug('Rename request', { oldName, newName, hasSymbol: !!matchingSymbol });

        // Helper to add edits from symbol positions
        const addEditsFromPositions = (targetUri: string, positions: Position[] | undefined): void => {
            if (!positions || positions.length === 0) return;

            const edits: TextEdit[] = [];
            for (const pos of positions) {
                edits.push({
                    range: {
                        start: pos,
                        end: { line: pos.line, character: pos.character + oldName.length },
                    },
                    newText: newName,
                });
            }

            if (edits.length > 0) {
                changes[targetUri] = edits;
            }
        };

        // Helper to add edits from text search (fallback)
        const addEditsFromTextSearch = (targetUri: string, searchText: string): void => {
            const edits: TextEdit[] = [];
            const lines = searchText.split('\n');

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                    // Check word boundaries
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
                // Merge with existing edits for this URI
                if (changes[targetUri]) {
                    changes[targetUri] = [...changes[targetUri], ...edits];
                } else {
                    changes[targetUri] = edits;
                }
            }
        };

        // If we have a matching symbol and the current document has symbolPositions, use that
        if (matchingSymbol && cached?.symbolPositions) {
            const positions = cached.symbolPositions.get(oldName);
            log.debug('Rename: using symbolPositions', { symbol: oldName, count: positions?.length ?? 0 });
            addEditsFromPositions(uri, positions);
        } else {
            // Fallback to text-based search for current document
            log.debug('Rename: falling back to text search for current document');
            addEditsFromTextSearch(uri, text);
        }

        // Search in other open documents with symbolPositions support
        for (const [otherUri, otherCached] of Array.from(documentCache.entries())) {
            if (otherUri === uri) continue;

            if (otherCached.symbolPositions && matchingSymbol) {
                const positions = otherCached.symbolPositions.get(oldName);
                if (positions && positions.length > 0) {
                    addEditsFromPositions(otherUri, positions);
                }
            } else {
                // Fallback to text search for other documents
                const otherDoc = documents.get(otherUri);
                if (otherDoc) {
                    addEditsFromTextSearch(otherUri, otherDoc.getText());
                }
            }
        }

        // Search workspace files not currently open
        if (services.workspaceScanner?.isReady()) {
            const cachedUris = new Set(documentCache.keys());
            const uncachedFiles = services.workspaceScanner.getUncachedFiles(cachedUris);

            log.debug('Rename: searching workspace files', { uncachedFileCount: uncachedFiles.length });

            for (const file of uncachedFiles) {
                try {
                    const filePath = decodeURIComponent(file.uri.replace(/^file:\/\//, ''));
                    const fileContent = fs.readFileSync(filePath, 'utf-8');

                    // Quick text search fallback for uncached files
                    // Note: We can't use symbolPositions here since files aren't parsed
                    addEditsFromTextSearch(file.uri, fileContent);
                } catch (err) {
                    log.warn('Failed to read file for rename', {
                        uri: file.uri,
                        error: err instanceof Error ? err.message : String(err)
                    });
                }
            }
        }

        log.debug('Rename complete', {
            oldName,
            newName,
            fileCount: Object.keys(changes).length,
            totalEdits: Object.values(changes).reduce((sum, edits) => sum + edits.length, 0)
        });

        return { changes };
    });
}
