import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { ModuleContext } from '../../services/module-context.js';
import type { WaterfallSymbolsResult } from '@pike-lsp/pike-bridge';

function makeMockBridge(symbols: WaterfallSymbolsResult = { symbols: [], errors: [] }) {
  return {
    extractImports: async () => ({ imports: [], errors: [] }),
    getWaterfallSymbols: async () => symbols,
  };
}

describe('ModuleContext', () => {
  describe('invalidate — secondary index for waterfall cache', () => {
    it('invalidates only waterfall entries for the given URI, not others', async () => {
      const ctx = new ModuleContext(200);
      const bridge = makeMockBridge();

      // Populate waterfall cache for two different URIs
      await ctx.getWaterfallSymbolsForDocument('file:///a.pike', 'content-a', bridge);
      await ctx.getWaterfallSymbolsForDocument('file:///b.pike', 'content-b', bridge);

      // Both should be cached
      assert.strictEqual(ctx.size, 2);

      // Invalidate only file:///a.pike
      ctx.invalidate('file:///a.pike');

      // b.pike should still be cached (size = 1 waterfall entry)
      assert.strictEqual(ctx.size, 1);
    });

    it('cleans up pending waterfall requests on invalidate', async () => {
      const ctx = new ModuleContext(200);
      let resolveBridge: () => void;
      const bridgePromise = new Promise<WaterfallSymbolsResult>(r => {
        resolveBridge = () => r({ symbols: [], errors: [] });
      });
      const bridge = {
        extractImports: async () => ({ imports: [], errors: [] }),
        getWaterfallSymbols: async () => bridgePromise,
      };

      // Start a waterfall fetch (don't await yet)
      const fetchPromise = ctx.getWaterfallSymbolsForDocument('file:///a.pike', 'content', bridge);
      // Immediately invalidate while the fetch is in-flight
      ctx.invalidate('file:///a.pike');
      // Let the bridge resolve
      resolveBridge!();
      // The fetch should complete without error
      const result = await fetchPromise;
      assert.ok(result);
    });

    it('clears secondary index when all entries for a URI are invalidated', async () => {
      const ctx = new ModuleContext(200);
      const bridge = makeMockBridge();

      await ctx.getWaterfallSymbolsForDocument('file:///a.pike', 'content-a', bridge, 3);
      await ctx.getWaterfallSymbolsForDocument('file:///a.pike', 'content-a', bridge, 5);

      ctx.invalidate('file:///a.pike');

      // After invalidation, re-populating should work correctly
      await ctx.getWaterfallSymbolsForDocument('file:///a.pike', 'content-a', bridge, 3);
      assert.strictEqual(ctx.size, 1);
    });
  });

  describe('LRU eviction cleans up secondary index', () => {
    it('removes evicted keys from uriToWaterfallKeys', async () => {
      // Use a small cache size to force eviction
      const ctx = new ModuleContext(2);
      const bridge = makeMockBridge();

      // Fill cache with 3 entries for different URIs (cache size = 2, so first gets evicted)
      await ctx.getWaterfallSymbolsForDocument('file:///a.pike', 'content-a', bridge);
      await ctx.getWaterfallSymbolsForDocument('file:///b.pike', 'content-b', bridge);
      // This should evict the a.pike entry
      await ctx.getWaterfallSymbolsForDocument('file:///c.pike', 'content-c', bridge);

      // Only 2 entries should remain in the waterfall cache
      assert.strictEqual(ctx.size, 2);

      // Invalidate a.pike — should be a no-op since it was already evicted
      ctx.invalidate('file:///a.pike');
      // Size should still be 2 (b.pike and c.pike)
      assert.strictEqual(ctx.size, 2);
    });
  });

  describe('clear', () => {
    it('clears all caches and the secondary index', async () => {
      const ctx = new ModuleContext(200);
      const bridge = makeMockBridge();

      await ctx.getWaterfallSymbolsForDocument('file:///a.pike', 'content-a', bridge);
      await ctx.getWaterfallSymbolsForDocument('file:///b.pike', 'content-b', bridge);

      assert.strictEqual(ctx.size, 2);

      ctx.clear();
      assert.strictEqual(ctx.size, 0);
    });
  });
});
