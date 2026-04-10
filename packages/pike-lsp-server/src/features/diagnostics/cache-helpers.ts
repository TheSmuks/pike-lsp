/**
 * Cache Helper Functions
 *
 * Provides utilities for updating cache entries when validation is skipped,
 * and building stale fallback entries when analysis fails.
 *
 * Extracted from index.ts for maintainability (Issue #1289).
 */

import type { DocumentCacheEntry, CoreDiagnostic } from '../../core/types.js';

/**
 * Update a cached entry's metadata when a validation was skipped
 * because the document's semantic content didn't change.
 */
export function applySkippedValidationCacheUpdate(
  cachedEntry: DocumentCacheEntry,
  currentVersion: number,
  classification: { newHash?: string; newLineHashes?: number[] }
): void {
  if (classification.newHash) {
    cachedEntry.contentHash = classification.newHash;
  }
  if (classification.newLineHashes) {
    cachedEntry.lineHashes = classification.newLineHashes;
  }
  cachedEntry.version = currentVersion;
}

/**
 * Build a stale fallback cache entry when analysis fails.
 * Preserves last-good-version tracking from an existing entry.
 */
export function buildStaleFallbackEntry(
  existingEntry: DocumentCacheEntry | undefined,
  version: number,
  diagnostics: CoreDiagnostic[],
  contentHash: string,
  lineHashes: number[]
): DocumentCacheEntry {
  const hasErrorDiagnostics = diagnostics.some(d => d.severity === 1);
  const analysisState = hasErrorDiagnostics
    ? { isStale: true, parseFailed: true, hasErrorDiagnostics: true }
    : { isStale: true, parseFailed: true };

  if (existingEntry) {
    const lastGood = !existingEntry.analysisState?.parseFailed
      ? existingEntry.version
      : existingEntry.lastGoodVersion;

    const entry: DocumentCacheEntry = {
      ...existingEntry,
      version,
      diagnostics,
      contentHash,
      lineHashes,
      analysisState,
    };

    if (lastGood !== undefined) {
      entry.lastGoodVersion = lastGood;
    }

    return entry;
  }

  return {
    version,
    symbols: [],
    diagnostics,
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash,
    lineHashes,
    analysisState,
  };
}
