/**
 * Scenario: ModuleContext waterfall cache invalidation race (#2064)
 *
 * Verifies that invalidate() called during an in-flight waterfall fetch
 * properly cleans up the secondary index (uriToWaterfallKeys), pending
 * entries (waterfallPending), and cached results (waterfallCache).
 *
 * The race window: between lines 179 (secondary index registration)
 * and line 183 (await promise) in getWaterfallSymbolsForDocument.
 */

import { describe, it, beforeEach, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { ModuleContext } from '../services/module-context.js';
import type { ExtractedImport, WaterfallSymbolsResult } from '@pike-lsp/pike-bridge';

// ---------------------------------------------------------------------------
// Bridge mock
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
  getWaterfallSymbols: number;
}

function createDelayedBridge(overrides?: {
  waterfallResult?: WaterfallSymbolsResult;
  immediate?: boolean;
}) {
  const counts: TrackCounts = { getWaterfallSymbols: 0 };
  const importResult = [makeImport('import', 'my_module')];
  const waterfallResult = overrides?.waterfallResult ?? makeWaterfallResult(importResult);
  const immediate = overrides?.immediate ?? false;

  // Gate: the bridge call blocks until resolve is called
  let resolveBridge: () => void;
  const gate = new Promise<void>(resolve => {
    resolveBridge = resolve;
  });

  const bridge = {
    async extractImports(_content: string, _filename: string) {
      return { imports: [makeImport('import', 'my_module')] };
    },
    async getWaterfallSymbols(_content: string, _filename: string, _maxDepth: number) {
      counts.getWaterfallSymbols++;
      if (!immediate) {
        // Simulate in-flight fetch — real bridge would await pike subprocess
        await gate;
      }
      return waterfallResult;
    },
  };

  return { bridge, counts, resolveBridge: resolveBridge! };
}

describe('Waterfall cache invalidation race (#2064)', () => {
  let ctx: ModuleContext;
  let originalNow: () => number;
  let fakeNow: number;

  function advanceTime(ms: number) {
    fakeNow += ms;
  }

  beforeEach(() => {
    ctx = new ModuleContext();
    fakeNow = Date.now();
    originalNow = Date.now;
    globalThis.Date.now = () => fakeNow;
  });

  const restoreDateNow = () => {
    globalThis.Date.now = originalNow;
  };

  afterEach(() => {
    restoreDateNow();
  });

  // -------------------------------------------------------------------------
  // Test 1: invalidate during in-flight fetch does not cache stale result
  // -------------------------------------------------------------------------

  it('invalidate during in-flight fetch: result not cached, second fetch triggers new bridge call', async () => {
    const { bridge, counts, resolveBridge } = createDelayedBridge();
    const uri = 'file:///race1.pike';
    const content = 'import my_module;';

    // Start fetch — bridge call is gated, so the promise is pending
    const fetchPromise = ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
    assert.equal(counts.getWaterfallSymbols, 1, 'bridge call should have started');

    // Invalidate while fetch is in-flight
    ctx.invalidate(uri);

    // Release the bridge — the original fetch resolves
    resolveBridge();
    await fetchPromise;

    // The stale result should NOT be cached. A new fetch must trigger a new bridge call.
    advanceTime(1000); // well within TTL
    await ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
    assert.equal(
      counts.getWaterfallSymbols,
      2,
      'stale result should not be cached after invalidate during in-flight fetch'
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: invalidate cleans up pending latch, second fetch starts fresh
  // -------------------------------------------------------------------------

  it('invalidate during pending: second fetch starts fresh, not latched to stale pending', async () => {
    const { bridge, counts, resolveBridge } = createDelayedBridge();
    const uri = 'file:///race2.pike';
    const content = 'import my_module;';

    // Start first fetch
    const fetchPromise = ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
    assert.equal(counts.getWaterfallSymbols, 1);

    // Invalidate while pending — should clean up the pending entry
    ctx.invalidate(uri);

    // Release original fetch
    resolveBridge();
    await fetchPromise;

    // Second fetch should start a new bridge call, not latch onto the old pending
    const {
      bridge: bridge2,
      counts: counts2,
      resolveBridge: resolveBridge2,
    } = createDelayedBridge();
    const fetchPromise2 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge2);
    assert.equal(counts2.getWaterfallSymbols, 1, 'should start a fresh bridge call');
    resolveBridge2();
    await fetchPromise2;
  });

  // -------------------------------------------------------------------------
  // Test 3: two maxDepth variants invalidated simultaneously
  // -------------------------------------------------------------------------

  it('two maxDepth variants invalidated simultaneously: both re-fetch after resolve', async () => {
    const { bridge: bridge1, counts: counts1, resolveBridge: resolve1 } = createDelayedBridge();
    const { bridge: bridge2, counts: counts2, resolveBridge: resolve2 } = createDelayedBridge();
    const uri = 'file:///race3.pike';
    const content = 'import my_module;';

    // Start two fetches with different maxDepth values — both in-flight
    const promise1 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge1, 1);
    const promise2 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge2, 5);

    assert.equal(counts1.getWaterfallSymbols, 1);
    assert.equal(counts2.getWaterfallSymbols, 1);

    // Invalidate — should clean up both entries via secondary index
    ctx.invalidate(uri);

    // Resolve both original fetches
    resolve1();
    resolve2();
    await Promise.all([promise1, promise2]);

    // Both maxDepth variants should require re-fetch
    advanceTime(1000);
    const { bridge: bridge3, counts: counts3, resolveBridge: resolve3 } = createDelayedBridge();
    const fetch1 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge3, 1);
    assert.equal(counts3.getWaterfallSymbols, 1, 'maxDepth=1 should re-fetch after invalidate');

    const { bridge: bridge4, counts: counts4, resolveBridge: resolve4 } = createDelayedBridge();
    const fetch2 = ctx.getWaterfallSymbolsForDocument(uri, content, bridge4, 5);
    assert.equal(counts4.getWaterfallSymbols, 1, 'maxDepth=5 should re-fetch after invalidate');

    resolve3();
    resolve4();
    await Promise.all([fetch1, fetch2]);
  });

  // -------------------------------------------------------------------------
  // Test 4: invalidate uriA does not affect uriB
  // -------------------------------------------------------------------------

  it('invalidate uriA does not affect uriB: uriB remains cached', async () => {
    const { bridge: bridgeA, resolveBridge: resolveA } = createDelayedBridge();
    const uriA = 'file:///raceA.pike';
    const uriB = 'file:///raceB.pike';
    const content = 'import my_module;';

    // Start in-flight fetch for uriA
    const promiseA = ctx.getWaterfallSymbolsForDocument(uriA, content, bridgeA);

    // Complete fetch for uriB immediately
    const { bridge: bridgeB2, counts: countsB2 } = createDelayedBridge({ immediate: true });
    await ctx.getWaterfallSymbolsForDocument(uriB, content, bridgeB2);

    assert.equal(countsB2.getWaterfallSymbols, 1, 'uriB should have been fetched');

    // Invalidate uriA while it's in-flight
    ctx.invalidate(uriA);

    // Resolve uriA's fetch
    resolveA();
    await promiseA;

    // uriB should still be cached — no re-fetch needed
    advanceTime(1000);
    await ctx.getWaterfallSymbolsForDocument(uriB, content, bridgeB2);
    assert.equal(
      countsB2.getWaterfallSymbols,
      1,
      'uriB should still be cached after uriA invalidation'
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: fresh content fetch after invalidate during pending
  // -------------------------------------------------------------------------

  it('fresh content fetch after invalidate during pending: new bridge call with new content', async () => {
    const { bridge, counts, resolveBridge } = createDelayedBridge();
    const uri = 'file:///race5.pike';
    const content1 = 'import my_module;';
    const content2 = 'import other_module;';

    // Start fetch with content1
    const fetchPromise = ctx.getWaterfallSymbolsForDocument(uri, content1, bridge);
    assert.equal(counts.getWaterfallSymbols, 1);

    // Invalidate while fetch is pending
    ctx.invalidate(uri);

    // Release the original fetch
    resolveBridge();
    await fetchPromise;

    // Fetch with content2 — should trigger a new bridge call
    const {
      bridge: bridge2,
      counts: counts2,
      resolveBridge: resolveBridge2,
    } = createDelayedBridge();
    const fetchPromise2 = ctx.getWaterfallSymbolsForDocument(uri, content2, bridge2);
    assert.equal(
      counts2.getWaterfallSymbols,
      1,
      'should start fresh bridge call with new content after invalidate'
    );
    resolveBridge2();
    const result = await fetchPromise2;
    assert.ok(result, 'should return a valid result');
  });
});
