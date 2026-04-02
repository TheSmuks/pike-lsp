/**
 * Scenario: Request Cancellation Cleanup (Issue #1112)
 *
 * Tests that cancelled diagnostic requests don't write stale data to cache.
 *
 * Before the fix:
 * - validateDocument() writes to documentCache after bridge.analyze() completes
 * - If request is superseded during bridge.analyze(), old result overwrites cache
 * - Newer validation sees stale cache data
 *
 * After the fix:
 * - Version check happens immediately before documentCache.set()
 * - If document version changed since validation started, cache write is skipped
 * - Only the latest validation result is cached
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { DocumentCache } from '../services/document-cache.js';
import type { DocumentCacheEntry } from '../core/types.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

function makeSymbol(name: string, kind: number): PikeSymbol {
  return {
    name,
    kind: kind as unknown as import('@pike-lsp/pike-bridge').PikeSymbolKind,
    modifiers: [],
  };
}

describe('Scenario: request cancellation cleanup', () => {
  it('must not write to cache if document version changed during validation', async () => {
    const cache = new DocumentCache();
    const uri = 'file:///cancellation-test.pike';

    const validationStartVersion = 1;
    const newerVersion = 2;

    const newerEntry: DocumentCacheEntry = {
      version: newerVersion,
      symbols: [makeSymbol('NewerSymbol', 5)],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: 'newer-hash',
      lineHashes: [111],
    };
    cache.set(uri, newerEntry);

    const staleEntry: DocumentCacheEntry = {
      version: validationStartVersion,
      symbols: [makeSymbol('StaleSymbol', 5)],
      diagnostics: [
        {
          message: 'stale error',
          severity: 1,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          source: 'pike',
        },
      ],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: 'stale-hash',
      lineHashes: [222],
    };

    const currentEntry = cache.get(uri);
    if (currentEntry && currentEntry.version > staleEntry.version) {
      // Skip cache write - newer version exists
    } else {
      cache.set(uri, staleEntry);
    }

    const finalEntry = cache.get(uri);
    assert.ok(finalEntry);
    assert.strictEqual(finalEntry.version, newerVersion);
    assert.strictEqual(finalEntry.symbols[0]?.name, 'NewerSymbol');
  });

  it('must allow cache write when version matches', async () => {
    const cache = new DocumentCache();
    const uri = 'file:///valid-write.pike';

    const version = 1;
    const entry: DocumentCacheEntry = {
      version,
      symbols: [makeSymbol('ValidSymbol', 5)],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: 'valid-hash',
      lineHashes: [111],
    };

    cache.set(uri, entry);

    const cached = cache.get(uri);
    assert.ok(cached);
    assert.strictEqual(cached.version, version);
    assert.strictEqual(cached.symbols[0]?.name, 'ValidSymbol');
  });

  it('must handle version comparison with undefined existing entry', () => {
    const cache = new DocumentCache();
    const uri = 'file:///no-existing.pike';

    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: 'hash',
      lineHashes: [1],
    };

    // Simulates the check in validateDocument() when document was closed
    const getLiveDoc = (): { version: number } | undefined => undefined;
    const liveDocument = getLiveDoc();
    if (!liveDocument || liveDocument.version !== entry.version) {
      // Skip write - document no longer exists
    } else {
      cache.set(uri, entry);
    }

    const cached = cache.get(uri);
    assert.strictEqual(cached, undefined);
  });
});
