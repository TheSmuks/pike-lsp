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
import type { DocumentCache } from './document-cache.js';
import type { ResolvedInclude, ResolvedImport, DocumentDependencies } from '../core/types.js';
import { Logger } from '@pike-lsp/core';

/**
 * Include Resolver Service
 *
 * Resolves #include paths to absolute file paths and extracts
 * symbols from included files for IntelliSense completion.
 * Leverages DocumentCache to reuse already-resolved dependencies.
 */
export class IncludeResolver {
  constructor(
    private readonly bridge: BridgeManager | null,
    private readonly logger: Logger,
    private readonly docCache?: DocumentCache
  ) {}

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

    // Resolve #include statements
    for (const symbol of includeSymbols) {
      const includePath = this.getSymbolClassname(symbol) ?? symbol.name;
      if (!includePath) continue;

      try {
        const resolved = await this.resolveSingleInclude(includePath, uri);
        if (resolved) {
          dependencies.includes.push(resolved);
        }
      } catch (err) {
        this.logger.debug('Failed to resolve include', {
          includePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Track import statements
    for (const symbol of importSymbols) {
      const modulePath = this.getSymbolClassname(symbol) ?? symbol.name;
      if (!modulePath) continue;

      const isStdlib = await this.isStdlibModule(modulePath);

      const importData: ResolvedImport = {
        modulePath,
        isStdlib,
      };

      if (!isStdlib) {
        const resolved = await this.resolveWorkspaceImport(modulePath, uri);
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
   * Resolve a single include path using bridge.resolveInclude()
   * and parse symbols via BridgeManager.parseFileSymbols().
   *
   * Checks DocumentCache for already-resolved dependencies from
   * prior document analysis before making bridge calls.
   */
  private async resolveSingleInclude(
    includePath: string,
    currentUri: string
  ): Promise<ResolvedInclude | null> {
    if (!this.bridge?.bridge) {
      return null;
    }

    try {
      const result = await this.bridge.bridge.resolveInclude(includePath, currentUri);

      if (!result.exists || !result.path) {
        return null;
      }

      const normalizedPath = this.normalizeFilePath(result.path);

      // Check if another document already resolved this include
      const cached = this.findCachedInclude(normalizedPath);
      if (cached) {
        return cached;
      }

      // Parse the included file via bridge API
      const symbols = await this.bridge.parseFileSymbols(normalizedPath);

      const resolved: ResolvedInclude = {
        originalPath: result.originalPath,
        resolvedPath: normalizedPath,
        symbols,
        lastModified: Date.now(),
      };

      return resolved;
    } catch (err) {
      this.logger.debug('Include resolution failed', {
        includePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Resolve a workspace import path using bridge.resolveInclude()
   * and parse symbols via BridgeManager.parseFileSymbols().
   */
  private async resolveWorkspaceImport(
    modulePath: string,
    currentUri: string
  ): Promise<{ symbols: PikeSymbol[]; resolvedPath: string } | null> {
    if (!this.bridge?.bridge) {
      return null;
    }

    try {
      const result = await this.bridge.bridge.resolveInclude(modulePath, currentUri);

      if (!result.exists || !result.path) {
        return null;
      }

      const normalizedPath = this.normalizeFilePath(result.path);

      // Check if another document already resolved this include
      const cached = this.findCachedInclude(normalizedPath);
      if (cached) {
        return {
          symbols: cached.symbols,
          resolvedPath: normalizedPath,
        };
      }

      const symbols = await this.bridge.parseFileSymbols(normalizedPath);

      return {
        symbols,
        resolvedPath: normalizedPath,
      };
    } catch (err) {
      this.logger.debug('Workspace import resolution failed', {
        modulePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Find a previously resolved include from the DocumentCache.
   *
   * Scans all cached document entries for an include matching
   * the given resolved path, avoiding redundant bridge/parse calls.
   */
  private findCachedInclude(resolvedPath: string): ResolvedInclude | null {
    if (!this.docCache) {
      return null;
    }

    for (const [, entry] of this.docCache.entries()) {
      const match = entry.dependencies?.includes.find(
        inc => this.normalizeFilePath(inc.resolvedPath) === resolvedPath
      );
      if (match) {
        return match;
      }
    }

    return null;
  }

  /**
   * Check if a module is a stdlib module via bridge.resolveStdlib().
   */
  private async isStdlibModule(modulePath: string): Promise<boolean> {
    if (!this.bridge?.bridge) {
      return false;
    }

    try {
      const result = await this.bridge.bridge.resolveStdlib(modulePath);
      return result.found === 1;
    } catch (err) {
      this.logger.debug('Failed stdlib module resolution', {
        modulePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
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
   *
   * With DocumentCache-based caching, this is a no-op —
   * invalidation happens when the owning document's cache entry
   * is updated or removed.
   */
  invalidate(_filePath: string): void {
    // Cache is managed by DocumentCache; nothing to invalidate here.
  }

  /**
   * Clear all cached includes.
   *
   * With DocumentCache-based caching, this is a no-op.
   */
  clear(): void {
    // Cache is managed by DocumentCache; nothing to clear here.
  }

  /**
   * Get cache statistics from the DocumentCache.
   */
  getStats(): { cachedIncludes: number; totalSymbols: number } {
    let cachedIncludes = 0;
    let totalSymbols = 0;

    if (this.docCache) {
      for (const [, entry] of this.docCache.entries()) {
        const includes = entry.dependencies?.includes ?? [];
        cachedIncludes += includes.length;
        for (const inc of includes) {
          totalSymbols += inc.symbols.length;
        }
      }
    }

    return { cachedIncludes, totalSymbols };
  }

  private normalizeFilePath(filePath: string): string {
    const pathWithoutScheme = filePath.replace(/^file:\/\//, '');
    return decodeURIComponent(pathWithoutScheme);
  }
}
