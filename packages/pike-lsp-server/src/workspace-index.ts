/**
 * Workspace Symbol Index
 *
 * Maintains an index of symbols across all Pike files in the workspace.
 * Enables fast workspace-wide symbol search (Ctrl+T).
 */

import { PikeSymbol, PikeBridge } from '@pike-lsp/pike-bridge';
import { SymbolInformation, SymbolKind } from 'vscode-languageserver';
import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import * as path from 'path';
import { LSP } from './constants/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Indexed document with its symbols
 */
interface IndexedDocument {
    uri: string;
    symbols: Array<FlattenedSymbolEntry | PikeSymbol>;
    version: number;
    lastModified: number;
    lineCount?: number;
}

interface FlattenedSymbolEntry {
    symbol: PikeSymbol;
    parentName?: string;
}

/**
 * Symbol entry in the quick lookup index
 */
interface SymbolEntry {
    name: string;
    kind: string;
    uri: string;
    line: number;
    maxLine?: number;
    parentName?: string;  // WS-001: Parent symbol name for containerName field
}

/**
 * Error callback type for reporting indexing errors
 */
export type IndexErrorCallback = (message: string, uri?: string) => void;

/**
 * Progress information during workspace indexing
 */
interface IndexProgress {
    current: number;
    total: number;
    phase: 'discovering' | 'reading' | 'parsing' | 'indexing';
    message: string;
}

/**
 * Callback type for progress updates during indexing
 */
type IndexProgressCallback = (progress: IndexProgress) => void;

/**
 * File information with filesystem modification time
 */
interface FileInfo {
    path: string;
    lastModified: number;
}

/**
 * Performance metrics for indexing operations
 */
export interface IndexMetrics {
    /** Total time for the last indexDirectory operation */
    lastIndexTimeMs: number;
    /** Time spent discovering files */
    lastFileDiscoveryMs: number;
    /** Time spent reading files */
    lastFileReadMs: number;
    /** Time spent parsing (IPC + Pike) */
    lastParsingMs: number;
    /** Time spent updating the index */
    lastIndexingMs: number;
    /** Number of files in the last index operation */
    lastFileCount: number;
    /** Cumulative number of files indexed since server start */
    totalFilesIndexed: number;
}

/**
 * WorkspaceIndex manages symbol indexing across the workspace
 */
export class WorkspaceIndex {
    // Document URI -> IndexedDocument
    private documents = new Map<string, IndexedDocument>();

    // Symbol name (lowercase) -> Map<URI, SymbolEntry>
    // Enables fast prefix matching AND O(1) removal
    private symbolLookup = new Map<string, Map<string, SymbolEntry>>();

    // PERF-XXX: Reverse index for O(1) URI removal
    // URI -> Set of symbol names (lowercase) for that URI
    private uriToSymbols = new Map<string, Set<string>>();

    // PERF-XXX: Prefix index for O(1) prefix matching
    // Maps each prefix (2+ chars) to set of symbol names that have that prefix
    private prefixIndex = new Map<string, Set<string>>();

    // PERF-430: LRU cache for search results
    // Caches frequently accessed search results to avoid recomputation
    private searchCache = new Map<string, { results: SymbolInformation[]; timestamp: number }>();
    private searchCacheHits = 0;
    private searchCacheMisses = 0;
    private static readonly SEARCH_CACHE_MAX_SIZE = 100;
    private static readonly SEARCH_CACHE_TTL_MS = 60000; // 60 seconds

    // Pike bridge for parsing
    private bridge: PikeBridge | null = null;

    // Optional error callback for LSP connection reporting
    private onError: IndexErrorCallback | null = null;

    // PERF-007: Performance metrics tracking
    private metrics: IndexMetrics = {
        lastIndexTimeMs: 0,
        lastFileDiscoveryMs: 0,
        lastFileReadMs: 0,
        lastParsingMs: 0,
        lastIndexingMs: 0,
        lastFileCount: 0,
        totalFilesIndexed: 0,
    };

    // Logger instance
    private log = new Logger('WorkspaceIndex');

    constructor(bridge?: PikeBridge) {
        this.bridge = bridge ?? null;
    }

    /**
     * Set error callback for reporting indexing errors to the LSP connection
     */
    setErrorCallback(callback: IndexErrorCallback): void {
        this.onError = callback;
    }

    /**
     * Get performance metrics for indexing operations
     */
    getMetrics(): IndexMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset performance metrics
     */
    resetMetrics(): void {
        this.metrics = {
            lastIndexTimeMs: 0,
            lastFileDiscoveryMs: 0,
            lastFileReadMs: 0,
            lastParsingMs: 0,
            lastIndexingMs: 0,
            lastFileCount: 0,
            totalFilesIndexed: 0,
        };
    }

    /**
     * Report an error through both console and optional callback
     */
    private reportError(message: string, uri?: string): void {
        this.log.error(message, { uri });
        this.onError?.(message, uri);
    }

    /**
     * Set the Pike bridge for parsing
     */
    setBridge(bridge: PikeBridge): void {
        this.bridge = bridge;
    }

    /**
     * Flatten nested symbol tree into a single-level array
     * This ensures all class members are indexed at the workspace level
     * WS-001: Tracks parent path for containerName field support
     */
    private flattenSymbols(symbols: PikeSymbol[], parentPath: string[] = []): FlattenedSymbolEntry[] {
        const flat: FlattenedSymbolEntry[] = [];

        for (const sym of symbols) {
            const parentName = parentPath.length > 0 ? parentPath.join('.') : undefined;
            if (parentName) {
                flat.push({ symbol: sym, parentName });
            } else {
                flat.push({ symbol: sym });
            }

            // Recursively flatten children, building the ancestor path
            if (sym.children && sym.children.length > 0) {
                const newPath = [...parentPath, sym.name];
                flat.push(...this.flattenSymbols(sym.children, newPath));
            }
        }

        return flat;
    }

    private countLines(content: string): number {
        if (content.length === 0) {
            return 1;
        }
        return content.split('\n').length;
    }

    private normalizeLineToZeroBased(line: number | undefined, maxLineCount?: number): number {
        if (typeof line !== 'number' || !Number.isFinite(line) || !Number.isInteger(line)) {
            return 0;
        }

        let oneBasedLine = Math.max(1, line);
        if (
            typeof maxLineCount === 'number'
            && Number.isFinite(maxLineCount)
            && Number.isInteger(maxLineCount)
            && maxLineCount > 0
        ) {
            oneBasedLine = Math.min(oneBasedLine, maxLineCount);
        }

        return oneBasedLine - 1;
    }

    /**
     * Index a single document
     */
    async indexDocument(uri: string, content: string, version: number): Promise<void> {
        if (!this.bridge?.isRunning()) {
            return;
        }

        // Extract filename from URI and decode URL encoding
        const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

        try {
            const result = await this.bridge.analyze(content, ['parse'], filename);
            const parsedSymbols = result.result?.parse?.symbols ?? [];
            const symbols = this.flattenSymbols(parsedSymbols);
            const lineCount = this.countLines(content);

            // Remove old entries from lookup
            const existing = this.documents.get(uri);
            if (existing) {
                this.removeFromLookup(uri);
            }

            // Store indexed document
            this.documents.set(uri, {
                uri,
                symbols,
                version,
                lastModified: Date.now(),
                lineCount,
            });

            // Add to lookup
            this.addToLookup(uri, symbols, lineCount);

            // PERF-430: Invalidate search cache when document changes
            this.searchCache.clear();

        } catch (err) {
            // Report error through callback for LSP connection visibility
            this.reportError(`[Pike LSP] Failed to index document: ${err instanceof Error ? err.message : String(err)}`, uri);
        }
    }

    /**
     * Remove a document from the index
     */
    removeDocument(uri: string): void {
        this.removeFromLookup(uri);
        this.documents.delete(uri);
        this.invalidateSearchCacheForUri(uri);
    }

    /**
     * Get symbols for a document
     */
    getDocumentSymbols(uri: string): PikeSymbol[] {
        const symbols = this.documents.get(uri)?.symbols ?? [];
        return symbols.map(symbol => this.toFlattenedSymbolEntry(symbol).symbol);
    }

    /**
     * Search for symbols across the workspace
     * Returns symbols matching the query string (case-insensitive prefix match)
     * WS-012 through WS-017: Implements result ranking and sorting
     * PERF-XXX: Uses prefix index for O(1) prefix lookups instead of O(n) scan
     * PERF-430: Uses LRU cache for search results
     */
    searchSymbols(query: string, limit: number = LSP.MAX_WORKSPACE_SYMBOLS): SymbolInformation[] {
        const results: SymbolInformation[] = [];
        const queryLower = query?.toLowerCase() ?? '';

        // PERF-430: Check search result cache first
        const cacheKey = `${queryLower}:${limit}`;
        const cached = this.searchCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < WorkspaceIndex.SEARCH_CACHE_TTL_MS) {
            this.searchCacheHits++;
            return cached.results.slice(0, limit);
        }
        this.searchCacheMisses++;

        // If query is empty, return some symbols from each file (WS-016: unsorted)
        if (!queryLower) {
            for (const [uri, doc] of this.documents) {
                if (!doc.symbols) continue;
                for (const entry of doc.symbols.slice(0, 5)) {
                    const normalizedEntry = this.toFlattenedSymbolEntry(entry);
                    const symbol = normalizedEntry.symbol;
                    // Skip symbols with null names
                    if (!symbol.name) continue;
                    results.push(this.toSymbolInformation(symbol, uri, normalizedEntry.parentName, doc.lineCount));
                    if (results.length >= limit) {
                        return results;
                    }
                }
            }
            return results;
        }

        // Collect all matching results
        const matched: Array<{ result: SymbolInformation; score: number }> = [];

        // PERF-XXX: Use prefix index for O(1) lookup instead of O(n) scan
        // Collect unique symbol names that match the query
        const matchingNames = new Set<string>();

        if (queryLower.length >= 2) {
            // Use prefix index for prefix matching (O(1) lookup)
            const prefixSet = this.prefixIndex.get(queryLower);
            if (prefixSet) {
                for (const name of prefixSet) {
                    matchingNames.add(name);
                }
            }
        }

        // Also check for exact/substring matches in symbolLookup (for shorter queries)
        // This handles the case where query is 1 character
        if (queryLower.length < 2 || matchingNames.size === 0) {
            // Fall back to scanning for short queries or when prefix index misses
            for (const name of this.symbolLookup.keys()) {
                if (name.startsWith(queryLower) || name.includes(queryLower)) {
                    matchingNames.add(name);
                }
            }
        }

        // Now get entries for all matching names
        for (const name of matchingNames) {
            const entriesByUri = this.symbolLookup.get(name);
            if (!entriesByUri) continue;

            for (const entry of entriesByUri.values()) {
                // Skip if this entry doesn't match (substring check)
                if (!entry.name.toLowerCase().startsWith(queryLower) &&
                    !entry.name.toLowerCase().includes(queryLower)) {
                    continue;
                }

                const result: SymbolInformation = {
                    name: entry.name,
                    kind: this.convertSymbolKind(entry.kind),
                    location: {
                        uri: entry.uri,
                        range: {
                            start: { line: this.normalizeLineToZeroBased(entry.line, entry.maxLine), character: 0 },
                            end: { line: this.normalizeLineToZeroBased(entry.line, entry.maxLine), character: entry.name.length },
                        },
                    },
                };
                // WS-001: Add containerName if parent exists
                if (entry.parentName) {
                    result.containerName = entry.parentName;
                }

                // WS-012 through WS-017: Calculate relevance score
                const score = this.scoreResult(result, queryLower);
                matched.push({ result, score });
            }
        }

        // WS-012 through WS-017: Sort by score, then name length, then alphabetically
        matched.sort((a, b) => {
            // Primary: score (descending)
            if (Math.abs(b.score - a.score) > 0.01) {
                return b.score - a.score;
            }
            // Secondary: name length (ascending) - WS-014
            if (a.result.name.length !== b.result.name.length) {
                return a.result.name.length - b.result.name.length;
            }
            // Tertiary: alphabetical (ascending) - WS-017
            return a.result.name.localeCompare(b.result.name);
        });

        // Return top results
        const finalResults = matched.slice(0, limit).map(m => m.result);

        if (this.searchCache.size >= WorkspaceIndex.SEARCH_CACHE_MAX_SIZE) {
            const oldestKey = this.searchCache.keys().next().value;
            if (oldestKey !== undefined) {
                this.searchCache.delete(oldestKey);
            }
        }
        this.searchCache.set(cacheKey, { results: finalResults, timestamp: Date.now() });

        return finalResults;
    }

    /**
     * Calculate relevance score for a search result
     * WS-012 through WS-017: Scoring algorithm for result ranking
     *
     * Scoring:
     * - Exact match: 100 points
     * - Prefix match: 50 points
     * - Substring match: 10 points
     * - Name length penalty: 0.1 per character (prefers shorter names within same match type)
     */
    private scoreResult(result: SymbolInformation, queryLower: string): number {
        const nameLower = result.name.toLowerCase();
        let score = 0;

        // Exact match (WS-012)
        if (nameLower === queryLower) {
            score += 100;
        }
        // Prefix match (WS-013)
        else if (nameLower.startsWith(queryLower)) {
            score += 50;
        }
        // Substring match
        else if (nameLower.includes(queryLower)) {
            score += 10;
        }

        // WS-014: Prefer shorter names within same match type
        score -= result.name.length * 0.1;

        return score;
    }

    /**
     * Index all Pike files in a directory
     * PERF-002: Uses batch parsing for better performance
     * PERF-007: Adds performance instrumentation
     * PERF-008: Incremental indexing with progress callbacks and chunked processing
     *
     * @param dirPath - Directory path to index
     * @param recursive - Whether to recursively index subdirectories
     * @param onProgress - Optional callback for progress updates
     */
    async indexDirectory(
        dirPath: string,
        recursive: boolean = true,
        onProgress?: IndexProgressCallback
    ): Promise<number> {
        if (!this.bridge?.isRunning()) {
            return 0;
        }

        const totalStart = performance.now();

        // PERF-007: Time file discovery
        const discoveryStart = performance.now();
        const allFiles = await this.findPikeFilesWithStats(dirPath, recursive);
        const discoveryEnd = performance.now();
        this.metrics.lastFileDiscoveryMs = discoveryEnd - discoveryStart;

        if (allFiles.length === 0) {
            return 0;
        }

        // PERF-008: Report discovery phase
        onProgress?.({
            current: allFiles.length,
            total: allFiles.length,
            phase: 'discovering',
            message: `Discovered ${allFiles.length} Pike files`,
        });

        // PERF-008: Filter for changed/new files only (incremental indexing)
        const filesToIndex = allFiles.filter(fileInfo => {
            const uri = `file://${fileInfo.path}`;
            const existing = this.documents.get(uri);
            return !existing || existing.lastModified < fileInfo.lastModified;
        });

        // PERF-008: Track and remove deleted files
        const currentPaths = new Set(allFiles.map(f => `file://${f.path}`));
        let deletedCount = 0;
        for (const [uri] of this.documents) {
            if (!currentPaths.has(uri) && uri.startsWith('file://')) {
                this.removeDocument(uri);
                deletedCount++;
            }
        }

        const skippedCount = allFiles.length - filesToIndex.length;

        // PERF-008: Report discovery results
        onProgress?.({
            current: 0,
            total: filesToIndex.length,
            phase: 'discovering',
            message: `Found ${filesToIndex.length} changed files, skipped ${skippedCount}, removed ${deletedCount}`,
        });

        if (filesToIndex.length === 0) {
            // PERF-008: Log incremental reindex (no changes)
            this.log.info('workspace-index-perf', {
                event: 'workspace-index-perf',
                fileCount: allFiles.length,
                indexed: 0,
                skipped: skippedCount,
                deleted: deletedCount,
                fileDiscoveryMs: this.metrics.lastFileDiscoveryMs.toFixed(2),
                fileReadMs: '0.00',
                parsingMs: '0.00',
                indexingMs: '0.00',
                totalMs: (performance.now() - totalStart).toFixed(2),
                incremental: true,
            });
            this.metrics.lastFileCount = allFiles.length;
            this.metrics.lastIndexTimeMs = performance.now() - totalStart;
            return 0;
        }

        // PERF-008: Chunk size for file reading (smaller than bridge's 50)
        const CHUNK_SIZE = 20;

        let totalReadMs = 0;
        let indexed = 0;

        for (let i = 0; i < filesToIndex.length; i += CHUNK_SIZE) {
            const chunk = filesToIndex.slice(i, i + CHUNK_SIZE);
            const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
            const totalChunks = Math.ceil(filesToIndex.length / CHUNK_SIZE);

            // PERF-008: Report reading progress
            onProgress?.({
                current: i,
                total: filesToIndex.length,
                phase: 'reading',
                message: `Reading files ${i + 1}-${Math.min(i + CHUNK_SIZE, filesToIndex.length)} of ${filesToIndex.length}`,
            });

            const chunkReadStart = performance.now();

            // PERF-008: Read only this chunk (lazy loading)
            const chunkData: Array<{ code: string; filename: string; lastModified: number; lineCount: number }> = [];
            for (const fileInfo of chunk) {
                try {
                    const content = await readFile(fileInfo.path, 'utf-8');
                    chunkData.push({
                        code: content,
                        filename: fileInfo.path,
                        lastModified: fileInfo.lastModified,
                        lineCount: this.countLines(content),
                    });
                } catch (error) {
                    this.log.debug('Skipping unreadable file during indexing', {
                        path: fileInfo.path,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }

            const chunkReadEnd = performance.now();
            totalReadMs += chunkReadEnd - chunkReadStart;

            // PERF-008: Report parsing progress
            onProgress?.({
                current: i,
                total: filesToIndex.length,
                phase: 'parsing',
                message: `Parsing chunk ${chunkNumber} of ${totalChunks} (${chunkData.length} files)`,
            });

            try {
                // PERF-007: Time parsing (IPC + Pike)
                const parseStart = performance.now();
                const batchResult = await this.bridge.batchParse(
                    chunkData.map(d => ({ code: d.code, filename: d.filename }))
                );
                const parseEnd = performance.now();
                this.metrics.lastParsingMs += parseEnd - parseStart;

                // PERF-008: Time indexing for this chunk
                const indexingStart = performance.now();

                // Process results with proper bounds checking
                for (let j = 0; j < Math.min(batchResult.results.length, chunkData.length); j++) {
                    const result = batchResult.results[j];
                    const fileInfo = chunkData[j];

                    // Skip if either result or file info is undefined
                    if (!result || !fileInfo) continue;

                    const uri = `file://${result.filename}`;

                    // Remove old entries from lookup
                    const existing = this.documents.get(uri);
                    if (existing) {
                        this.removeFromLookup(uri);
                    }

                    // Store indexed document with filesystem mtime
                    const symbols = this.flattenSymbols(result.symbols);
                    this.documents.set(uri, {
                        uri,
                        symbols,
                        version: 1,
                        lastModified: fileInfo.lastModified,
                        lineCount: fileInfo.lineCount,
                    });

                    // Add to lookup
                    this.addToLookup(uri, symbols, fileInfo.lineCount);
                    indexed++;
                }

                const indexingEnd = performance.now();
                this.metrics.lastIndexingMs += indexingEnd - indexingStart;

                // PERF-008: Report chunk progress
                onProgress?.({
                    current: i + chunk.length,
                    total: filesToIndex.length,
                    phase: 'indexing',
                    message: `Indexed ${indexed} of ${filesToIndex.length} changed files`,
                });

            } catch (err) {
                this.reportError(`[Pike LSP] Batch parse failed for chunk ${chunkNumber}, falling back to sequential parsing: ${err instanceof Error ? err.message : String(err)}`);

                // Fallback to sequential parsing for this chunk
                for (const fileData of chunkData) {
                    try {
                        const analyzeResult = await this.bridge.analyze(fileData.code, ['parse'], fileData.filename);
                        const parsedSymbols = analyzeResult.result?.parse?.symbols ?? [];
                        const uri = `file://${fileData.filename}`;

                        // Remove old entries from lookup
                        const existing = this.documents.get(uri);
                        if (existing) {
                            this.removeFromLookup(uri);
                        }

                        // Store indexed document with filesystem mtime
                        const symbols = this.flattenSymbols(parsedSymbols);
                        this.documents.set(uri, {
                            uri,
                            symbols,
                            version: 1,
                            lastModified: fileData.lastModified,
                            lineCount: fileData.lineCount,
                        });

                        // Add to lookup
                        this.addToLookup(uri, symbols, fileData.lineCount);
                        indexed++;
                    } catch (error) {
                        this.log.debug('Sequential parse fallback failed for file', {
                            path: fileData.filename,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                }
            }
        }

        this.metrics.lastFileReadMs = totalReadMs;

        // PERF-007: Log performance data
        this.log.info('workspace-index-perf', {
            event: 'workspace-index-perf',
            fileCount: allFiles.length,
            indexed,
            skipped: skippedCount,
            deleted: deletedCount,
            fileDiscoveryMs: this.metrics.lastFileDiscoveryMs.toFixed(2),
            fileReadMs: this.metrics.lastFileReadMs.toFixed(2),
            parsingMs: this.metrics.lastParsingMs.toFixed(2),
            indexingMs: this.metrics.lastIndexingMs.toFixed(2),
            totalMs: (performance.now() - totalStart).toFixed(2),
            incremental: indexed < allFiles.length,
        });

        // PERF-007: Update metrics
        const totalEnd = performance.now();
        this.metrics.lastIndexTimeMs = totalEnd - totalStart;
        this.metrics.lastFileCount = allFiles.length;
        this.metrics.totalFilesIndexed += indexed;

        return indexed;
    }

    /**
     * Get statistics about the index
     */
    getStats(): { documents: number; symbols: number; uniqueNames: number } {
        let symbolCount = 0;
        for (const doc of this.documents.values()) {
            symbolCount += doc.symbols.length;
        }

        return {
            documents: this.documents.size,
            symbols: symbolCount,
            uniqueNames: this.symbolLookup.size,
        };
    }

    /**
     * Clear the entire index
     */
    clear(): void {
        this.documents.clear();
        this.symbolLookup.clear();
        this.uriToSymbols.clear();
        this.prefixIndex.clear();
        this.searchCache.clear();
        this.searchCacheHits = 0;
        this.searchCacheMisses = 0;
    }

    /**
     * Get all indexed document URIs
     */
    getAllDocumentUris(): string[] {
        return Array.from(this.documents.keys());
    }

    // Private helpers

    private addToLookup(uri: string, symbols: FlattenedSymbolEntry[], maxLineCount?: number): void {
        let symbolNames = this.uriToSymbols.get(uri);
        if (!symbolNames) {
            symbolNames = new Set<string>();
            this.uriToSymbols.set(uri, symbolNames);
        }

        for (const entryData of symbols) {
            const symbol = entryData.symbol;
            // Skip symbols with null names (can occur with certain Pike constructs)
            if (!symbol.name) {
                continue;
            }

            const nameLower = symbol.name.toLowerCase();

            const entry: SymbolEntry = {
                name: symbol.name,
                kind: symbol.kind,
                uri,
                line: symbol.position?.line ?? 1,
            };
            if (typeof maxLineCount === 'number') {
                entry.maxLine = maxLineCount;
            }
            if (entryData.parentName !== undefined) {
                entry.parentName = entryData.parentName;
            }

            let entriesByUri = this.symbolLookup.get(nameLower);
            if (!entriesByUri) {
                entriesByUri = new Map();
                this.symbolLookup.set(nameLower, entriesByUri);
            }
            entriesByUri.set(uri, entry);

            if (!symbolNames.has(nameLower)) {
                symbolNames.add(nameLower);

                if (nameLower.length >= 2) {
                    for (let i = 2; i <= nameLower.length; i++) {
                        const prefix = nameLower.slice(0, i);
                        let prefixSet = this.prefixIndex.get(prefix);
                        if (!prefixSet) {
                            prefixSet = new Set<string>();
                            this.prefixIndex.set(prefix, prefixSet);
                        }
                        prefixSet.add(nameLower);
                    }
                }
            }
        }
    }

    private removeFromLookup(uri: string): void {
        // PERF-XXX: O(1) removal using reverse index
        const symbolNames = this.uriToSymbols.get(uri);
        if (!symbolNames) {
            return; // Nothing to remove
        }

        // Remove each symbol entry for this URI
        for (const nameLower of symbolNames) {
            const entriesByUri = this.symbolLookup.get(nameLower);
            let removeNameFromPrefixIndex = !entriesByUri;

            if (entriesByUri) {
                entriesByUri.delete(uri);
                // Clean up empty name entries
                if (entriesByUri.size === 0) {
                    this.symbolLookup.delete(nameLower);
                    removeNameFromPrefixIndex = true;
                }
            }

            if (removeNameFromPrefixIndex && nameLower.length >= 2) {
                for (let i = 2; i <= nameLower.length; i++) {
                    const prefix = nameLower.slice(0, i);
                    const prefixSet = this.prefixIndex.get(prefix);
                    if (prefixSet) {
                        prefixSet.delete(nameLower);
                        if (prefixSet.size === 0) {
                            this.prefixIndex.delete(prefix);
                        }
                    }
                }
            }
        }

        // Clean up reverse index
        this.uriToSymbols.delete(uri);
    }

    private invalidateSearchCacheForUri(uri: string): void {
        if (this.searchCache.size === 0) {
            return;
        }

        for (const [cacheKey, cacheEntry] of this.searchCache) {
            const referencesRemovedUri = cacheEntry.results.some(result => result.location.uri === uri);
            if (referencesRemovedUri) {
                this.searchCache.delete(cacheKey);
            }
        }
    }

    /**
     * Find all Pike files in a directory with filesystem modification times
     * PERF-008: Enables incremental indexing by tracking file mtime
     */
    private async findPikeFilesWithStats(dirPath: string, recursive: boolean): Promise<FileInfo[]> {
        const files: FileInfo[] = [];

        const walk = async (dir: string): Promise<void> => {
            let entries: Dirent[];
            try {
                entries = await readdir(dir, { withFileTypes: true });
            } catch (error) {
                this.log.debug('Skipping unreadable directory while scanning workspace', {
                    path: dir,
                    error: error instanceof Error ? error.message : String(error),
                });
                return;
            }

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && recursive) {
                    // Skip common non-source directories
                    if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
                        await walk(fullPath);
                    }
                } else if (entry.isFile()) {
                    if (entry.name.endsWith('.pike') || entry.name.endsWith('.pmod')) {
                        try {
                            const stats = await stat(fullPath);
                            files.push({
                                path: fullPath,
                                lastModified: stats.mtimeMs,
                            });
                        } catch (error) {
                            this.log.debug('Skipping file with unreadable metadata', {
                                path: fullPath,
                                error: error instanceof Error ? error.message : String(error),
                            });
                        }
                    }
                }
            }
        };

        await walk(dirPath);
        return files;
    }

    private toSymbolInformation(
        symbol: PikeSymbol,
        uri: string,
        parentName?: string,
        maxLineCount?: number
    ): SymbolInformation {
        const line = this.normalizeLineToZeroBased(symbol.position?.line, maxLineCount);

        const result: SymbolInformation = {
            name: symbol.name,
            kind: this.convertSymbolKind(symbol.kind),
            location: {
                uri,
                range: {
                    start: { line, character: 0 },
                    end: { line, character: symbol.name.length },
                },
            },
        };

        // WS-001: Add containerName if parent exists
        if (parentName) {
            result.containerName = parentName;
        }

        return result;
    }

    private toFlattenedSymbolEntry(
        symbolOrEntry: FlattenedSymbolEntry | PikeSymbol
    ): FlattenedSymbolEntry {
        if ('symbol' in symbolOrEntry) {
            return symbolOrEntry;
        }
        return { symbol: symbolOrEntry };
    }

    private convertSymbolKind(kind: string): SymbolKind {
        switch (kind) {
            case 'class':
                return SymbolKind.Class;
            case 'method':
                return SymbolKind.Method;
            case 'variable':
                return SymbolKind.Variable;
            case 'constant':
                return SymbolKind.Constant;
            case 'typedef':
                return SymbolKind.TypeParameter;
            case 'enum':
                return SymbolKind.Enum;
            case 'enum_constant':
                return SymbolKind.EnumMember;
            case 'inherit':
                return SymbolKind.Class;
            case 'import':
                return SymbolKind.Module;
            case 'module':
                return SymbolKind.Module;
            default:
                return SymbolKind.Variable;
        }
    }
}
