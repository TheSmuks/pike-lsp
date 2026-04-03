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
  parentName?: string; // WS-001: Parent symbol name for containerName field
}

export interface ImportableSymbolCandidate {
  name: string;
  symbolKind: string;
  uri: string;
  importKind: 'import' | 'inherit';
  statement: string;
  sourcePath: string;
}

type MatchTier = 'exact' | 'prefix' | 'camel' | 'substring' | 'none';

interface RankedSymbol {
  result: SymbolInformation;
  score: number;
}

interface PersistedWorkspaceIndex {
  version: number;
  documents: IndexedDocument[];
}

const WORKSPACE_INDEX_SCHEMA_VERSION = 1;

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

  private camelCaseIndex = new Map<string, Set<string>>();
  private nameToAcronym = new Map<string, string>();

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
      typeof maxLineCount === 'number' &&
      Number.isFinite(maxLineCount) &&
      Number.isInteger(maxLineCount) &&
      maxLineCount > 0
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
      this.reportError(
        `[Pike LSP] Failed to index document: ${err instanceof Error ? err.message : String(err)}`,
        uri
      );
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

    if (!queryLower) {
      for (const [uri, doc] of this.documents) {
        if (!doc.symbols) continue;
        for (const entry of doc.symbols.slice(0, 5)) {
          const normalizedEntry = this.toFlattenedSymbolEntry(entry);
          const symbol = normalizedEntry.symbol;
          // Skip symbols with null names
          if (!symbol.name) continue;
          results.push(
            this.toSymbolInformation(symbol, uri, normalizedEntry.parentName, doc.lineCount)
          );
          if (results.length >= limit) {
            return results;
          }
        }
      }
      return results;
    }

    const top: RankedSymbol[] = [];
    const seenNames = new Set<string>();

    const considerName = (nameLower: string): void => {
      if (seenNames.has(nameLower)) {
        return;
      }
      seenNames.add(nameLower);

      const entriesByUri = this.symbolLookup.get(nameLower);
      if (!entriesByUri) {
        return;
      }

      for (const entry of entriesByUri.values()) {
        const tier = this.getMatchTier(entry.name, queryLower);
        if (tier === 'none') {
          continue;
        }

        const result = this.toSymbolInformationFromEntry(entry);
        const score = this.scoreResult(result, queryLower, tier);
        this.insertTopResult(top, { result, score }, limit);
      }
    };

    considerName(queryLower);

    if (queryLower.length >= 2) {
      const prefixSet = this.prefixIndex.get(queryLower);
      if (prefixSet) {
        for (const nameLower of prefixSet) {
          considerName(nameLower);
        }
      }
    } else {
      for (const nameLower of this.symbolLookup.keys()) {
        if (nameLower.startsWith(queryLower)) {
          considerName(nameLower);
        }
      }
    }

    if (!this.topResultsAreTier(top, limit, 'prefix')) {
      const acronymSet = this.camelCaseIndex.get(queryLower);
      if (acronymSet) {
        for (const nameLower of acronymSet) {
          considerName(nameLower);
        }
      }

      for (const nameLower of this.symbolLookup.keys()) {
        if (seenNames.has(nameLower)) {
          continue;
        }
        if (this.getMatchTier(nameLower, queryLower) === 'camel') {
          considerName(nameLower);
        }
      }
    }

    if (!this.topResultsAreTier(top, limit, 'camel')) {
      for (const nameLower of this.symbolLookup.keys()) {
        if (seenNames.has(nameLower)) {
          continue;
        }
        if (nameLower.includes(queryLower)) {
          considerName(nameLower);
        }
      }
    }

    const finalResults = top.map(item => item.result);

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
  private scoreResult(result: SymbolInformation, queryLower: string, tier?: MatchTier): number {
    const nameLower = result.name.toLowerCase();
    const actualTier = tier ?? this.getMatchTier(result.name, queryLower);

    if (actualTier === 'none') {
      return Number.NEGATIVE_INFINITY;
    }

    const tierScore =
      actualTier === 'exact'
        ? 400_000
        : actualTier === 'prefix'
          ? 300_000
          : actualTier === 'camel'
            ? 200_000
            : 100_000;
    const startIndex = nameLower.indexOf(queryLower);
    const startPenalty = startIndex < 0 ? 0 : Math.min(startIndex, 500);
    const lengthPenalty = Math.min(result.name.length, 1000);
    const line = result.location.range.start.line;

    return tierScore - startPenalty * 100 - lengthPenalty - Math.min(line, 100_000) / 100_000;
  }

  private toSymbolInformationFromEntry(entry: SymbolEntry): SymbolInformation {
    const line = this.normalizeLineToZeroBased(entry.line, entry.maxLine);

    const result: SymbolInformation = {
      name: entry.name,
      kind: this.convertSymbolKind(entry.kind),
      location: {
        uri: entry.uri,
        range: {
          start: {
            line,
            character: 0,
          },
          end: {
            line,
            character: entry.name.length,
          },
        },
      },
    };

    if (entry.parentName) {
      result.containerName = entry.parentName;
    }

    return result;
  }

  private getMatchTier(name: string, queryLower: string): MatchTier {
    if (!queryLower) {
      return 'none';
    }

    const nameLower = name.toLowerCase();
    if (nameLower === queryLower) {
      return 'exact';
    }
    if (nameLower.startsWith(queryLower)) {
      return 'prefix';
    }
    if (this.isCamelCaseMatch(name, queryLower)) {
      return 'camel';
    }
    if (nameLower.includes(queryLower)) {
      return 'substring';
    }
    return 'none';
  }

  private isCamelCaseMatch(name: string, queryLower: string): boolean {
    if (!queryLower) {
      return false;
    }

    const acronym = this.buildAcronym(name);
    return acronym.startsWith(queryLower);
  }

  private buildAcronym(name: string): string {
    const initials: string[] = [];
    const letters = Array.from(name);
    for (let i = 0; i < letters.length; i++) {
      const ch = letters[i]!;
      const prev = i > 0 ? letters[i - 1]! : '';
      const isUpper = ch >= 'A' && ch <= 'Z';
      const isDigit = ch >= '0' && ch <= '9';
      const startsWord =
        i === 0 ||
        prev === '_' ||
        prev === '-' ||
        prev === '.' ||
        (isUpper && prev >= 'a' && prev <= 'z');
      if (startsWord && (/[A-Za-z]/.test(ch) || isDigit)) {
        initials.push(ch.toLowerCase());
      }
    }

    if (initials.length === 0 && name.length > 0) {
      initials.push(name[0]!.toLowerCase());
    }

    return initials.join('');
  }

  private insertTopResult(top: RankedSymbol[], candidate: RankedSymbol, limit: number): void {
    if (limit <= 0) {
      return;
    }

    if (top.length >= limit) {
      const worst = top[top.length - 1]!;
      if (this.compareRankedSymbols(candidate, worst) >= 0) {
        return;
      }
    }

    let insertAt = top.length;
    for (let i = 0; i < top.length; i++) {
      if (this.compareRankedSymbols(candidate, top[i]!) < 0) {
        insertAt = i;
        break;
      }
    }

    top.splice(insertAt, 0, candidate);
    if (top.length > limit) {
      top.pop();
    }
  }

  private compareRankedSymbols(a: RankedSymbol, b: RankedSymbol): number {
    if (Math.abs(a.score - b.score) > 0.0001) {
      return b.score - a.score;
    }

    if (a.result.name.length !== b.result.name.length) {
      return a.result.name.length - b.result.name.length;
    }

    const nameCmp = a.result.name.localeCompare(b.result.name);
    if (nameCmp !== 0) {
      return nameCmp;
    }

    const uriCmp = a.result.location.uri.localeCompare(b.result.location.uri);
    if (uriCmp !== 0) {
      return uriCmp;
    }

    return a.result.location.range.start.line - b.result.location.range.start.line;
  }

  private topResultsAreTier(top: RankedSymbol[], limit: number, minimumTier: MatchTier): boolean {
    if (top.length < limit || top.length === 0) {
      return false;
    }

    const worst = top[top.length - 1]!;
    const minimumTierScore =
      minimumTier === 'exact'
        ? 400_000
        : minimumTier === 'prefix'
          ? 300_000
          : minimumTier === 'camel'
            ? 200_000
            : 100_000;

    return worst.score >= minimumTierScore;
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
      const chunkData: Array<{
        code: string;
        filename: string;
        lastModified: number;
        lineCount: number;
      }> = [];
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
        this.reportError(
          `[Pike LSP] Batch parse failed for chunk ${chunkNumber}, falling back to sequential parsing: ${err instanceof Error ? err.message : String(err)}`
        );

        // Fallback to sequential parsing for this chunk
        for (const fileData of chunkData) {
          try {
            const analyzeResult = await this.bridge.analyze(
              fileData.code,
              ['parse'],
              fileData.filename
            );
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
    this.camelCaseIndex.clear();
    this.nameToAcronym.clear();
    this.searchCache.clear();
    this.searchCacheHits = 0;
    this.searchCacheMisses = 0;
  }

  serializeSymbolIndex(): string {
    const payload: PersistedWorkspaceIndex = {
      version: WORKSPACE_INDEX_SCHEMA_VERSION,
      documents: Array.from(this.documents.values()),
    };
    return JSON.stringify(payload);
  }

  hydrateSymbolIndex(serialized: string): number {
    try {
      const parsed = JSON.parse(serialized) as unknown;
      if (typeof parsed !== 'object' || parsed === null) {
        return 0;
      }

      const payload = parsed as PersistedWorkspaceIndex;
      if (
        payload.version !== WORKSPACE_INDEX_SCHEMA_VERSION ||
        !Array.isArray((payload as { documents?: unknown }).documents)
      ) {
        return 0;
      }

      this.clear();
      let loaded = 0;

      for (const document of payload.documents) {
        if (!document || typeof document.uri !== 'string' || !Array.isArray(document.symbols)) {
          continue;
        }

        const normalizedSymbols: FlattenedSymbolEntry[] = [];
        for (const maybeEntry of document.symbols) {
          const entry = this.toFlattenedSymbolEntry(maybeEntry);
          if (!entry.symbol?.name) {
            continue;
          }
          normalizedSymbols.push(entry);
        }

        const hydratedDocument: IndexedDocument = {
          uri: document.uri,
          symbols: normalizedSymbols,
          version: typeof document.version === 'number' ? document.version : 1,
          lastModified:
            typeof document.lastModified === 'number' ? document.lastModified : Date.now(),
        };
        if (typeof document.lineCount === 'number') {
          hydratedDocument.lineCount = document.lineCount;
        }

        this.documents.set(document.uri, hydratedDocument);
        this.addToLookup(document.uri, normalizedSymbols, document.lineCount);
        loaded++;
      }

      return loaded;
    } catch {
      return 0;
    }
  }

  /**
   * Get all indexed document URIs
   */
  getAllDocumentUris(): string[] {
    return Array.from(this.documents.keys());
  }

  searchImportableSymbols(
    query: string,
    currentUri: string,
    limit: number = LSP.MAX_WORKSPACE_SYMBOLS
  ): ImportableSymbolCandidate[] {
    const queryLower = query.toLowerCase();
    if (!queryLower) {
      return [];
    }

    const currentPath = this.uriToPath(currentUri);
    const candidates: ImportableSymbolCandidate[] = [];

    for (const [nameLower, entriesByUri] of this.symbolLookup) {
      if (!nameLower.includes(queryLower)) {
        continue;
      }

      for (const entry of entriesByUri.values()) {
        if (entry.uri === currentUri) {
          continue;
        }

        if (entry.kind === 'inherit' || entry.kind === 'import') {
          continue;
        }

        const targetPath = this.uriToPath(entry.uri);
        const sourcePath = this.toRelativeImportPath(currentPath, targetPath);
        const importKind = this.getImportKind(entry);
        const statement = this.buildImportStatement(importKind, entry.name, sourcePath);

        candidates.push({
          name: entry.name,
          symbolKind: entry.kind,
          uri: entry.uri,
          importKind,
          statement,
          sourcePath,
        });
      }
    }

    candidates.sort((a, b) => {
      const aMatchScore = this.matchScore(a.name, query);
      const bMatchScore = this.matchScore(b.name, query);
      if (aMatchScore !== bMatchScore) {
        return aMatchScore - bMatchScore;
      }

      if (a.importKind !== b.importKind) {
        return a.importKind.localeCompare(b.importKind);
      }

      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }

      if (a.sourcePath !== b.sourcePath) {
        return a.sourcePath.localeCompare(b.sourcePath);
      }

      return a.uri.localeCompare(b.uri);
    });

    return candidates.slice(0, limit);
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

        const acronym = this.buildAcronym(symbol.name);
        this.nameToAcronym.set(nameLower, acronym);
        for (let i = 1; i <= acronym.length; i++) {
          const prefix = acronym.slice(0, i);
          let acronymSet = this.camelCaseIndex.get(prefix);
          if (!acronymSet) {
            acronymSet = new Set<string>();
            this.camelCaseIndex.set(prefix, acronymSet);
          }
          acronymSet.add(nameLower);
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

      if (removeNameFromPrefixIndex) {
        const acronym = this.nameToAcronym.get(nameLower) ?? this.buildAcronym(nameLower);
        for (let i = 1; i <= acronym.length; i++) {
          const prefix = acronym.slice(0, i);
          const acronymSet = this.camelCaseIndex.get(prefix);
          if (acronymSet) {
            acronymSet.delete(nameLower);
            if (acronymSet.size === 0) {
              this.camelCaseIndex.delete(prefix);
            }
          }
        }
        this.nameToAcronym.delete(nameLower);
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

  private uriToPath(uri: string): string {
    return decodeURIComponent(uri.replace(/^file:\/\//, ''));
  }

  private toRelativeImportPath(fromPath: string, targetPath: string): string {
    const fromDir = path.dirname(fromPath);
    const relative = path.relative(fromDir, targetPath).replaceAll('\\', '/');

    if (relative.startsWith('../')) {
      return relative;
    }

    if (relative.startsWith('./')) {
      return relative;
    }

    return `./${relative}`;
  }

  private getImportKind(entry: SymbolEntry): 'import' | 'inherit' {
    if (entry.kind === 'class') {
      return 'inherit';
    }
    return 'import';
  }

  private buildImportStatement(
    kind: 'import' | 'inherit',
    symbolName: string,
    sourcePath: string
  ): string {
    if (kind === 'inherit') {
      return `inherit "${sourcePath}";`;
    }

    return `import ${symbolName};`;
  }

  private matchScore(name: string, query: string): number {
    const nameLower = name.toLowerCase();
    const queryLower = query.toLowerCase();

    if (name === query) {
      return 0;
    }
    if (nameLower === queryLower) {
      return 1;
    }
    if (nameLower.startsWith(queryLower)) {
      return 2;
    }
    return 3;
  }
}
