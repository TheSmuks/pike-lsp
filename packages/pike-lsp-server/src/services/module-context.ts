/**
 * Module Context Service
 *
 * Provides import/include/inherit/require resolution and management.
 * Uses PikeBridge's extractImports, resolveImport, checkCircular, and
 * getWaterfallSymbols methods for comprehensive module tracking.
 */
import { LRUCache } from './lru-cache.js';

import { computeContentHash } from './document-cache.js';
import type {
  ExtractedImport,
  ResolveImportResult,
  WaterfallSymbolsResult,
  CircularCheckResult,
  ImportType,
} from '@pike-lsp/pike-bridge';

/**
 * Cached import data for a document.
 */
interface ModuleImportData {
  /** Document URI */
  uri: string;
  /** Extracted imports */
  imports: ExtractedImport[];
  /** Resolved import paths (path -> resolved path) */
  resolved: Map<string, string>;
  /** Timestamp when data was extracted */
  timestamp: number;
}

/**
 * Module Context Service
 *
 * Manages import extraction, resolution, and waterfall symbol loading
 * for Pike documents.
 */
export class ModuleContext {
  private static readonly CACHE_TTL_MS = 5000;
  private readonly cache: LRUCache<string, ModuleImportData>;
  private pending = new Map<string, Promise<ModuleImportData>>();
  private readonly waterfallCache: LRUCache<
    string,
    { contentHash: string; symbols: WaterfallSymbolsResult; timestamp: number }
  >;
  private waterfallPending = new Map<
    string,
    Promise<{ contentHash: string; symbols: WaterfallSymbolsResult }>
  >();
  /** Maps base URI to its set of waterfall cache keys for O(k) invalidation. */
  private uriToWaterfallKeys = new Map<string, Set<string>>();

  constructor(maxCacheSize = 200) {
    this.cache = new LRUCache({ maxSize: maxCacheSize });
    this.waterfallCache = new LRUCache({
      maxSize: maxCacheSize,
      onEvict: key => {
        // Clean up the secondary index when LRU evicts a waterfall entry.
        for (const keys of this.uriToWaterfallKeys.values()) {
          keys.delete(key);
        }
      },
    });
  }

  /**
   * Get imports for a document.
   * @param uri - Document URI
   * @param content - Document content
   * @param bridge - PikeBridge instance
   * @param filename - Filename for Pike (extracted from URI)
   */
  async getImportsForDocument(
    uri: string,
    content: string,
    bridge: {
      extractImports: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.extractImports;
    },
    filename?: string
  ): Promise<ExtractedImport[]> {
    // Check cache first
    const cached = this.cache.get(uri);
    const cacheAge = Date.now() - (cached?.timestamp ?? 0);

    if (cached && cacheAge < ModuleContext.CACHE_TTL_MS) {
      return cached.imports;
    }

    // Check for pending request
    const pending = this.pending.get(uri);
    if (pending) {
      const result = await pending;
      return result.imports;
    }

    // Extract imports using PikeBridge
    const promise = this.extractImports(uri, content, bridge, filename);
    this.pending.set(uri, promise);

    try {
      const result = await promise;
      this.cache.set(uri, result);
      return result.imports;
    } finally {
      this.pending.delete(uri);
    }
  }

  /**
   * Resolve an import target to its file path.
   * @param importType - Type of import (include, import, inherit, require)
   * @param target - Import target path
   * @param currentFile - Current file URI for relative resolution
   * @param bridge - PikeBridge instance
   */
  async resolveImportTarget(
    importType: ImportType,
    target: string,
    currentFile: string,
    bridge: {
      resolveImport: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.resolveImport;
    }
  ): Promise<ResolveImportResult> {
    return bridge.resolveImport(importType, target, currentFile);
  }

  /**
   * Get waterfall symbols for a document (transitive imports).
   * @param uri - Document URI
   * @param content - Document content
   * @param bridge - PikeBridge instance
   * @param maxDepth - Maximum depth for transitive resolution
   */
  async getWaterfallSymbolsForDocument(
    uri: string,
    content: string,
    bridge: {
      extractImports: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.extractImports;
      getWaterfallSymbols: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.getWaterfallSymbols;
    },
    maxDepth: number = 5
  ): Promise<WaterfallSymbolsResult> {
    // Create content hash for cache key (simple hash for change detection)
    const contentHash = computeContentHash(content);
    const cacheKey = `${uri}:${maxDepth}`;

    // Check cache first
    const cached = this.waterfallCache.get(cacheKey);
    const cacheAge = Date.now() - (cached?.timestamp ?? 0);

    if (cached && cached.contentHash === contentHash && cacheAge < ModuleContext.CACHE_TTL_MS) {
      return cached.symbols;
    }

    // Check for pending request
    const pending = this.waterfallPending.get(cacheKey);
    if (pending) {
      const result = await pending;
      return result.symbols;
    }

    // Fetch waterfall symbols
    const filename = this.uriToFilename(uri);
    const promise = (async () => {
      const symbols = await bridge.getWaterfallSymbols(content, filename, maxDepth);
      return { contentHash, symbols };
    })();

    this.waterfallPending.set(cacheKey, promise);

    // Register key in secondary index for O(k) invalidation.
    // Must happen before the await so invalidate() can clean up
    // pending entries during in-flight fetches.
    let keys = this.uriToWaterfallKeys.get(uri);
    if (!keys) {
      keys = new Set();
      this.uriToWaterfallKeys.set(uri, keys);
    }
    keys.add(cacheKey);

    try {
      const result = await promise;
      this.waterfallCache.set(cacheKey, {
        contentHash: result.contentHash,
        symbols: result.symbols,
        timestamp: Date.now(),
      });
      return result.symbols;
    } finally {
      this.waterfallPending.delete(cacheKey);
    }
  }

  /**
   * Check for circular dependencies in a document.
   * @param uri - Document URI
   * @param content - Document content
   * @param bridge - PikeBridge instance
   */
  async checkCircularDependencies(
    uri: string,
    content: string,
    bridge: {
      extractImports: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.extractImports;
      checkCircular: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.checkCircular;
    }
  ): Promise<CircularCheckResult> {
    const filename = this.uriToFilename(uri);
    return bridge.checkCircular(content, filename);
  }

  /**
   * Invalidate cached data for a document.
   * @param uri - Document URI
   */
  invalidate(uri: string): void {
    this.cache.delete(uri);
    this.pending.delete(uri);
    // Invalidate waterfall cache entries for this URI using secondary index
    const keys = this.uriToWaterfallKeys.get(uri);
    if (keys) {
      for (const key of keys) {
        this.waterfallCache.delete(key);
        this.waterfallPending.delete(key);
      }
      this.uriToWaterfallKeys.delete(uri);
    }
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
    this.waterfallCache.clear();
    this.waterfallPending.clear();
    this.uriToWaterfallKeys.clear();
  }

  /** Returns the total number of cached entries across both caches. */
  get size(): number {
    return this.cache.entryCount + this.waterfallCache.entryCount;
  }

  /**
   * Extract imports from document content.
   */
  private async extractImports(
    uri: string,
    content: string,
    bridge: {
      extractImports: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.extractImports;
    },
    filename?: string
  ): Promise<ModuleImportData> {
    const fname = filename || this.uriToFilename(uri);
    const result = await bridge.extractImports(content, fname);

    const resolved = new Map<string, string>();
    for (const imp of result.imports) {
      if (imp.path && imp.resolved_path) {
        resolved.set(imp.path, imp.resolved_path);
      }
    }

    return {
      uri,
      imports: result.imports,
      resolved,
      timestamp: Date.now(),
    };
  }

  /**
   * Convert document URI to filename for Pike.
   * Handles file:// URIs and workspace paths.
   */
  private uriToFilename(uri: string): string {
    // Remove file:// prefix
    if (uri.startsWith('file://')) {
      return decodeURIComponent(uri.substring(7));
    }
    return uri;
  }
}
