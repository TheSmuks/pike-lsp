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

  constructor(
    private readonly bridge: BridgeManager | null,
    private readonly logger: Logger
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
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const symbol of importSymbols) {
      const modulePath = this.getSymbolClassname(symbol) ?? symbol.name;
      if (!modulePath) continue;

      const isStdlib = await this.isStdlibModule(modulePath);
      const importData: ResolvedImport = { modulePath, isStdlib };

      if (!isStdlib) {
        try {
          const resolved = await this.resolveWorkspaceImport(modulePath, uri);
          if (resolved) {
            importData.symbols = resolved.symbols;
            importData.resolvedPath = resolved.resolvedPath;
          }
        } catch (err) {
          this.logger.debug('Failed to resolve workspace import', {
            error: err instanceof Error ? err.message : String(err),
          });
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
    lastModified: number;
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
          lastModified: cached.lastModified,
        };
      }

      const symbols = await this.bridge.parseFileSymbols(normalizedPath);
      const now = Date.now();

      const resolved: ResolvedInclude = {
        originalPath: result.originalPath,
        resolvedPath: normalizedPath,
        symbols,
        lastModified: now,
      };

      this.includePathIndex.set(normalizedPath, resolved);

      return {
        normalizedPath,
        originalPath: result.originalPath,
        symbols,
        lastModified: now,
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
      lastModified: result.lastModified,
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
   */
  invalidate(filePath: string): void {
    this.includePathIndex.delete(this.normalizeFilePath(filePath));
  }

  /**
   * Clear all cached includes.
   */
  clear(): void {
    this.includePathIndex.clear();
  }

  /**
   * Get cache statistics from the include path index.
   */
  getStats(): { cachedIncludes: number; totalSymbols: number } {
    let totalSymbols = 0;

    const cachedIncludes = this.includePathIndex.size;
    for (const inc of this.includePathIndex.values()) {
      totalSymbols += inc.symbols.length;
    }

    return { cachedIncludes, totalSymbols };
  }

  private normalizeFilePath(filePath: string): string {
    const pathWithoutScheme = filePath.replace(/^file:\/\//, '');
    return decodeURIComponent(pathWithoutScheme);
  }
}
