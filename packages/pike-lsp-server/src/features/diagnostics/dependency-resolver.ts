/**
 * Dependency Resolver
 *
 * Resolves #include and import dependencies using the bridge/parser API
 * directly, without going through IncludeResolver.
 *
 * Extracted from IncludeResolver.resolveDependencies() to remove the
 * cache-builder dependency on services.includeResolver (Issue #2166).
 */

import type { BridgeManager } from '../../services/bridge-manager.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { ResolvedInclude, ResolvedImport, DocumentDependencies } from '../../core/types.js';
import { getSymbolClassname } from '../editing/completion-scope.js';
import { Logger } from '@pike-lsp/core';

/**
 * Resolve include and import dependencies for a document via the bridge API.
 *
 * Filters symbols by kind === 'include' / 'import', resolves include paths
 * through bridge.resolveInclude() + bridge.parseFileSymbols(), and checks
 * import stdlib status via bridge.resolveStdlib(). Individual failures are
 * logged and skipped — the returned dependencies contain only successful
 * resolutions.
 */
export async function resolveDependenciesViaBridge(
  bridge: BridgeManager,
  uri: string,
  symbols: PikeSymbol[],
  log: Logger
): Promise<DocumentDependencies> {
  const dependencies: DocumentDependencies = { includes: [], imports: [] };

  const includeSymbols = symbols.filter(s => s.kind === 'include');
  const importSymbols = symbols.filter(s => s.kind === 'import');

  // Resolve #include statements in parallel
  const includePaths = includeSymbols
    .map(s => getSymbolClassname(s) ?? s.name)
    .filter((p): p is string => p !== '');

  const includeResults = await Promise.allSettled(
    includePaths.map(p => resolveSingleInclude(bridge, p, uri, log))
  );

  for (const result of includeResults) {
    if (result.status === 'fulfilled' && result.value) {
      dependencies.includes.push(result.value);
    } else if (result.status === 'rejected') {
      log.debug('Failed to resolve include', {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  // Resolve import statements in parallel
  const importEntries = importSymbols
    .map(s => getSymbolClassname(s) ?? s.name)
    .filter((p): p is string => p !== '');

  const stdlibResults = await Promise.allSettled(
    importEntries.map(p => isStdlibModule(bridge, p, log))
  );

  const workspaceIndices: number[] = [];
  for (let i = 0; i < stdlibResults.length; i++) {
    const r = stdlibResults[i]!;
    if (r.status === 'fulfilled' && !r.value) {
      workspaceIndices.push(i);
    }
  }

  const workspaceResults = await Promise.all(
    workspaceIndices.map(i => resolveSingleInclude(bridge, importEntries[i]!, uri, log))
  );

  const indexMap = new Map(workspaceIndices.map((importIdx, resultIdx) => [importIdx, resultIdx]));

  for (let i = 0; i < importEntries.length; i++) {
    const r = stdlibResults[i]!;
    const isStdlib = r.status === 'fulfilled' && r.value === true;
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

async function resolveSingleInclude(
  bridge: BridgeManager,
  path: string,
  currentUri: string,
  log: Logger
): Promise<ResolvedInclude | null> {
  if (!bridge.bridge) {
    return null;
  }

  try {
    const result = await bridge.bridge.resolveInclude(path, currentUri);

    if (!result.exists || !result.path) {
      return null;
    }

    const normalizedPath = result.path;
    const symbols = await bridge.parseFileSymbols(normalizedPath);

    return {
      originalPath: result.originalPath,
      resolvedPath: normalizedPath,
      symbols,
    };
  } catch (err) {
    log.debug('Include resolution failed', {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function isStdlibModule(
  bridge: BridgeManager,
  modulePath: string,
  log: Logger
): Promise<boolean> {
  if (!bridge.bridge) {
    return false;
  }

  try {
    const result = await bridge.bridge.resolveStdlib(modulePath);
    return result.found === 1;
  } catch (err) {
    log.debug('Failed stdlib module resolution', {
      modulePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
