/**
 * References and Implementation Handlers
 *
 * Provides find all references, implementation, and document highlight.
 */

import {
    Connection,
    Location,
    DocumentHighlight,
    DocumentHighlightKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register references handlers.
 */
export function registerReferencesHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Navigation');

    /**
     * Implementation handler - find where a symbol is used
     * When on a definition, shows where it's used; otherwise behaves like references
     */
    connection.onImplementation(async (params): Promise<Location[]> => {
        log.debug('Implementation request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return [];
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

            const word = text.slice(start, end);
            if (!word) {
                return [];
            }

            // Check if we're on a definition
            const symbolAtPosition = cached.symbols.find(s => {
                if (s.name !== word || !s.position) return false;
                const symbolLine = s.position.line - 1;
                const cursorLine = params.position.line;
                return symbolLine === cursorLine;
            });

            const references: Location[] = [];

            // Search for all occurrences of the word in the current document
            const lines = text.split('\n');
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                        // If we're on a definition, skip the definition position itself
                        if (symbolAtPosition && lineNum === params.position.line &&
                            matchIndex <= params.position.character &&
                            matchIndex + word.length >= params.position.character) {
                            // Skip the definition position itself
                        } else {
                            references.push({
                                uri,
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + word.length },
                                },
                            });
                        }
                    }
                    searchStart = matchIndex + 1;
                }
            }

            // Also search in other open documents
            for (const [otherUri] of Array.from(documentCache.entries())) {
                if (otherUri === uri) continue;

                const otherDoc = documents.get(otherUri);
                if (!otherDoc) continue;

                const otherText = otherDoc.getText();
                const otherLines = otherText.split('\n');

                for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                    const line = otherLines[lineNum];
                    if (!line) continue;
                    let searchStart = 0;
                    let matchIndex: number;

                    while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                        const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                            references.push({
                                uri: otherUri,
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + word.length },
                                },
                            });
                        }
                        searchStart = matchIndex + 1;
                    }
                }
            }

            return references;
        } catch (err) {
            log.error('Implementation failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * References handler - find all references to a symbol (Find References / Show Usages)
     *
     * LSP Compliance Notes:
     * - includeDeclaration parameter controls whether the symbol's declaration is included
     * - For parsed documents (symbolPositions), declaration is accurately filtered
     * - For workspace-only text search results, declaration filtering is NOT applied
     *   (LIMITATION: No symbol table available for uncached files)
     * - Progress reporting is enabled for workspace scans of 20+ files
     */
    connection.onReferences(async (params): Promise<Location[]> => {
        log.debug('References request', { uri: params.textDocument.uri, position: params.position });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                log.debug('References: no cached document');
                return [];
            }

            // Extract includeDeclaration parameter (LSP 3.17 spec)
            // Default is true - include declaration in results
            const includeDeclaration = params.context.includeDeclaration ?? true;

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

            let word = text.slice(start, end);
            if (!word) {
                log.debug('References: no word at position');
                return [];
            }

            log.debug('References: searching for word', { word, offset, start, end, includeDeclaration });

            // Check if this word matches a known symbol
            let matchingSymbol = cached.symbols.find(s => s.name === word);

            // If word doesn't match a symbol, check if we're on a symbol's definition line
            // This handles CodeLens clicks where position is at return type, not function name
            if (!matchingSymbol) {
                const line = params.position.line;
                const symbolOnLine = cached.symbols.find(s => {
                    if (!s.position) return false;
                    // Pike uses 1-based lines, LSP uses 0-based
                    const symbolLine = s.position.line - 1;
                    return symbolLine === line && (s.kind === 'method' || s.kind === 'class');
                });

                if (symbolOnLine && symbolOnLine.name) {
                    log.debug('References: found symbol on same line', {
                        originalWord: word,
                        symbolName: symbolOnLine.name,
                        line
                    });
                    word = symbolOnLine.name;
                    matchingSymbol = symbolOnLine;
                }
            }

            if (!matchingSymbol) {
                // Not a known symbol, return empty
                log.debug('References: word not a known symbol', { word, symbolCount: cached.symbols.length });
                return [];
            }

            let references: Location[] = [];

            // Use symbolPositions index if available (pre-computed positions)
            if (cached.symbolPositions) {
                const positions = cached.symbolPositions.get(word);
                log.debug('References: symbolPositions lookup', { word, found: !!positions, count: positions?.length ?? 0 });
                if (positions) {
                    for (const pos of positions) {
                        references.push({
                            uri,
                            range: {
                                start: pos,
                                end: { line: pos.line, character: pos.character + word.length },
                            },
                        });
                    }
                }
            }

            // Fallback: if symbolPositions didn't have results, do text-based search
            if (references.length === 0) {
                log.debug('References: falling back to text search');
                const lines = text.split('\n');
                for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                    const line = lines[lineNum];
                    if (!line) continue;
                    let searchStart = 0;
                    let matchIndex: number;

                    while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                        const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                        // Check word boundaries
                        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                            references.push({
                                uri,
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + word.length },
                                },
                            });
                        }
                        searchStart = matchIndex + 1;
                    }
                }
            }

            // Search in other open documents
            for (const [otherUri, otherCached] of Array.from(documentCache.entries())) {
                if (otherUri === uri) continue;

                // Use symbolPositions if available
                if (otherCached.symbolPositions) {
                    const positions = otherCached.symbolPositions.get(word);
                    if (positions) {
                        for (const pos of positions) {
                            references.push({
                                uri: otherUri,
                                range: {
                                    start: pos,
                                    end: { line: pos.line, character: pos.character + word.length },
                                },
                            });
                        }
                    }
                } else {
                    // Fallback text search for other documents without symbolPositions
                    const otherDoc = documents.get(otherUri);
                    if (otherDoc) {
                        const otherText = otherDoc.getText();
                        const otherLines = otherText.split('\n');
                        for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                            const line = otherLines[lineNum];
                            if (!line) continue;
                            let searchStart = 0;
                            let matchIndex: number;

                            while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                                const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                                    references.push({
                                        uri: otherUri,
                                        range: {
                                            start: { line: lineNum, character: matchIndex },
                                            end: { line: lineNum, character: matchIndex + word.length },
                                        },
                                    });
                                }
                                searchStart = matchIndex + 1;
                            }
                        }
                    }
                }
            }

            // Search in workspace files that are not currently open
            if (services.workspaceScanner?.isReady()) {
                const cachedUris = new Set(documentCache.keys());
                const uncachedFiles = services.workspaceScanner.getUncachedFiles(cachedUris);

                log.debug('References: searching workspace files', {
                    uncachedFileCount: uncachedFiles.length,
                    word
                });

                // Progress reporting configuration
                const enableProgress = process.env['PIKE_LSP_REFERENCES_PROGRESS'] !== 'false';
                const PROGRESS_THRESHOLD = 20; // Only show progress for searches of 20+ files
                const BATCH_SIZE = 15;
                const YIELD_EVERY_N_BATCHES = 5;

                let progress: any = null;

                // Create progress token for large workspace scans
                if (enableProgress && uncachedFiles.length > PROGRESS_THRESHOLD) {
                    try {
                        progress = await connection.window.createWorkDoneProgress();
                        progress.begin('Searching workspace...', 0, uncachedFiles.length);
                        log.debug('References: progress started', { totalFiles: uncachedFiles.length });
                    } catch (err) {
                        // Client may not support workDoneProgress
                        log.debug('References: failed to create progress', { error: err instanceof Error ? err.message : String(err) });
                        progress = null;
                    }
                }

                // Process workspace files in batches with yielding
                for (let i = 0; i < uncachedFiles.length; i += BATCH_SIZE) {
                    const batch = uncachedFiles.slice(i, Math.min(i + BATCH_SIZE, uncachedFiles.length));

                    for (const file of batch) {
                        try {
                            // Read file content
                            const filePath = decodeURIComponent(file.uri.replace(/^file:\/\//, ''));
                            const { readFile } = await import('node:fs/promises');
                            const content = await readFile(filePath, 'utf-8');

                            // Check if the word appears in the file (quick text search first)
                            if (!content.includes(word)) {
                                continue;
                            }

                            // Word appears in file, do proper search
                            // NOTE: Workspace-only results are NOT filtered by includeDeclaration
                            // This is a documented limitation - we don't have symbol position info
                            // for uncached files, so we can't identify which occurrence is the declaration
                            const lines = content.split('\n');
                            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                                const line = lines[lineNum];
                                if (!line) continue;
                                let searchStart = 0;
                                let matchIndex: number;

                                while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                                    const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                                    // Check word boundaries
                                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                                        references.push({
                                            uri: file.uri,
                                            range: {
                                                start: { line: lineNum, character: matchIndex },
                                                end: { line: lineNum, character: matchIndex + word.length },
                                            },
                                        });
                                    }
                                    searchStart = matchIndex + 1;
                                }
                            }
                        } catch (err) {
                            // File might not exist or be readable, skip
                            log.debug('References: failed to read workspace file', {
                                uri: file.uri,
                                error: err instanceof Error ? err.message : String(err),
                            });
                        }
                    }

                    // Report progress after each batch
                    if (progress) {
                        const completed = Math.min(i + BATCH_SIZE, uncachedFiles.length);
                        progress.report(completed, `Scanned ${completed} files...`);
                    }

                    // Yield periodically to avoid blocking the event loop
                    if (progress && (i / BATCH_SIZE) % YIELD_EVERY_N_BATCHES === 0 && i > 0) {
                        await new Promise(resolve => setImmediate(resolve));
                    }
                }

                // Complete progress reporting
                if (progress) {
                    progress.done(`Found ${references.length} references`);
                    log.debug('References: progress complete', { totalReferences: references.length });
                }

                log.debug('References: workspace search complete', {
                    workspaceReferencesFound: references.length,
                });
            }

            // Apply includeDeclaration filtering for parsed documents only
            // NOTE: Workspace-only results (text search) are NOT filtered
            // See limitation documentation above
            if (!includeDeclaration && matchingSymbol.position) {
                const declLine = matchingSymbol.position.line - 1; // Convert to 0-based

                // Helper function to check if a reference URI matches the declaration file
                // Handles various URI formats: file:///test.pike, file://test.pike, test.pike
                const isDeclarationUri = (refUri: string): boolean => {
                    if (!matchingSymbol.position) return false;

                    // If symbol has no explicit file, only match the current document URI
                    if (!matchingSymbol.position.file) {
                        return refUri === uri;
                    }

                    const symFile = matchingSymbol.position.file;

                    // Direct match
                    if (refUri === symFile) return true;

                    // Both are URIs - normalize and compare
                    if (symFile.startsWith('file://') && refUri.startsWith('file://')) {
                        // Extract paths and compare
                        const symPath = symFile.replace(/^file:\/\//, '');
                        const refPath = refUri.replace(/^file:\/\//, '');
                        return symPath === refPath;
                    }

                    // Symbol file is not a URI but reference is
                    if (refUri.startsWith('file://')) {
                        const refPath = refUri.replace(/^file:\/\//, '');
                        // Check if reference path ends with the symbol filename
                        if (refPath.endsWith(`/${symFile}`) || refPath.endsWith(`\\${symFile}`)) {
                            return true;
                        }
                        // For simple filename match (e.g., "test.pike")
                        const refBasename = refPath.split('/').pop() ?? refPath.split('\\').pop() ?? '';
                        if (refBasename === symFile) {
                            return true;
                        }
                    }

                    // Reference is not a URI but symbol file is
                    if (symFile.startsWith('file://')) {
                        const symPath = symFile.replace(/^file:\/\//, '');
                        if (refUri.endsWith(`/${symPath}`) || refUri.endsWith(`\\${symPath}`)) {
                            return true;
                        }
                        const symBasename = symPath.split('/').pop() ?? symPath.split('\\').pop() ?? '';
                        if (refUri === symBasename) {
                            return true;
                        }
                    }

                    return false;
                };

                log.debug('References: filtering declaration', {
                    includeDeclaration,
                    declLine,
                    declFile: matchingSymbol.position.file,
                    currentUri: uri,
                    word
                });

                // Filter out declaration location from parsed results
                const beforeFilter = references.length;
                references = references.filter(ref => {
                    // Check if this reference is at the declaration location
                    const isSameFile = isDeclarationUri(ref.uri);
                    const isSameLine = ref.range.start.line === declLine;

                    // Exclude if this is the declaration location
                    // NOTE: This only works for parsed documents with symbolPositions
                    // Workspace-only text search results may still include the declaration
                    return !(isSameFile && isSameLine);
                });

                log.debug('References: filtered declaration', {
                    beforeFilter,
                    afterFilter: references.length,
                    removed: beforeFilter - references.length
                });
            }

            log.debug('References found', { word, count: references.length, includeDeclaration });
            return references;
        } catch (err) {
            log.error('References failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Document highlight handler - highlight all occurrences of the symbol at cursor
     */
    connection.onDocumentHighlight(async (params): Promise<DocumentHighlight[] | null> => {
        log.debug('Document highlight request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return null;
            }

            const text = document.getText();
            const offset = document.offsetAt(params.position);

            // Find word at cursor
            let wordStart = offset;
            let wordEnd = offset;
            while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
                wordStart--;
            }
            while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
                wordEnd++;
            }
            const word = text.slice(wordStart, wordEnd);

            if (!word || word.length < 2) {
                return null;
            }

            const highlights: DocumentHighlight[] = [];
            const lines = text.split('\n');

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                        highlights.push({
                            range: {
                                start: { line: lineNum, character: matchIndex },
                                end: { line: lineNum, character: matchIndex + word.length },
                            },
                            kind: DocumentHighlightKind.Text,
                        });
                    }
                    searchStart = matchIndex + 1;
                }
            }

            return highlights.length > 0 ? highlights : null;
        } catch (err) {
            log.error('Document highlight failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });
}
