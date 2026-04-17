import type { PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * Workspace Index Search
 *
 * Pure functions for symbol search, scoring, and symbol conversion.
 * Operates on data structures owned by WorkspaceIndex.
 */

import { SymbolInformation, SymbolKind } from 'vscode-languageserver';
import type {
  SymbolEntry,
  ImportableSymbolSearchResult,
  FlattenedSymbolEntry,
} from './workspace-index-types.js';

/**
 * Prefix index constants shared between search and storage operations.
 * PERF-1273: Max prefix index entries to prevent unbounded memory growth.
 */
export const PREFIX_INDEX_MAX_DEPTH = 4;
export const PREFIX_INDEX_MAX_SIZE = 100_000;
export const PREFIX_INDEX_EVICT_BATCH = 10_000;
export const SEARCH_CACHE_MAX_SIZE = 100;
export const SEARCH_CACHE_TTL_MS = 60000; // 60 seconds

// Trigram substring index for O(k) substring lookup
export const SUBSTRING_INDEX_MIN_LENGTH = 3;
export const SUBSTRING_INDEX_MAX_SIZE = 200_000;
export const SUBSTRING_INDEX_EVICT_BATCH = 20_000;

/**
 * Search for importable symbols matching a query.
 * Uses prefix + trigram indexes for O(1) lookup, falls back to full scan.
 */
export function searchImportableSymbols(
  query: string,
  symbolLookup: Map<string, Map<string, SymbolEntry>>,
  prefixIndex: Map<string, Set<string>>,
  options: { excludeUri?: string; limit?: number },
  uriToModulePath: (uri: string) => string | null,
  substringIndex?: Map<string, Set<string>>
): ImportableSymbolSearchResult[] {
  const queryLower = query.trim().toLowerCase();
  if (!queryLower) {
    return [];
  }

  const candidates: ImportableSymbolSearchResult[] = [];
  const seen = new Set<string>();
  const limit = Math.max(1, options.limit ?? 20);

  // PERF-1285: Use prefix index for O(1) lookup instead of O(n) scan
  const matchingNames = collectMatchingNames(queryLower, symbolLookup, prefixIndex, substringIndex);

  for (const nameLower of matchingNames) {
    const entriesByUri = symbolLookup.get(nameLower);
    if (!entriesByUri) continue;
    for (const [uri, entry] of entriesByUri) {
      if (options.excludeUri && uri === options.excludeUri) {
        continue;
      }

      const modulePath = uriToModulePath(uri);
      if (!modulePath) {
        continue;
      }

      const importKind: 'import' | 'inherit' = entry.kind === 'class' ? 'inherit' : 'import';
      const exactBoost = entry.name.toLowerCase() === queryLower ? 120 : 0;
      const kindBoost = importKind === 'inherit' ? 15 : 5;
      const score = exactBoost + kindBoost + Math.max(0, 60 - modulePath.length);
      const dedupeKey = `${entry.name}:${modulePath}:${importKind}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      candidates.push({
        symbol: entry.name,
        modulePath,
        importKind,
        score,
        source: 'workspace-index',
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.symbol !== b.symbol) {
      return a.symbol.localeCompare(b.symbol);
    }
    if (a.importKind !== b.importKind) {
      return a.importKind.localeCompare(b.importKind);
    }
    return a.modulePath.localeCompare(b.modulePath);
  });

  return candidates.slice(0, limit);
}

/**
 * Collect symbol names matching a query via prefix + trigram indexes with fallback.
 */
export function collectMatchingNames(
  queryLower: string,
  symbolLookup: Map<string, Map<string, SymbolEntry>>,
  prefixIndex: Map<string, Set<string>>,
  substringIndex?: Map<string, Set<string>>
): Set<string> {
  const matchingNames = new Set<string>();

  if (queryLower.length >= 1) {
    const lookupKey =
      queryLower.length <= PREFIX_INDEX_MAX_DEPTH
        ? queryLower
        : queryLower.slice(0, PREFIX_INDEX_MAX_DEPTH);
    const prefixSet = prefixIndex.get(lookupKey);
    if (prefixSet) {
      for (const name of prefixSet) {
        if (name.startsWith(queryLower)) {
          matchingNames.add(name);
        }
      }
    }
  }

  // Use trigram index for substring queries when prefix index misses
  if (
    matchingNames.size === 0 &&
    substringIndex &&
    queryLower.length >= SUBSTRING_INDEX_MIN_LENGTH
  ) {
    const trigram = queryLower.slice(0, SUBSTRING_INDEX_MIN_LENGTH);
    const trigramSet = substringIndex.get(trigram);
    if (trigramSet) {
      for (const nameLower of trigramSet) {
        if (nameLower.includes(queryLower)) {
          matchingNames.add(nameLower);
        }
      }
    }
  }

  // Fall back to full scan only when both indexes miss
  if (matchingNames.size === 0) {
    for (const nameLower of symbolLookup.keys()) {
      if (nameLower.startsWith(queryLower)) {
        matchingNames.add(nameLower);
      }
    }
  }

  return matchingNames;
}

/**
 * Calculate relevance score for a search result.
 * WS-012 through WS-017: Scoring algorithm for result ranking.
 *
 * Scoring:
 * - Exact match: 100 points
 * - Prefix match: 50 points
 * - Substring match: 10 points
 * - Name length penalty: 0.1 per character (prefers shorter names within same match type)
 */
export function scoreResult(result: SymbolInformation, queryLower: string): number {
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
 * Convert a PikeSymbol kind string to an LSP SymbolKind.
 */
export function convertSymbolKind(kind: string): SymbolKind {
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
    case 'macro':
      return SymbolKind.Constant;
    case 'program':
      return SymbolKind.Class;
    default:
      return SymbolKind.Variable;
  }
}

/**
 * Normalize a line number to zero-based, clamped to maxLineCount.
 */
export function normalizeLineToZeroBased(line: number | undefined, maxLineCount?: number): number {
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
 * Unwrap a FlattenedSymbolEntry | PikeSymbol into a FlattenedSymbolEntry.
 */
export function toFlattenedSymbolEntry(
  symbolOrEntry: FlattenedSymbolEntry | PikeSymbol
): FlattenedSymbolEntry {
  if ('symbol' in symbolOrEntry) {
    return symbolOrEntry;
  }
  return { symbol: symbolOrEntry };
}

/**
 * Lookup data structures passed to index lookup functions.
 */
export interface LookupState {
  symbolLookup: Map<string, Map<string, SymbolEntry>>;
  uriToSymbols: Map<string, Set<string>>;
  prefixIndex: Map<string, Set<string>>;
  substringIndex: Map<string, Set<string>>;
  searchCache: Map<string, { results: SymbolInformation[]; timestamp: number }>;
  searchCacheHits: number;
  searchCacheMisses: number;
}

/**
 * Add symbols for a URI to all lookup indexes.
 */
export function addToLookup(
  state: LookupState,
  uri: string,
  symbols: FlattenedSymbolEntry[],
  maxLineCount?: number
): void {
  let symbolNames = state.uriToSymbols.get(uri);
  if (!symbolNames) {
    symbolNames = new Set<string>();
    state.uriToSymbols.set(uri, symbolNames);
  }

  for (const entryData of symbols) {
    const symbol = entryData.symbol;
    if (!symbol.name) continue;

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

    let entriesByUri = state.symbolLookup.get(nameLower);
    if (!entriesByUri) {
      entriesByUri = new Map();
      state.symbolLookup.set(nameLower, entriesByUri);
    }
    entriesByUri.set(uri, entry);

    if (!symbolNames.has(nameLower)) {
      symbolNames.add(nameLower);

      if (nameLower.length >= 1) {
        const maxPrefix = Math.min(nameLower.length, PREFIX_INDEX_MAX_DEPTH);
        for (let i = 1; i <= maxPrefix; i++) {
          const prefix = nameLower.slice(0, i);
          let prefixSet = state.prefixIndex.get(prefix);
          if (!prefixSet) {
            prefixSet = new Set<string>();
            state.prefixIndex.set(prefix, prefixSet);
          }
          prefixSet.add(nameLower);
        }

        if (state.prefixIndex.size > PREFIX_INDEX_MAX_SIZE) {
          let evicted = 0;
          for (const key of state.prefixIndex.keys()) {
            if (evicted >= PREFIX_INDEX_EVICT_BATCH) break;
            state.prefixIndex.delete(key);
            evicted++;
          }
        }
      }

      // PERF-2085: Populate trigram substring index
      if (nameLower.length >= SUBSTRING_INDEX_MIN_LENGTH) {
        for (let i = 0; i <= nameLower.length - SUBSTRING_INDEX_MIN_LENGTH; i++) {
          const trigram = nameLower.slice(i, i + SUBSTRING_INDEX_MIN_LENGTH);
          let trigramSet = state.substringIndex.get(trigram);
          if (!trigramSet) {
            trigramSet = new Set<string>();
            state.substringIndex.set(trigram, trigramSet);
          }
          trigramSet.add(nameLower);
        }

        if (state.substringIndex.size > SUBSTRING_INDEX_MAX_SIZE) {
          let evicted = 0;
          for (const key of state.substringIndex.keys()) {
            if (evicted >= SUBSTRING_INDEX_EVICT_BATCH) break;
            state.substringIndex.delete(key);
            evicted++;
          }
        }
      }
    }
  }
}

/**
 * Remove all symbol entries for a URI from all lookup indexes.
 */
export function removeFromLookup(state: LookupState, uri: string): void {
  const symbolNames = state.uriToSymbols.get(uri);
  if (!symbolNames) return;

  for (const nameLower of symbolNames) {
    const entriesByUri = state.symbolLookup.get(nameLower);
    let removeNameFromIndexes = !entriesByUri;

    if (entriesByUri) {
      entriesByUri.delete(uri);
      if (entriesByUri.size === 0) {
        state.symbolLookup.delete(nameLower);
        removeNameFromIndexes = true;
      }
    }

    if (removeNameFromIndexes) {
      if (nameLower.length >= 1) {
        for (let i = 1; i <= Math.min(nameLower.length, PREFIX_INDEX_MAX_DEPTH); i++) {
          const prefix = nameLower.slice(0, i);
          const prefixSet = state.prefixIndex.get(prefix);
          if (prefixSet) {
            prefixSet.delete(nameLower);
            if (prefixSet.size === 0) {
              state.prefixIndex.delete(prefix);
            }
          }
        }
      }

      // PERF-2085: Remove from trigram substring index
      if (nameLower.length >= SUBSTRING_INDEX_MIN_LENGTH) {
        for (let i = 0; i <= nameLower.length - SUBSTRING_INDEX_MIN_LENGTH; i++) {
          const trigram = nameLower.slice(i, i + SUBSTRING_INDEX_MIN_LENGTH);
          const trigramSet = state.substringIndex.get(trigram);
          if (trigramSet) {
            trigramSet.delete(nameLower);
            if (trigramSet.size === 0) {
              state.substringIndex.delete(trigram);
            }
          }
        }
      }
    }
  }

  state.uriToSymbols.delete(uri);
}

/**
 * Invalidate search cache entries referencing a specific URI.
 */
export function invalidateSearchCacheForUri(
  searchCache: Map<string, { results: SymbolInformation[]; timestamp: number }>,
  uri: string
): void {
  if (searchCache.size === 0) return;

  for (const [cacheKey, cacheEntry] of searchCache) {
    const referencesRemovedUri = cacheEntry.results.some(result => result.location.uri === uri);
    if (referencesRemovedUri) {
      searchCache.delete(cacheKey);
    }
  }
}
