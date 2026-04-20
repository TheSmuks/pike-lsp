/**
 * Workspace Symbol Index
 *
 * Maintains an index of symbols across all Pike files in the workspace.
 * Enables fast workspace-wide symbol search (Ctrl+T).
 *
 * Search logic: workspace-index-search.ts
 * Types: workspace-index-types.ts
 * Directory scanning: workspace-index-scanner.ts
 */

import { PikeSymbol, PikeBridge } from '@pike-lsp/pike-bridge';
import { SymbolInformation } from 'vscode-languageserver';
import * as path from 'path';
import { LSP } from './constants/index.js';
import { Logger } from '@pike-lsp/core';
import type {
  IndexedDocument,
  FlattenedSymbolEntry,
  SymbolEntry,
  ImportableSymbolSearchResult,
  IndexErrorCallback,
  IndexProgressCallback,
  IndexMetrics,
} from './workspace-index-types.js';
import {
  type LookupState,
  searchImportableSymbols,
  scoreResult,
  convertSymbolKind,
  normalizeLineToZeroBased,
  toFlattenedSymbolEntry,
  addToLookup,
  removeFromLookup,
  invalidateSearchCacheForUri,
  collectMatchingNames,
  PREFIX_INDEX_MAX_DEPTH,
  PREFIX_INDEX_MAX_SIZE,
  PREFIX_INDEX_EVICT_BATCH,
  SEARCH_CACHE_MAX_SIZE,
  SEARCH_CACHE_TTL_MS,
} from './workspace-index-search.js';
import { indexDirectory } from './workspace-index-scanner.js';

// Re-export types that consumers import from this module
export type {
  ImportableSymbolSearchResult,
  IndexErrorCallback,
  IndexMetrics,
} from './workspace-index-types.js';

/**
 * WorkspaceIndex manages symbol indexing across the workspace
 */
export class WorkspaceIndex {
  private documents = new Map<string, IndexedDocument>();
  private symbolLookup = new Map<string, Map<string, SymbolEntry>>();
  private uriToSymbols = new Map<string, Set<string>>();
  private prefixIndex = new Map<string, Set<string>>();
  private substringIndex = new Map<string, Set<string>>();
  private searchCache = new Map<string, { results: SymbolInformation[]; timestamp: number }>();
  private searchCacheHits = 0;
  private searchCacheMisses = 0;

  // PERF-1273: Expose prefix index constants for test access.
  static readonly PREFIX_INDEX_MAX_DEPTH = PREFIX_INDEX_MAX_DEPTH;
  static readonly PREFIX_INDEX_MAX_SIZE = PREFIX_INDEX_MAX_SIZE;
  static readonly PREFIX_INDEX_EVICT_BATCH = PREFIX_INDEX_EVICT_BATCH;
  static readonly SEARCH_CACHE_MAX_SIZE = SEARCH_CACHE_MAX_SIZE;
  static readonly SEARCH_CACHE_TTL_MS = SEARCH_CACHE_TTL_MS;
  private bridge: PikeBridge | null = null;
  private onError: IndexErrorCallback | null = null;
  private metrics: IndexMetrics = {
    lastIndexTimeMs: 0,
    lastFileDiscoveryMs: 0,
    lastFileReadMs: 0,
    lastParsingMs: 0,
    lastIndexingMs: 0,
    lastFileCount: 0,
    totalFilesIndexed: 0,
  };
  private log = new Logger('WorkspaceIndex');

  constructor(bridge?: PikeBridge) {
    this.bridge = bridge ?? null;
  }

  /** Build LookupState snapshot for passing to search/lookup functions. */
  private lookupState(): LookupState {
    return {
      symbolLookup: this.symbolLookup,
      uriToSymbols: this.uriToSymbols,
      prefixIndex: this.prefixIndex,
      substringIndex: this.substringIndex,
      searchCache: this.searchCache,
      searchCacheHits: this.searchCacheHits,
      searchCacheMisses: this.searchCacheMisses,
    };
  }

  setErrorCallback(callback: IndexErrorCallback): void {
    this.onError = callback;
  }

  getMetrics(): IndexMetrics {
    return { ...this.metrics };
  }

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

  private reportError(message: string, uri?: string): void {
    this.log.error(message, { uri });
    this.onError?.(message, uri);
  }

  setBridge(bridge: PikeBridge): void {
    this.bridge = bridge;
  }

  private flattenSymbols(symbols: PikeSymbol[], parentPath: string[] = []): FlattenedSymbolEntry[] {
    const flat: FlattenedSymbolEntry[] = [];
    for (const sym of symbols) {
      const parentName = parentPath.length > 0 ? parentPath.join('.') : undefined;
      flat.push(parentName ? { symbol: sym, parentName } : { symbol: sym });
      if (sym.children && sym.children.length > 0) {
        flat.push(...this.flattenSymbols(sym.children, [...parentPath, sym.name]));
      }
    }
    return flat;
  }

  private countLines(content: string): number {
    return content.length === 0 ? 1 : content.split('\n').length;
  }

  async indexDocument(uri: string, content: string, version: number): Promise<void> {
    if (!this.bridge?.isRunning()) return;

    const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));
    try {
      const result = await this.bridge.analyze(content, ['parse'], filename);
      const parsedSymbols = result.result?.parse?.symbols ?? [];
      const symbols = this.flattenSymbols(parsedSymbols);
      const lineCount = this.countLines(content);

      if (this.documents.has(uri)) {
        this.removeFromLookup(uri);
      }

      this.documents.set(uri, { uri, symbols, version, lastModified: Date.now(), lineCount });
      this.addToLookup(uri, symbols, lineCount);
      this.searchCache.clear();
    } catch (err) {
      this.reportError(
        `[Pike LSP] Failed to index document: ${err instanceof Error ? err.message : String(err)}`,
        uri
      );
    }
  }

  removeDocument(uri: string): void {
    this.removeFromLookup(uri);
    this.documents.delete(uri);
    this.invalidateSearchCacheForUri(uri);
  }

  getDocumentSymbols(uri: string): PikeSymbol[] {
    const symbols = this.documents.get(uri)?.symbols ?? [];
    return symbols.map(symbol => toFlattenedSymbolEntry(symbol).symbol);
  }

  searchImportableSymbols(
    query: string,
    options: { excludeUri?: string; limit?: number } = {}
  ): ImportableSymbolSearchResult[] {
    return searchImportableSymbols(
      query,
      this.symbolLookup,
      this.prefixIndex,
      options,
      uri => this.uriToModulePath(uri),
      this.substringIndex
    );
  }

  /**
   * Search for symbols across the workspace.
   * PERF-430: Uses LRU cache for search results
   */
  searchSymbols(query: string, limit: number = LSP.MAX_WORKSPACE_SYMBOLS): SymbolInformation[] {
    const results: SymbolInformation[] = [];
    const queryLower = query?.toLowerCase() ?? '';

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
          const normalizedEntry = toFlattenedSymbolEntry(entry);
          if (!normalizedEntry.symbol.name) continue;
          results.push(
            this.toSymbolInformation(
              normalizedEntry.symbol,
              uri,
              normalizedEntry.parentName,
              doc.lineCount
            )
          );
          if (results.length >= limit) return results;
        }
      }
      return results;
    }

    const matched = this.collectSearchMatches(queryLower);
    const finalResults = matched.slice(0, limit).map(m => m.result);

    if (this.searchCache.size >= WorkspaceIndex.SEARCH_CACHE_MAX_SIZE) {
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey !== undefined) this.searchCache.delete(oldestKey);
    }
    this.searchCache.set(cacheKey, { results: finalResults, timestamp: Date.now() });
    return finalResults;
  }

  private collectSearchMatches(
    queryLower: string
  ): Array<{ result: SymbolInformation; score: number }> {
    const matched: Array<{ result: SymbolInformation; score: number }> = [];
    const matchingNames = collectMatchingNames(
      queryLower,
      this.symbolLookup,
      this.prefixIndex,
      this.substringIndex
    );

    for (const name of matchingNames) {
      const entriesByUri = this.symbolLookup.get(name);
      if (!entriesByUri) continue;
      for (const entry of entriesByUri.values()) {
        if (
          !entry.name.toLowerCase().startsWith(queryLower) &&
          !entry.name.toLowerCase().includes(queryLower)
        )
          continue;
        const line = normalizeLineToZeroBased(entry.line, entry.maxLine);
        const result: SymbolInformation = {
          name: entry.name,
          kind: convertSymbolKind(entry.kind),
          location: {
            uri: entry.uri,
            range: { start: { line, character: 0 }, end: { line, character: entry.name.length } },
          },
        };
        if (entry.parentName) result.containerName = entry.parentName;
        matched.push({ result, score: scoreResult(result, queryLower) });
      }
    }

    matched.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.01) return b.score - a.score;
      if (a.result.name.length !== b.result.name.length)
        return a.result.name.length - b.result.name.length;
      return a.result.name.localeCompare(b.result.name);
    });
    return matched;
  }

  async indexDirectory(
    dirPath: string,
    recursive: boolean = true,
    onProgress?: IndexProgressCallback
  ): Promise<number> {
    return indexDirectory(
      {
        documents: this.documents,
        metrics: this.metrics,
        bridge: this.bridge,
        log: this.log,
        flattenSymbols: s => this.flattenSymbols(s),
        countLines: c => this.countLines(c),
        removeDocument: u => this.removeDocument(u),
        addToLookup: (u, s, l) => this.addToLookup(u, s, l),
        removeFromLookup: u => this.removeFromLookup(u),
        reportError: (m, u) => this.reportError(m, u),
      },
      dirPath,
      recursive,
      onProgress
    );
  }

  getStats(): { documents: number; symbols: number; uniqueNames: number } {
    let symbolCount = 0;
    for (const doc of this.documents.values()) symbolCount += doc.symbols.length;
    return {
      documents: this.documents.size,
      symbols: symbolCount,
      uniqueNames: this.symbolLookup.size,
    };
  }

  clear(): void {
    this.documents.clear();
    this.symbolLookup.clear();
    this.uriToSymbols.clear();
    this.prefixIndex.clear();
    this.substringIndex.clear();
    this.searchCache.clear();
    this.searchCacheHits = 0;
    this.searchCacheMisses = 0;
  }

  /**
   * Find the URI of a class by name using the symbolLookup index.
   * O(1) lookup by name, then O(uris with that name) to filter by kind.
   */
  findClassUri(className: string): string | null {
    const entriesByUri = this.symbolLookup.get(className.toLowerCase());
    if (!entriesByUri) return null;

    for (const [, entry] of entriesByUri) {
      if (entry.kind === 'class') {
        return entry.uri;
      }
    }
    return null;
  }

  /**
   * Get a class symbol (with children) from a specific document URI.
   * O(symbols in one document) — not O(symbols across all documents).
   */
  getClassSymbol(className: string, uri: string): PikeSymbol | null {
    const doc = this.documents.get(uri);
    if (!doc) return null;

    for (const entry of doc.symbols) {
      const symbol = 'symbol' in entry ? entry.symbol : entry;
      if (symbol.kind === 'class' && symbol.name === className) {
        return symbol;
      }
    }
    return null;
  }
  /**
   * Get URIs of all documents containing a symbol with the given name.
   * Uses the symbolLookup index for O(1) lookup instead of scanning all documents.
   * Lookup is case-insensitive (symbol names are stored lowercased).
   */
  getUrisForSymbolName(symbolName: string): string[] {
    const entriesByUri = this.symbolLookup.get(symbolName.toLowerCase());
    if (!entriesByUri) return [];
    return Array.from(entriesByUri.keys());
  }

  getAllDocumentUris(): string[] {
    return Array.from(this.documents.keys());
  }

  private uriToModulePath(uri: string): string | null {
    const normalizedUri = decodeURIComponent(uri);
    const withoutScheme = normalizedUri.startsWith('file://')
      ? normalizedUri.slice('file://'.length)
      : normalizedUri;
    const basename = path.basename(withoutScheme);
    if (!basename) return null;
    const dotIndex = basename.lastIndexOf('.');
    return dotIndex <= 0 ? basename : basename.slice(0, dotIndex);
  }

  private toSymbolInformation(
    symbol: PikeSymbol,
    uri: string,
    parentName?: string,
    maxLineCount?: number
  ): SymbolInformation {
    const line = normalizeLineToZeroBased(symbol.position?.line, maxLineCount);
    const result: SymbolInformation = {
      name: symbol.name,
      kind: convertSymbolKind(symbol.kind),
      location: {
        uri,
        range: { start: { line, character: 0 }, end: { line, character: symbol.name.length } },
      },
    };
    if (parentName) result.containerName = parentName;
    return result;
  }

  // Private lookup methods - kept for test access via casting
  private addToLookup(uri: string, symbols: FlattenedSymbolEntry[], maxLineCount?: number): void {
    addToLookup(this.lookupState(), uri, symbols, maxLineCount);
  }

  private removeFromLookup(uri: string): void {
    removeFromLookup(this.lookupState(), uri);
  }

  private invalidateSearchCacheForUri(uri: string): void {
    invalidateSearchCacheForUri(this.searchCache, uri);
  }
}
