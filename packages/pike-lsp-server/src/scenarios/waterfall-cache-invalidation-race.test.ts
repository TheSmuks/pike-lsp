/**
 * Scenario: ModuleContext waterfall cache invalidation race (#2010)
 *
 * Verifies that invalidate() called between setPending and promise resolution
 * properly cleans up the secondary index (uriToWaterfallKeys), pending entries
 * (waterfallPending), and does not store the resolved result in waterfallCache.
 */

import { describe, it, beforeEach, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { ModuleContext } from '../services/module-context.js';
import type { ExtractedImport, WaterfallSymbolsResult } from '@pike-lsp/pike-bridge';

// ---------------------------------------------------------------------------
// Bridge mock with per-call controllable waterfall responses
// ---------------------------------------------------------------------------

function makeImport(type: ExtractedImport['type'], path: string): ExtractedImport {
  return { type, path, line: 1, exists: 1 };
}

function makeWaterfallResult(imports: ExtractedImport[]): WaterfallSymbolsResult {
  return {
    symbols: [],
    imports,
    transitive: [],
    provenance: {},
  };
}

interface TrackCounts {
  extractImports: number;
  getWaterfallSymbols: number;
}

/**
 * Each call to getWaterfallSymbols gets its own deferred.
 * Callers must call resolveNextWaterfall() once per bridge invocation.
 */
function createControlledBridge(importResult?: ExtractedImport[]) {
  const counts: TrackCounts = { extractImports: 0, getWaterfallSymbols: 0 };
  const imports = importResult ?? [makeImport('import', 'my_module')];
  const waterfallResult = makeWaterfallResult(imports);
  const queue: Array<{ resolve: (v: WaterfallSymbolsResult) => void }> = [];

  const bridge = {
    async extractImports(_content: string, _filename: string) {
      counts.extractImports++;
      return { imports };
    },
    async getWaterfallSymbols(_content: string, _filename: string, _maxDepth: number) {
      counts.getWaterfallSymbols++;
      return new Promise<WaterfallSymbolsResult>(resolve => {
        queue.push({ resolve });
      });
    },
  };

  return {
    bridge,
    counts,
    /** Resolve the oldest pending waterfall promise. Call once per bridge.getWaterfallSymbols invocation. */
    resolveNextWaterfall(result?: WaterfallSymbolsResult) {
      const entry = queue.shift();
      if (!entry) throw new Error('No pending waterfall promise to resolve');
      entry.resolve(result ?? waterfallResult);
    },
  };
}

describe('ModuleContext waterfall cache invalidation race (#2010)', () => {
  let ctx: ModuleContext;
  let originalNow: () => number;
  let fakeNow: number;

  beforeEach(() => {
    ctx = new ModuleContext();
    fakeNow = Date.now();
    originalNow = Date.now;
    globalThis.Date.now = () => fakeNow;
  });

  const restoreDateNow = () => {
    globalThis.Date.now = originalNow;
  };

  // -------------------------------------------------------------------------
  // Race: invalidate() between setPending and promise resolution
  // -------------------------------------------------------------------------

  describe('invalidate during in-flight waterfall fetch', () => {
    it('should not cache resolved result after invalidate during in-flight fetch', async () => {
      const { bridge, counts, resolveNextWaterfall } = createControlledBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      // Start waterfall fetch — it hangs until we resolve the deferred
      const fetchPromise = ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(counts.getWaterfallSymbols, 1, 'bridge call should have started');

      // Invalidate while fetch is still in-flight
      ctx.invalidate(uri);

      // Now resolve the deferred — the fetch promise completes
      resolveNextWaterfall();
      await fetchPromise;

      // A subsequent call with identical content should trigger a fresh fetch,
      // proving the resolved result was NOT stored in waterfallCache.
      const fetchPromise2 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(
        counts.getWaterfallSymbols,
        2,
        'should start a new bridge call (result not cached)'
      );
      resolveNextWaterfall();
      const result2 = await fetchPromise2;
      assert.equal(result2.imports.length, 1, 'second fetch should return data');
    });

    it('should not reuse stale pending entry after invalidate during in-flight fetch', async () => {
      const { bridge, counts, resolveNextWaterfall } = createControlledBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      // Start first fetch — hangs
      const fetchPromise1 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(counts.getWaterfallSymbols, 1);

      // Invalidate while first fetch is pending — should remove from waterfallPending
      ctx.invalidate(uri);

      // Start second fetch before first resolves — if waterfallPending was cleaned,
      // this should start a new bridge call, not latch onto the old pending promise.
      const fetchPromise2 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(
        counts.getWaterfallSymbols,
        2,
        'should start a new bridge call, not reuse stale pending entry'
      );

      // Resolve both deferreds
      resolveNextWaterfall();
      await fetchPromise1;
      resolveNextWaterfall();
      await fetchPromise2;
    });

    it('should clean up uriToWaterfallKeys for all maxDepth variants on invalidate', async () => {
      const { bridge, counts, resolveNextWaterfall } = createControlledBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      // Start two concurrent waterfall fetches with different maxDepth values
      const fetchPromise1 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 1);
      const fetchPromise2 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 5);
      assert.equal(counts.getWaterfallSymbols, 2, 'two bridge calls for different maxDepth');

      // Invalidate while both are in-flight
      ctx.invalidate(uri);

      // Resolve both
      resolveNextWaterfall();
      await fetchPromise1;
      resolveNextWaterfall();
      await fetchPromise2;

      // Both maxDepth variants should require fresh fetches — proves uriToWaterfallKeys
      // was fully cleaned and neither result was cached.
      const fetchPromise3 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 1);
      const fetchPromise4 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 5);
      assert.equal(
        counts.getWaterfallSymbols,
        4,
        'should re-fetch both maxDepth variants after invalidate'
      );
      resolveNextWaterfall();
      const r1 = await fetchPromise3;
      resolveNextWaterfall();
      const r2 = await fetchPromise4;
      assert.equal(r1.imports.length, 1);
      assert.equal(r2.imports.length, 1);
    });

    it('should not affect other URIs when invalidating during in-flight fetch', async () => {
      const { bridge, counts, resolveNextWaterfall } = createControlledBridge();
      const uriA = 'file:///a.pike';
      const uriB = 'file:///b.pike';
      const content = 'import my_module;';

      // Populate uriB cache immediately
      const fetchB = ctx.getWaterfallSymbolsForDocument(uriB, content, bridge);
      resolveNextWaterfall();
      await fetchB;
      assert.equal(counts.getWaterfallSymbols, 1);

      // Start uriA fetch — hangs
      const fetchA = ctx.getWaterfallSymbolsForDocument(uriA, content, bridge);
      assert.equal(counts.getWaterfallSymbols, 2);

      // Invalidate uriA while its fetch is pending
      ctx.invalidate(uriA);

      // Resolve uriA's fetch
      resolveNextWaterfall();
      await fetchA;

      // uriB should still be cached — invalidating uriA must not touch uriB's keys
      const resultB = await ctx.getWaterfallSymbolsForDocument(uriB, content, bridge);
      assert.equal(resultB.imports.length, 1);
      assert.equal(
        counts.getWaterfallSymbols,
        2,
        'should not re-fetch uriB after invalidating uriA'
      );
    });

    it('should allow fresh fetch with new content after invalidate during pending fetch', async () => {
      const { bridge, counts, resolveNextWaterfall } = createControlledBridge();
      const uri = 'file:///test.pike';
      const content1 = 'import my_module;';
      const content2 = 'import other_module;';

      // Start fetch with content1 — hangs
      const fetchPromise1 = ctx.getWaterfallSymbolsForDocument(uri, content1, bridge);
      assert.equal(counts.getWaterfallSymbols, 1);

      // Invalidate while fetch is pending
      ctx.invalidate(uri);

      // Resolve the original fetch
      resolveNextWaterfall();
      await fetchPromise1;

      // Fetch with new content — should get a fresh bridge call
      const fetchPromise2 = ctx.getWaterfallSymbolsForDocument(uri, content2, bridge);
      assert.equal(
        counts.getWaterfallSymbols,
        2,
        'should start fresh fetch with new content after invalidate'
      );
      resolveNextWaterfall();
      const result2 = await fetchPromise2;
      assert.equal(result2.imports.length, 1);
    });
  });

  afterEach(() => {
    restoreDateNow();
  });
});
