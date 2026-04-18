import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { WorkspaceIndex } from '../workspace-index.js';
import type { SymbolEntry, IndexErrorCallback } from '../workspace-index-types.js';

// ---------------------------------------------------------------------------
// Helpers: bridge mock and private-state access (established codebase pattern)
// ---------------------------------------------------------------------------

type AnalyzeResult = { hasError: boolean; errorMessage?: string };

function makeBridge(
  overrides?: Partial<{
    analyzeResult: (text: string) => AnalyzeResult;
    isRunning: () => boolean;
  }>
) {
  const analyzeResult: (text: string) => AnalyzeResult =
    overrides?.analyzeResult ?? (() => ({ hasError: false }));
  return {
    isRunning: overrides?.isRunning ?? (() => true),
    analyze: async (_code: string, _modes: string[], _filename: string) => {
      const analysis = analyzeResult(_code);
      return {
        result: {
          parse: {
            symbols: analysis.hasError
              ? []
              : [{ name: 'mySymbol', kind: 'variable', position: { line: 1 } }],
            diagnostics: analysis.hasError
              ? [
                  {
                    message: analysis.errorMessage ?? 'Syntax error',
                    severity: 'error',
                    position: { line: 1, character: 0 },
                  },
                ]
              : [],
          },
        },
      };
    },
  };
}

function privateState(index: WorkspaceIndex) {
  return index as unknown as {
    symbolLookup: Map<string, Map<string, SymbolEntry>>;
    prefixIndex: Map<string, Set<string>>;
    uriToSymbols: Map<string, Set<string>>;
    substringIndex: Map<string, Set<string>>;
    searchCache: Map<string, { results: unknown[]; timestamp: number }>;
    searchCacheHits: number;
    searchCacheMisses: number;
  };
}

/** Populate the lookup state directly to avoid bridge overhead in bulk tests. */
function seedSymbols(index: WorkspaceIndex, uri: string, names: string[]) {
  const entries: Array<{ symbol: { name: string; kind: string; position: { line: number } } }> =
    names.map(name => ({
      symbol: { name, kind: 'variable', position: { line: 1 } },
    }));

  // Create a fake IndexedDocument so getStats and getDocumentSymbols work
  const docs = index as unknown as {
    documents: Map<
      string,
      {
        uri: string;
        symbols: Array<{ symbol: { name: string; kind: string; position: { line: number } } }>;
      }
    >;
  };
  docs.documents.set(uri, { uri, symbols: entries });

  // Populate lookup structures via the private addToLookup method
  const addToLookup = index as unknown as {
    addToLookup: (
      uri: string,
      symbols: Array<{ symbol: { name: string; kind: string; position: { line: number } } }>
    ) => void;
  };
  addToLookup.addToLookup(uri, entries);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspaceIndex adversarial scenarios', () => {
  // ---- 1. getMetrics snapshot isolation ----
  describe('getMetrics', () => {
    it('returns a snapshot — mutating the returned object does not affect internal state', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      const metrics = index.getMetrics();
      metrics.lastIndexTimeMs = 9999;
      metrics.totalFilesIndexed = -1;
      const fresh = index.getMetrics();
      assert.strictEqual(fresh.lastIndexTimeMs, 0);
      assert.strictEqual(fresh.totalFilesIndexed, 0);
    });
  });

  // ---- 2. resetMetrics completeness ----
  describe('resetMetrics', () => {
    it('resets all fields to zero and is idempotent', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      // Verify default state is all zeros
      const fresh = index.getMetrics();
      assert.strictEqual(fresh.lastIndexTimeMs, 0);
      assert.strictEqual(fresh.lastFileDiscoveryMs, 0);
      assert.strictEqual(fresh.lastFileReadMs, 0);
      assert.strictEqual(fresh.lastParsingMs, 0);
      assert.strictEqual(fresh.lastIndexingMs, 0);
      assert.strictEqual(fresh.lastFileCount, 0);
      assert.strictEqual(fresh.totalFilesIndexed, 0);

      // resetMetrics should be idempotent
      index.resetMetrics();
      const afterReset = index.getMetrics();
      assert.strictEqual(afterReset.lastIndexTimeMs, 0);
      assert.strictEqual(afterReset.lastFileDiscoveryMs, 0);
      assert.strictEqual(afterReset.lastFileReadMs, 0);
      assert.strictEqual(afterReset.lastParsingMs, 0);
      assert.strictEqual(afterReset.lastIndexingMs, 0);
      assert.strictEqual(afterReset.lastFileCount, 0);
      assert.strictEqual(afterReset.totalFilesIndexed, 0);
    });
  });

  // ---- 3. searchSymbols boundary limits ----
  describe('searchSymbols with boundary limits', () => {
    it('returns empty array when limit is 0', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['alphaFunc', 'alphaVar']);
      const results = index.searchSymbols('alpha', 0);
      assert.deepStrictEqual(results, []);
    });

    it('returns results when limit is negative (slice semantics leak through)', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['alphaFunc', 'alphaVar']);
      const results = index.searchSymbols('alpha', -1);
      // Negative limit passed to .slice(0, -1) returns all but last — not an empty array
      assert.ok(results.length >= 1, 'Negative limit should not guard to empty');
    });
  });

  // ---- 4. searchSymbols cache TTL expiry ----
  describe('searchSymbols cache TTL', () => {
    it('evicts stale cache entries after TTL', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['cachedSymbol']);

      // Populate cache
      const before = index.searchSymbols('cachedSymbol', 100);
      assert.ok(before.length > 0, 'First search should return results');

      const priv = privateState(index);
      assert.ok(priv.searchCacheMisses >= 1, 'Should have at least one cache miss');

      // Tamper with timestamp to simulate expiry
      for (const entry of priv.searchCache.values()) {
        entry.timestamp = Date.now() - WorkspaceIndex.SEARCH_CACHE_TTL_MS - 1000;
      }

      // Second search should bypass cache (expired)
      const missesBefore = priv.searchCacheMisses;
      index.searchSymbols('cachedSymbol', 100);
      assert.ok(priv.searchCacheMisses > missesBefore, 'Should increment misses after TTL expiry');
    });
  });

  // ---- 5. searchImportableSymbols with whitespace-only query ----
  describe('searchImportableSymbols edge cases', () => {
    it('returns empty for whitespace-only query', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['realSymbol']);
      const results = index.searchImportableSymbols('   ');
      assert.deepStrictEqual(results, []);
    });

    it('returns empty for empty string query', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['realSymbol']);
      const results = index.searchImportableSymbols('');
      assert.deepStrictEqual(results, []);
    });
  });

  // ---- 6. removeDocument idempotency ----
  describe('removeDocument idempotency', () => {
    it('does not throw when called on a never-indexed URI', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      assert.doesNotThrow(() => index.removeDocument('file:///nonexistent.pike'));
    });

    it('is safe to call removeDocument twice on the same URI', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      assert.doesNotThrow(() => {
        index.removeDocument('file:///a.pike');
        index.removeDocument('file:///a.pike');
      });
      assert.deepStrictEqual(index.getDocumentSymbols('file:///a.pike'), []);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
    });
  });

  // ---- 7. getDocumentSymbols for non-existent URI ----
  describe('getDocumentSymbols for non-existent URI', () => {
    it('returns empty array for never-indexed URI', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      assert.deepStrictEqual(index.getDocumentSymbols('file:///ghost.pike'), []);
    });

    it('returns empty array after the URI was removed', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      index.removeDocument('file:///a.pike');
      assert.deepStrictEqual(index.getDocumentSymbols('file:///a.pike'), []);
    });
  });

  // ---- 8. clear() resets search cache counters ----
  describe('clear() resets search cache counters', () => {
    it('resets searchCacheHits and searchCacheMisses to 0', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['testSym']);
      index.searchSymbols('testSym', 10);
      index.searchSymbols('testSym', 10); // Hit the cache

      const priv = privateState(index);
      assert.ok(
        priv.searchCacheHits > 0 || priv.searchCacheMisses > 0,
        'Counters should be non-zero before clear'
      );

      index.clear();

      assert.strictEqual(priv.searchCacheHits, 0);
      assert.strictEqual(priv.searchCacheMisses, 0);
      assert.strictEqual(priv.searchCache.size, 0);
    });
  });

  // ---- 9. constructor without bridge ----
  describe('constructor without bridge', () => {
    it('indexDocument silently no-ops when no bridge is set', async () => {
      const index = new WorkspaceIndex();
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
      assert.deepStrictEqual(index.getDocumentSymbols('file:///a.pike'), []);
    });

    it('setBridge then indexDocument works', async () => {
      const index = new WorkspaceIndex();
      index.setBridge(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      assert.ok(index.getAllDocumentUris().length > 0);
    });
  });

  // ---- 10. setErrorCallback receives errors on parse failure ----
  describe('setErrorCallback', () => {
    it('fires callback when bridge.analyze throws an exception', async () => {
      const errors: string[] = [];
      const index = new WorkspaceIndex({
        isRunning: () => true,
        analyze: async () => {
          throw new Error('Bridge IPC failure');
        },
      } as any);
      index.setErrorCallback(msg => errors.push(msg));
      await index.indexDocument('file:///bad.pike', 'int x;', 1);

      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0]!.includes('Failed to index document'));
    });

    it('includes URI in error callback when indexing fails', async () => {
      const errors: Array<{ message: string; uri?: string }> = [];
      const callback: IndexErrorCallback = (message, uri) => {
        if (uri !== undefined) {
          errors.push({ message, uri });
        } else {
          errors.push({ message });
        }
      };

      const index = new WorkspaceIndex({
        isRunning: () => true,
        analyze: async () => {
          throw new Error('Parse exploded');
        },
      } as any);
      index.setErrorCallback(callback);
      await index.indexDocument('file:///crash.pike', '!!!invalid!!!', 1);

      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0]!.uri, 'file:///crash.pike');
    });
  });

  // ---- 11. Large workspace indexing performance ----
  describe('large workspace indexing performance', () => {
    it('indexes 500 documents within reasonable time', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      const uris: string[] = [];

      const start = performance.now();
      for (let i = 0; i < 500; i++) {
        const uri = `file:///dir/doc${i}.pike`;
        uris.push(uri);
        await index.indexDocument(uri, `int var${i};`, 1);
      }
      const elapsed = performance.now() - start;

      const stats = index.getStats();
      assert.strictEqual(stats.documents, 500);
      assert.ok(stats.symbols > 0, 'Should have indexed symbols');

      // Should complete well within 10 seconds even on slow hardware
      assert.ok(
        elapsed < 10_000,
        `500 documents took ${elapsed.toFixed(0)}ms — exceeds 10s budget`
      );

      // Verify search works across the bulk index (mock returns 'mySymbol' for all)
      const results = index.searchSymbols('mySymbol', 10);
      assert.ok(results.length > 0, 'Search should find indexed symbols');
    });

    it('handles rapid sequential indexDocument calls without corruption', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);

      // Fire all at once, let them resolve in any order
      const promises = [];
      for (let i = 0; i < 200; i++) {
        promises.push(index.indexDocument(`file:///race/${i}.pike`, `int x${i};`, 1));
      }
      await Promise.all(promises);

      const stats = index.getStats();
      assert.strictEqual(stats.documents, 200);
    });
  });

  // ---- 12. Prefix index eviction through repeated index/remove cycles ----
  describe('prefix index eviction', () => {
    it('prefix index stays bounded after mass add/remove cycles', () => {
      const index = new WorkspaceIndex(makeBridge() as any);

      // Generate enough unique symbol names to stress the prefix index
      const batchSize = 500;
      const totalBatches = 3;

      for (let batch = 0; batch < totalBatches; batch++) {
        const batchNames: string[] = [];
        for (let i = 0; i < batchSize; i++) {
          batchNames.push(`sym_${batch}_${String(i).padStart(4, '0')}`);
        }

        // Seed all symbols under a single URI
        const uri = `file:///batch${batch}.pike`;
        seedSymbols(index, uri, batchNames);
      }

      const priv = privateState(index);
      const sizeAfterAdd = priv.prefixIndex.size;
      assert.ok(sizeAfterAdd > 0, 'Prefix index should be populated');

      // Remove all documents — prefix index should shrink
      for (let batch = 0; batch < totalBatches; batch++) {
        index.removeDocument(`file:///batch${batch}.pike`);
      }

      const sizeAfterRemove = priv.prefixIndex.size;
      assert.ok(
        sizeAfterRemove < sizeAfterAdd,
        `Prefix index should shrink after removal: ${sizeAfterRemove} < ${sizeAfterAdd}`
      );

      // After removing all documents, very few prefix entries should remain
      assert.ok(
        sizeAfterRemove < 50,
        `Prefix index should be nearly empty after full removal: got ${sizeAfterRemove}`
      );
    });

    it('repeated add/remove cycles do not leak prefix index entries', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      const priv = privateState(index);

      for (let cycle = 0; cycle < 5; cycle++) {
        const names = Array.from({ length: 100 }, (_, i) => `cycle${cycle}_item${i}`);
        seedSymbols(index, `file:///cycle${cycle}.pike`, names);
      }

      const peakSize = priv.prefixIndex.size;

      // Remove all
      for (let cycle = 0; cycle < 5; cycle++) {
        index.removeDocument(`file:///cycle${cycle}.pike`);
      }

      const finalSize = priv.prefixIndex.size;
      assert.ok(
        finalSize < peakSize,
        `Prefix index leaked entries: ${finalSize} remaining after removing all 5 cycles (peak was ${peakSize})`
      );
    });
  });

  // ---- 13. Property-based: getStats consistency ----
  describe('getStats consistency invariant', () => {
    it('getStats().documents always equals getAllDocumentUris().length', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['symA']);
      seedSymbols(index, 'file:///b.pike', ['symB']);
      seedSymbols(index, 'file:///c.pike', ['symC']);

      assert.strictEqual(index.getStats().documents, index.getAllDocumentUris().length);

      index.removeDocument('file:///b.pike');
      assert.strictEqual(index.getStats().documents, index.getAllDocumentUris().length);

      index.clear();
      assert.strictEqual(index.getStats().documents, index.getAllDocumentUris().length);
    });

    it('getStats().uniqueNames matches symbolLookup size', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['alpha', 'beta']);
      seedSymbols(index, 'file:///b.pike', ['alpha', 'gamma']);

      const stats = index.getStats();
      const priv = privateState(index);
      // uniqueNames comes from symbolLookup.size
      assert.strictEqual(stats.uniqueNames, priv.symbolLookup.size);
    });
  });

  // ---- 14. Stress: search cache LRU eviction ----
  describe('search cache LRU eviction', () => {
    it('evicts oldest entries when cache exceeds max size', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['searchable']);

      const maxSize = WorkspaceIndex.SEARCH_CACHE_MAX_SIZE;
      const priv = privateState(index);

      // Fill cache beyond max with unique queries
      for (let i = 0; i < maxSize + 20; i++) {
        index.searchSymbols(`query_${i}`, 100);
      }

      // Cache should not grow beyond max + 1 (one over before eviction)
      assert.ok(
        priv.searchCache.size <= maxSize + 1,
        `Cache should evict: size ${priv.searchCache.size} exceeds max ${maxSize + 1}`
      );
    });
  });

  // ---- 15. Fault injection: bridge stops mid-indexing ----
  describe('bridge failure resilience', () => {
    it('handles bridge.analyze throwing an error', async () => {
      const errors: string[] = [];
      const index = new WorkspaceIndex({
        isRunning: () => true,
        analyze: async () => {
          throw new Error('Bridge IPC failure');
        },
      } as any);
      index.setErrorCallback(msg => errors.push(msg));

      await index.indexDocument('file:///crash.pike', 'int x;', 1);

      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0]!.includes('Failed to index document'));
      assert.strictEqual(
        index.getAllDocumentUris().length,
        0,
        'Document should not be indexed on failure'
      );
    });

    it('handles bridge not running (graceful no-op)', async () => {
      const index = new WorkspaceIndex({
        isRunning: () => false,
        analyze: async () => {
          throw new Error('Should not be called');
        },
      } as any);

      await index.indexDocument('file:///stopped.pike', 'int x;', 1);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
    });
  });

  // ---- 16. searchSymbols with empty query (list-all) ----
  describe('searchSymbols empty query', () => {
    it('returns symbols from all documents, limited by limit parameter', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      seedSymbols(index, 'file:///a.pike', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
      seedSymbols(index, 'file:///b.pike', ['one', 'two', 'three', 'four', 'five', 'six']);

      const results = index.searchSymbols('', 3);
      assert.strictEqual(results.length, 3);
    });
  });
});
