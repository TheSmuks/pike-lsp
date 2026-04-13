/**
 * Scenario: ModuleContext cache TTL, invalidation, and dedup (#1661)
 *
 * Verifies import cache (5s TTL), waterfall cache (content-hash + TTL),
 * pending-request dedup, invalidate(), and content-hash mismatch re-fetch.
 */

import { describe, it, beforeEach, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { ModuleContext } from '../services/module-context.js';
import type { ExtractedImport, WaterfallSymbolsResult } from '@pike-lsp/pike-bridge';

// ---------------------------------------------------------------------------
// Bridge mock for extractImports / getWaterfallSymbols
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

function createModuleContextBridge(overrides?: {
  importResult?: ExtractedImport[];
  waterfallResult?: WaterfallSymbolsResult;
  delayMs?: number;
}) {
  const counts: TrackCounts = { extractImports: 0, getWaterfallSymbols: 0 };
  const importResult = overrides?.importResult ?? [makeImport('import', 'my_module')];
  const waterfallResult = overrides?.waterfallResult ?? makeWaterfallResult(importResult);
  const delayMs = overrides?.delayMs ?? 0;

  const bridge = {
    async extractImports(_content: string, _filename: string) {
      counts.extractImports++;
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      return { imports: importResult };
    },
    async getWaterfallSymbols(_content: string, _filename: string, _maxDepth: number) {
      counts.getWaterfallSymbols++;
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      return waterfallResult;
    },
  };

  return { bridge, counts };
}

describe('ModuleContext cache TTL, invalidation, and dedup', () => {
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
    // Intentional Date.now override for testing TTL expiry without real delays
    globalThis.Date.now = () => fakeNow;
  });

  // Restore after each describe block
  const restoreDateNow = () => {
    globalThis.Date.now = originalNow;
  };

  // -------------------------------------------------------------------------
  // Import cache TTL
  // -------------------------------------------------------------------------

  describe('import cache TTL', () => {
    it('should return cached data within TTL without calling bridge again', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      const result1 = await ctx.getImportsForDocument(uri, content, bridge);
      assert.equal(result1.length, 1);
      assert.equal(counts.extractImports, 1);

      // Second call within TTL — should use cache
      advanceTime(3000); // 3s < 5s TTL
      const result2 = await ctx.getImportsForDocument(uri, content, bridge);
      assert.equal(result2.length, 1);
      assert.equal(counts.extractImports, 1, 'should not call bridge again within TTL');
    });

    it('should re-fetch after TTL expires', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      await ctx.getImportsForDocument(uri, content, bridge);
      assert.equal(counts.extractImports, 1);

      // Advance past TTL
      advanceTime(5001);
      const result = await ctx.getImportsForDocument(uri, content, bridge);
      assert.equal(result.length, 1);
      assert.equal(counts.extractImports, 2, 'should call bridge again after TTL');
    });
  });

  // -------------------------------------------------------------------------
  // Waterfall cache TTL and content-hash
  // -------------------------------------------------------------------------

  describe('waterfall cache TTL and content hash', () => {
    it('should return cached waterfall data within TTL with matching content hash', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(counts.getWaterfallSymbols, 1);

      // Same content, within TTL — cache hit
      advanceTime(3000);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(
        counts.getWaterfallSymbols,
        1,
        'should not call bridge for same content within TTL'
      );
    });

    it('should re-fetch waterfall when content hash changes', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content1 = 'import my_module;';
      const content2 = 'import other_module;';

      await ctx.getWaterfallSymbolsForDocument(uri, content1, bridge);
      assert.equal(counts.getWaterfallSymbols, 1);

      // Different content — content hash mismatch triggers re-fetch
      advanceTime(1000);
      await ctx.getWaterfallSymbolsForDocument(uri, content2, bridge);
      assert.equal(counts.getWaterfallSymbols, 2, 'should call bridge when content hash changes');
    });

    it('should re-fetch waterfall after TTL expires even with same content', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(counts.getWaterfallSymbols, 1);

      advanceTime(5001);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(
        counts.getWaterfallSymbols,
        2,
        'should call bridge after TTL even with same content'
      );
    });

    it('should use maxDepth in cache key', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 3);
      assert.equal(counts.getWaterfallSymbols, 1);

      // Different maxDepth = different cache key → re-fetch
      advanceTime(1000);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 5);
      assert.equal(counts.getWaterfallSymbols, 2, 'should call bridge when maxDepth changes');
    });
  });

  // -------------------------------------------------------------------------
  // Pending request dedup
  // -------------------------------------------------------------------------

  describe('pending request dedup', () => {
    it('should deduplicate concurrent getImportsForDocument calls to one bridge call', async () => {
      const { bridge, counts } = createModuleContextBridge({ delayMs: 50 });
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      // Fire 5 concurrent requests — only 1 bridge.extractImports call should happen
      const results = await Promise.all([
        ctx.getImportsForDocument(uri, content, bridge),
        ctx.getImportsForDocument(uri, content, bridge),
        ctx.getImportsForDocument(uri, content, bridge),
        ctx.getImportsForDocument(uri, content, bridge),
        ctx.getImportsForDocument(uri, content, bridge),
      ]);

      assert.equal(results.length, 5, 'all promises should resolve');
      for (const r of results) {
        assert.equal(r.length, 1, 'each result should have imports');
      }
      assert.equal(
        counts.extractImports,
        1,
        'should call extractImports exactly once for concurrent requests'
      );
    });

    it('should deduplicate concurrent getWaterfallSymbolsForDocument calls', async () => {
      const { bridge, counts } = createModuleContextBridge({ delayMs: 50 });
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      const results = await Promise.all([
        ctx.getWaterfallSymbolsForDocument(uri, content, bridge),
        ctx.getWaterfallSymbolsForDocument(uri, content, bridge),
        ctx.getWaterfallSymbolsForDocument(uri, content, bridge),
      ]);

      assert.equal(results.length, 3);
      assert.equal(
        counts.getWaterfallSymbols,
        1,
        'should call getWaterfallSymbols exactly once for concurrent requests'
      );
    });
  });

  // -------------------------------------------------------------------------
  // invalidate()
  // -------------------------------------------------------------------------

  describe('invalidate()', () => {
    it('should clear import cache for the URI', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      // Populate cache
      await ctx.getImportsForDocument(uri, content, bridge);
      assert.equal(counts.extractImports, 1);

      // Invalidate
      ctx.invalidate(uri);

      // Next call should re-fetch (not use cache)
      const result = await ctx.getImportsForDocument(uri, content, bridge);
      assert.equal(result.length, 1);
      assert.equal(counts.extractImports, 2, 'should call bridge after invalidate');
    });

    it('should clear waterfall cache entries for the URI', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 3);
      assert.equal(counts.getWaterfallSymbols, 1);

      ctx.invalidate(uri);

      // Within TTL but invalidated — should re-fetch
      advanceTime(1000);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 3);
      assert.equal(
        counts.getWaterfallSymbols,
        2,
        'should call bridge after invalidate even within TTL'
      );
    });

    it('should clear waterfall cache for all maxDepth variants of the URI', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      // Populate with two different maxDepth values
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 1);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 5);
      assert.equal(counts.getWaterfallSymbols, 2);

      ctx.invalidate(uri);

      // Both should be re-fetched
      advanceTime(1000);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 1);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge, 5);
      assert.equal(
        counts.getWaterfallSymbols,
        4,
        'should re-fetch all maxDepth variants after invalidate'
      );
    });

    it('should not affect cache for other URIs', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uriA = 'file:///a.pike';
      const uriB = 'file:///b.pike';
      const content = 'import my_module;';

      await ctx.getImportsForDocument(uriA, content, bridge);
      await ctx.getImportsForDocument(uriB, content, bridge);
      assert.equal(counts.extractImports, 2);

      ctx.invalidate(uriA);

      // uriB should still be cached
      advanceTime(1000);
      await ctx.getImportsForDocument(uriB, content, bridge);
      assert.equal(counts.extractImports, 2, 'should not re-fetch uriB after invalidating uriA');
    });
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------

  describe('clear()', () => {
    it('should clear all caches', async () => {
      const { bridge, counts } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      await ctx.getImportsForDocument(uri, content, bridge);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(counts.extractImports, 1);
      assert.equal(counts.getWaterfallSymbols, 1);

      ctx.clear();

      // Both should re-fetch
      advanceTime(1000);
      await ctx.getImportsForDocument(uri, content, bridge);
      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(counts.extractImports, 2, 'should re-fetch imports after clear');
      assert.equal(counts.getWaterfallSymbols, 2, 'should re-fetch waterfall after clear');
    });
  });

  // -------------------------------------------------------------------------
  // size property
  // -------------------------------------------------------------------------

  describe('size', () => {
    it('should reflect cache entries from both caches', async () => {
      const { bridge } = createModuleContextBridge();
      const uri = 'file:///test.pike';
      const content = 'import my_module;';

      assert.equal(ctx.size, 0);

      await ctx.getImportsForDocument(uri, content, bridge);
      assert.equal(ctx.size, 1);

      await ctx.getWaterfallSymbolsForDocument(uri, content, bridge);
      assert.equal(ctx.size, 2);

      ctx.clear();
      assert.equal(ctx.size, 0);
    });
  });

  // Ensure Date.now is restored
  afterEach(() => {
    restoreDateNow();
  });
});
