/**
 * Include Resolver Service
 *
 * Manages resolution of #include dependencies using the bridge/parser API.
 * Uses BridgeManager.parseFileSymbols() for symbol extraction and
 * bridge.resolveInclude() for path resolution — no raw regex or direct
 * filesystem stat() calls.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { BridgeManager } from './bridge-manager.js';
import type { ResolvedInclude, ResolvedImport, DocumentDependencies } from '../core/types.js';
import { Logger } from '@pike-lsp/core';
import { LRUCache } from './lru-cache.js';
import { MAX_CONCURRENT_STDLIB_REQUESTS, MAX_STDLIB_CACHE_SIZE } from '../constants/index.js';

/**
 * Include Resolver Service
 *
 * Resolves #include paths to absolute file paths and extracts
 * symbols from included files for IntelliSense completion.
 * Maintains a reverse index for O(1) include path lookup.
 */
export class IncludeResolver {
  /** Reverse index: normalized resolvedPath -> ResolvedInclude for O(1) lookup. */
  private includePathIndex = new Map<string, ResolvedInclude>();

  /** LRU cache for isStdlibModule() results. */
  private readonly stdlibCache: LRUCache<string, boolean>;

  /** Semaphore state for concurrency-limited stdlib resolution. */
  private readonly stdlibSemaphore = {
    maxConcurrent: MAX_CONCURRENT_STDLIB_REQUESTS,
    active: 0,
    queue: [] as Array<() => void>,
  };

  constructor(
    private readonly bridge: BridgeManager | null,
    private readonly logger: Logger
  ) {
    this.stdlibCache = new LRUCache<string, boolean>(MAX_STDLIB_CACHE_SIZE);
  }

  /**
   * Resolve dependencies for a document.
   *
   * Extracts #include and import symbols, resolves their paths
   * via the bridge API, and parses symbols from resolved files.
   *
   * @param uri - Document URI
   * @param symbols - Symbols from the document
   * @returns Document dependencies with resolved includes and imports
   */
  async resolveDependencies(uri: string, symbols: PikeSymbol[]): Promise<DocumentDependencies> {
    const dependencies: DocumentDependencies = {
      includes: [],
      imports: [],
    };

    const includeSymbols = symbols.filter(s => s.kind === 'include');
    const importSymbols = symbols.filter(s => s.kind === 'import');

    // Resolve #include statements in parallel
    const includeResults = await Promise.allSettled(
      includeSymbols
        .map(s => this.getSymbolClassname(s) ?? s.name)
        .filter((p): p is string => p !== '')
        .map(p => this.resolveSingleInclude(p, uri))
    );

    for (const result of includeResults) {
      if (result.status === 'fulfilled' && result.value) {
        dependencies.includes.push(result.value);
      } else if (result.status === 'rejected') {
        this.logger.debug('Failed to resolve include', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    // Resolve import statements in parallel
    const importEntries = importSymbols
      .map(s => this.getSymbolClassname(s) ?? s.name)
      .filter((p): p is string => p !== '');

    // Check stdlib status in parallel
    const stdlibResults = await Promise.all(importEntries.map(p => this.isStdlibModule(p)));

    // Resolve workspace imports (non-stdlib only) in parallel
    const workspaceIndices = stdlibResults
      .map((isStdlib, i) => (!isStdlib ? i : -1))
      .filter((i): i is number => i >= 0);
    const workspaceResults = await Promise.all(
      workspaceIndices.map(i => this.resolveWorkspaceImport(importEntries[i]!, uri))
    );

    const indexMap = new Map(
      workspaceIndices.map((importIdx, resultIdx) => [importIdx, resultIdx])
    );

    for (let i = 0; i < importEntries.length; i++) {
      const isStdlib = stdlibResults[i]!;
      const importData: ResolvedImport = { modulePath: importEntries[i]!, isStdlib };

      if (!isStdlib) {
        const wi = indexMap.get(i);
        const resolved = wi !== undefined ? workspaceResults[wi] : undefined;
        if (resolved) {
          importData.symbols = resolved.symbols;
          importData.resolvedPath = resolved.resolvedPath;
        }
      }

      dependencies.imports.push(importData);
    }

    return dependencies;
  }

  private getSymbolClassname(symbol: PikeSymbol): string | undefined {
    if ('classname' in symbol && typeof symbol.classname === 'string') {
      return symbol.classname;
    }
    return undefined;
  }

  /**
   * Shared resolve-then-parse-then-cache flow.
   *
   * Calls bridge.resolveInclude(), normalizes the path, checks the cache,
   * parses symbols on miss, and stores the result.
   *
   * @returns null when bridge is unavailable or the path does not exist.
   */
  private async resolveAndCache(
    path: string,
    currentUri: string,
    logLabel: string
  ): Promise<{
    normalizedPath: string;
    originalPath: string;
    symbols: PikeSymbol[];
  } | null> {
    if (!this.bridge?.bridge) {
      return null;
    }

    try {
      const result = await this.bridge.bridge.resolveInclude(path, currentUri);

      if (!result.exists || !result.path) {
        return null;
      }

      const normalizedPath = this.normalizeFilePath(result.path);

      const cached = this.findCachedInclude(normalizedPath);
      if (cached) {
        return {
          normalizedPath,
          originalPath: cached.originalPath,
          symbols: cached.symbols,
        };
      }

      const symbols = await this.bridge.parseFileSymbols(normalizedPath);

      const resolved: ResolvedInclude = {
        originalPath: result.originalPath,
        resolvedPath: normalizedPath,
        symbols,
      };

      this.includePathIndex.set(normalizedPath, resolved);

      return {
        normalizedPath,
        originalPath: result.originalPath,
        symbols,
      };
    } catch (err) {
      this.logger.debug(`${logLabel} failed`, {
        path,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Resolve a single include path and return a ResolvedInclude.
   */
  private async resolveSingleInclude(
    includePath: string,
    currentUri: string
  ): Promise<ResolvedInclude | null> {
    const result = await this.resolveAndCache(includePath, currentUri, 'Include resolution');
    if (!result) return null;

    return {
      originalPath: result.originalPath,
      resolvedPath: result.normalizedPath,
      symbols: result.symbols,
    };
  }

  /**
   * Resolve a workspace import path and return symbols + resolved path.
   */
  private async resolveWorkspaceImport(
    modulePath: string,
    currentUri: string
  ): Promise<{ symbols: PikeSymbol[]; resolvedPath: string } | null> {
    const result = await this.resolveAndCache(
      modulePath,
      currentUri,
      'Workspace import resolution'
    );
    if (!result) return null;

    return {
      symbols: result.symbols,
      resolvedPath: result.normalizedPath,
    };
  }

  /**
   * Find a previously resolved include from the include path index.
   *
   * O(1) lookup via reverse index from normalized resolvedPath
   * to ResolvedInclude entry.
   */
  private findCachedInclude(resolvedPath: string): ResolvedInclude | null {
    return this.includePathIndex.get(resolvedPath) ?? null;
  }

  /**
   * Check if a module is a stdlib module via bridge.resolveStdlib().
   * Uses LRU cache and concurrency-limited semaphore for batching.
   */
  private async isStdlibModule(modulePath: string): Promise<boolean> {
    if (!this.bridge?.bridge) {
      return false;
    }

    // Check cache first
    const cached = this.stdlibCache.get(modulePath);
    if (cached !== undefined) {
      return cached;
    }

    // Acquire concurrency slot
    await this.acquireStdlibSlot();

    try {
      const result = await this.bridge.bridge.resolveStdlib(modulePath);
      const isStdlib = result.found === 1;

      // Cache the result
      this.stdlibCache.set(modulePath, isStdlib);

      return isStdlib;
    } catch (err) {
      this.logger.debug('Failed stdlib module resolution', {
        modulePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      this.releaseStdlibSlot();
    }
  }

  private async acquireStdlibSlot(): Promise<void> {
    const sem = this.stdlibSemaphore;
    if (sem.active < sem.maxConcurrent) {
      sem.active++;
      return;
    }
    return new Promise<void>(resolve => {
      sem.queue.push(resolve);
    });
  }

  private releaseStdlibSlot(): void {
    const sem = this.stdlibSemaphore;
    const next = sem.queue.shift();
    if (next) {
      next();
    } else {
      sem.active--;
    }
  }

  /**
   * Get all symbols from document dependencies.
   *
   * @param dependencies - Document dependencies
   * @returns Array of all symbols from includes
   */
  async getDependencySymbols(dependencies: DocumentDependencies): Promise<PikeSymbol[]> {
    const symbols: PikeSymbol[] = [];

    for (const include of dependencies.includes) {
      symbols.push(...include.symbols);
    }

    // Import symbols are resolved via stdlibIndex in completion handler

    return symbols;
  }

  /**
   * Invalidate cache for a specific file.
   */
  invalidate(filePath: string): void {
    this.includePathIndex.delete(this.normalizeFilePath(filePath));
  }

  /**
   * Clear all cached includes.
   */
  clear(): void {
    this.includePathIndex.clear();
    this.stdlibCache.clear();
  }

  /**
   * Get cache statistics from the include path index.
   */
  getStats(): {
    cachedIncludes: number;
    totalSymbols: number;
    stdlibCacheHits: number;
    stdlibCacheMisses: number;
    stdlibCacheSize: number;
  } {
    let totalSymbols = 0;

    const cachedIncludes = this.includePathIndex.size;
    for (const inc of this.includePathIndex.values()) {
      totalSymbols += inc.symbols.length;
    }

    const stdlibStats = this.stdlibCache.getStats();

    return {
      cachedIncludes,
      totalSymbols,
      stdlibCacheHits: stdlibStats.hits,
      stdlibCacheMisses: stdlibStats.misses,
      stdlibCacheSize: stdlibStats.size,
    };
  }

  private normalizeFilePath(filePath: string): string {
    const pathWithoutScheme = filePath.replace(/^file:\/\//, '');
    return decodeURIComponent(pathWithoutScheme);
  }
}
