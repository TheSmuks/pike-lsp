/**
 * Cache Builder
 *
 * Builds DocumentCacheEntry instances from analysis results.
 * Three paths: introspection success (merge parse + introspection),
 * parse-only fallback, and stale fallback.
 *
 * Extracted from diagnostics-processor.ts for maintainability (Issue #1289).
 */

import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry, CoreDiagnostic, CorePosition } from '../../core/types.js';
import { Logger } from '@pike-lsp/core';
import {
  buildCallPositionIndex,
  buildSymbolPositionIndex,
  buildSymbolNameIndex,
} from './symbol-index.js';
import { extractDeprecatedFromSymbols } from './utils.js';
import { buildStaleFallbackEntry } from './cache-helpers.js';
import { resolveDependenciesViaBridge } from './dependency-resolver.js';

/** Common context for all cache building paths */
export interface CacheBuildContext {
  uri: string;
  version: number;
  text: string;
  lines: string[];
  contentHash: string;
  lineHashes: number[];
  bridge: NonNullable<Services['bridge']>;
  services: Services;
  documents: {
    get(uri: string): import('vscode-languageserver-textdocument').TextDocument | undefined;
  };
  log: Logger;
  ensureLatest: (stage: string) => boolean;
}

/**
 * Build cache entry when introspection succeeded.
 * Merges introspected symbols with parse symbols for type + position info.
 */
export async function buildCacheWithIntrospection(
  parseData: {
    symbols: import('@pike-lsp/pike-bridge').PikeSymbol[];
    diagnostics: import('@pike-lsp/pike-bridge').PikeDiagnostic[];
  },
  introspectData: import('@pike-lsp/pike-bridge').IntrospectionResult,
  tokenizeData: import('@pike-lsp/pike-bridge').PikeToken[] | undefined,
  flatSymbols: import('@pike-lsp/pike-bridge').PikeSymbol[],
  diagnostics: CoreDiagnostic[],
  ctx: CacheBuildContext
): Promise<void> {
  const {
    uri,
    version,
    text,
    lines,
    contentHash,
    lineHashes,
    bridge,
    services,
    documents,
    log,
    ensureLatest,
  } = ctx;
  const legacySymbols: import('@pike-lsp/pike-bridge').PikeSymbol[] = [];

  log.debug('Introspection summary', {
    uri,
    success: introspectData.success,
    symbols: introspectData.symbols.length,
    functions: introspectData.functions?.length ?? 0,
    classes: introspectData.classes?.length ?? 0,
  });

  if (flatSymbols.length > 0) {
    const flatParseSymbols = flatSymbols;

    log.debug('Flattened parse symbols', {
      uri,
      originalSymbolCount: parseData.symbols.length,
      flattenedSymbolCount: flatParseSymbols.length,
    });

    const parsedSymbolNames = new Set<string>();
    for (const symbol of flatParseSymbols) {
      if (symbol.name) {
        parsedSymbolNames.add(symbol.name);
      }
    }

    for (const parsedSym of flatParseSymbols) {
      if (!parsedSym.name) continue;

      const introspectedSym = introspectData.symbols.find(s => s.name === parsedSym.name);
      if (introspectedSym) {
        legacySymbols.push({
          ...parsedSym,
          type: introspectedSym.type,
          modifiers: introspectedSym.modifiers,
        });
      } else {
        legacySymbols.push(parsedSym);
      }
    }

    for (const introspectedSym of introspectData.symbols) {
      if (!introspectedSym.name) continue;

      const inParse = parsedSymbolNames.has(introspectedSym.name);
      if (!inParse) {
        const introspectedKind =
          introspectedSym.kind as import('@pike-lsp/pike-bridge').PikeSymbolKind;
        legacySymbols.push({
          name: introspectedSym.name,
          kind: introspectedKind,
          modifiers: introspectedSym.modifiers,
          type: introspectedSym.type,
        });
      }
    }
  } else {
    for (const s of introspectData.symbols) {
      if (!s.name) continue;

      legacySymbols.push({
        name: s.name,
        kind: s.kind as import('@pike-lsp/pike-bridge').PikeSymbolKind,
        modifiers: s.modifiers,
        type: s.type,
      });
    }
  }

  let dependencies: import('../../core/types.js').DocumentDependencies | undefined;
  try {
    dependencies = await resolveDependenciesViaBridge(bridge, uri, legacySymbols, log);
  } catch (err) {
    log.debug('Bridge dependency resolution failed', {
      uri,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (!ensureLatest('post_dependency_resolve')) {
    return;
  }

  const hierarchicalSymbols =
    parseData && parseData.symbols.length > 0
      ? extractDeprecatedFromSymbols(parseData.symbols)
      : legacySymbols;

  const symbolPositions = await buildSymbolPositionIndex(
    text,
    legacySymbols,
    tokenizeData,
    bridge,
    lines
  );

  const callableNames = new Set(
    legacySymbols
      .filter((s: { kind: string; name: string }) => s.kind === 'method')
      .map((s: { kind: string; name: string }) => s.name)
  );
  const callPositions: Map<string, CorePosition[]> = tokenizeData?.length
    ? buildCallPositionIndex(tokenizeData, callableNames)
    : new Map<string, CorePosition[]>();

  if (!ensureLatest('post_symbol_index_build')) {
    return;
  }

  const cacheEntry: DocumentCacheEntry = {
    version,
    symbols: hierarchicalSymbols,
    diagnostics,
    symbolPositions,
    callPositions,
    symbolNames: buildSymbolNameIndex(hierarchicalSymbols),
    contentHash,
    lineHashes,
    analysisState: {
      isStale: false,
      parseFailed: false,
      hasErrorDiagnostics: diagnostics.some(d => d.severity === 1),
    },
  };
  if (introspectData.success) {
    cacheEntry['introspection'] = introspectData;
  }
  if (dependencies) {
    cacheEntry.dependencies = dependencies;
    if (introspectData.inherits) {
      cacheEntry.inherits = introspectData.inherits;
    }
  }

  const liveBeforeCache = documents.get(uri);
  if (!liveBeforeCache || liveBeforeCache.version !== version) {
    log.debug('Skipping cache write for stale version after introspection', {
      uri,
      validatedVersion: version,
      latestVersion: liveBeforeCache?.version,
    });
    return;
  }

  services.documentCache.set(uri, cacheEntry);
  log.debug('Cached document after introspection merge', {
    uri,
    symbolCount: legacySymbols.length,
    introspectionSuccess: introspectData.success,
  });
}

/**
 * Build cache entry when only parse results are available (introspection failed).
 */
export async function buildCacheParseOnly(
  parseData: { symbols: import('@pike-lsp/pike-bridge').PikeSymbol[] },
  introspectData: import('@pike-lsp/pike-bridge').IntrospectionResult,
  tokenizeData: import('@pike-lsp/pike-bridge').PikeToken[] | undefined,
  diagnostics: CoreDiagnostic[],
  analysisMode: 'typing' | 'full',
  ctx: CacheBuildContext
): Promise<void> {
  const {
    uri,
    version,
    text,
    lines,
    contentHash,
    lineHashes,
    bridge,
    services,
    documents,
    log,
    ensureLatest,
  } = ctx;

  const symbolsWithDeprecated = extractDeprecatedFromSymbols(parseData.symbols);
  const previousEntry = analysisMode === 'typing' ? services.documentCache.get(uri) : undefined;
  log.debug('Using parse result fallback', { uri, symbolCount: symbolsWithDeprecated.length });

  let dependencies: import('../../core/types.js').DocumentDependencies | undefined;
  if (analysisMode === 'typing' && previousEntry?.dependencies) {
    dependencies = previousEntry.dependencies;
  } else {
    try {
      dependencies = await resolveDependenciesViaBridge(bridge, uri, symbolsWithDeprecated, log);
    } catch (err) {
      log.debug('Bridge dependency resolution failed', {
        uri,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!ensureLatest('post_dependency_resolve_fallback')) {
      return;
    }
  }

  const symbolPositions: DocumentCacheEntry['symbolPositions'] = previousEntry?.symbolPositions
    ? previousEntry.symbolPositions
    : await buildSymbolPositionIndex(text, symbolsWithDeprecated, tokenizeData, bridge, lines);

  const callPositions: Map<string, CorePosition[]> = previousEntry?.callPositions
    ? previousEntry.callPositions
    : tokenizeData?.length
      ? buildCallPositionIndex(
          tokenizeData,
          new Set(
            symbolsWithDeprecated
              .filter((s: { kind: string; name: string }) => s.kind === 'method')
              .map((s: { kind: string; name: string }) => s.name)
          )
        )
      : new Map<string, CorePosition[]>();

  if (!previousEntry?.symbolPositions && !ensureLatest('post_symbol_index_build_fallback')) {
    return;
  }

  const cacheEntry: DocumentCacheEntry = {
    version,
    symbols: symbolsWithDeprecated,
    diagnostics,
    symbolPositions,
    callPositions,
    symbolNames:
      analysisMode === 'typing' && previousEntry?.symbolNames
        ? previousEntry.symbolNames
        : buildSymbolNameIndex(symbolsWithDeprecated),
    contentHash,
    lineHashes,
    ...(analysisMode === 'typing' && previousEntry
      ? {
          dependencies: previousEntry.dependencies,
          inherits: previousEntry.inherits,
          introspection: previousEntry.introspection,
        }
      : {}),
    analysisState: {
      isStale: false,
      parseFailed: false,
      hasErrorDiagnostics: diagnostics.some(d => d.severity === 1),
    },
  };
  if (analysisMode !== 'typing' && introspectData.success) {
    cacheEntry['introspection'] = introspectData;
  }
  if (dependencies) {
    cacheEntry.dependencies = dependencies;
    if (analysisMode !== 'typing' && introspectData.inherits) {
      cacheEntry.inherits = introspectData.inherits;
    }
  }

  const liveBeforeCache = documents.get(uri);
  if (!liveBeforeCache || liveBeforeCache.version !== version) {
    log.debug('Skipping cache write for stale version after parse', {
      uri,
      validatedVersion: version,
      latestVersion: liveBeforeCache?.version,
    });
    return;
  }

  services.documentCache.set(uri, cacheEntry);
  log.debug('Cached document from parse result', {
    uri,
    symbolCount: symbolsWithDeprecated.length,
  });
}

/**
 * Build stale fallback cache entry when no parse results are available.
 */
export function buildCacheStaleFallback(
  diagnostics: CoreDiagnostic[],
  ctx: CacheBuildContext
): void {
  const { uri, version, contentHash, lineHashes, services, documents, log } = ctx;

  log.debug('No parse result available for document', { uri });
  const staleEntry = buildStaleFallbackEntry(
    services.documentCache.get(uri),
    version,
    diagnostics,
    contentHash,
    lineHashes
  );

  const liveBeforeCache = documents.get(uri);
  if (!liveBeforeCache || liveBeforeCache.version !== version) {
    log.debug('Skipping cache write for stale version (no parse result)', {
      uri,
      validatedVersion: version,
      latestVersion: liveBeforeCache?.version,
    });
    return;
  }

  services.documentCache.set(uri, staleEntry);
}
