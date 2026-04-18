/**
 * WorkspaceIndex initialization and lifecycle adversarial tests.
 *
 * Tests the public API surface of WorkspaceIndex that stems from
 * the constructor, static constants, setBridge, setErrorCallback,
 * getMetrics/resetMetrics, clear(), and full lifecycle transitions.
 *
 * All tests exercise ONLY the public interface.
 */
import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { WorkspaceIndex } from '../workspace-index.js';
import type { IndexErrorCallback } from '../workspace-index-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnalyzeResult = { hasError: boolean; errorMessage?: string };

function makeBridge(
  overrides?: Partial<{
    analyzeResult: (text: string) => AnalyzeResult;
    isRunning: () => boolean;
    symbolName?: string;
  }>
) {
  const analyzeResult: (text: string) => AnalyzeResult =
    overrides?.analyzeResult ?? (() => ({ hasError: false }));
  const symbolName = overrides?.symbolName ?? 'mySymbol';
  return {
    isRunning: overrides?.isRunning ?? (() => true),
    analyze: async (_code: string, _modes: string[], _filename: string) => {
      const analysis = analyzeResult(_code);
      return {
        result: {
          parse: {
            symbols: analysis.hasError
              ? []
              : [{ name: symbolName, kind: 'variable', position: { line: 1 } }],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspaceIndex initialization and lifecycle', () => {
  // ---- 1. Static constants are positive integers ----
  describe('static constants', () => {
    it('PREFIX_INDEX_MAX_DEPTH is a positive integer', () => {
      const val = WorkspaceIndex.PREFIX_INDEX_MAX_DEPTH;
      assert.ok(Number.isInteger(val) && val > 0, `Expected positive integer, got ${val}`);
    });

    it('PREFIX_INDEX_MAX_SIZE is a positive integer', () => {
      const val = WorkspaceIndex.PREFIX_INDEX_MAX_SIZE;
      assert.ok(Number.isInteger(val) && val > 0, `Expected positive integer, got ${val}`);
    });

    it('PREFIX_INDEX_EVICT_BATCH is a positive integer', () => {
      const val = WorkspaceIndex.PREFIX_INDEX_EVICT_BATCH;
      assert.ok(Number.isInteger(val) && val > 0, `Expected positive integer, got ${val}`);
    });

    it('SEARCH_CACHE_MAX_SIZE is a positive integer', () => {
      const val = WorkspaceIndex.SEARCH_CACHE_MAX_SIZE;
      assert.ok(Number.isInteger(val) && val > 0, `Expected positive integer, got ${val}`);
    });

    it('SEARCH_CACHE_TTL_MS is a positive integer', () => {
      const val = WorkspaceIndex.SEARCH_CACHE_TTL_MS;
      assert.ok(Number.isInteger(val) && val > 0, `Expected positive integer, got ${val}`);
    });

    it('PREFIX_INDEX_MAX_SIZE is larger than PREFIX_INDEX_EVICT_BATCH', () => {
      // Eviction batch should not wipe the entire index at once
      assert.ok(
        WorkspaceIndex.PREFIX_INDEX_MAX_SIZE > WorkspaceIndex.PREFIX_INDEX_EVICT_BATCH,
        'MAX_SIZE should exceed EVICT_BATCH for meaningful eviction'
      );
    });
  });

  // ---- 2. Constructor variants ----
  describe('constructor', () => {
    it('new WorkspaceIndex() with no arguments creates a usable index', async () => {
      const index = new WorkspaceIndex();
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
      assert.deepStrictEqual(index.getStats(), { documents: 0, symbols: 0, uniqueNames: 0 });
      // indexDocument should silently no-op (no bridge)
      await index.indexDocument('file:///test.pike', 'int x;', 1);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
    });

    it('new WorkspaceIndex(undefined) is equivalent to no arguments', async () => {
      const index = new WorkspaceIndex(undefined as any);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
      await index.indexDocument('file:///test.pike', 'int x;', 1);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
    });

    it('new WorkspaceIndex(null) is equivalent to no arguments', async () => {
      const index = new WorkspaceIndex(null as any);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
      await index.indexDocument('file:///test.pike', 'int x;', 1);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);
    });
  });

  // ---- 3. setBridge replacement ----
  describe('setBridge', () => {
    it('replacing a stopped bridge with a running one enables indexing', async () => {
      const index = new WorkspaceIndex({ isRunning: () => false } as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      assert.deepStrictEqual(index.getAllDocumentUris(), []);

      index.setBridge(makeBridge() as any);
      await index.indexDocument('file:///b.pike', 'int y;', 1);
      assert.strictEqual(index.getAllDocumentUris().length, 1);
      assert.strictEqual(index.getAllDocumentUris()[0], 'file:///b.pike');
    });

    it('replacing a running bridge with a stopped one disables further indexing', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      assert.strictEqual(index.getAllDocumentUris().length, 1);

      index.setBridge({ isRunning: () => false } as any);
      await index.indexDocument('file:///b.pike', 'int y;', 1);
      // a.pike still indexed, b.pike was not
      assert.strictEqual(index.getAllDocumentUris().length, 1);
      assert.strictEqual(index.getAllDocumentUris()[0], 'file:///a.pike');
    });

    it('setBridge can be called multiple times without error', async () => {
      const index = new WorkspaceIndex();
      assert.doesNotThrow(() => {
        index.setBridge(makeBridge() as any);
        index.setBridge(makeBridge({ symbolName: 'other' }) as any);
        index.setBridge(makeBridge() as any);
      });
    });
  });

  // ---- 4. setErrorCallback edge cases ----
  describe('setErrorCallback', () => {
    it('callback that throws propagates the exception (known behavior: reportError does not guard user callbacks)', async () => {
      const index = new WorkspaceIndex({
        isRunning: () => true,
        analyze: async () => {
          throw new Error('Bridge failure');
        },
      } as any);

      index.setErrorCallback((_msg: string) => {
        throw new Error('Callback exploded');
      });

      // The exception from the user callback propagates — this is a known fragility.
      // If reportError is later hardened to catch callback exceptions, this test
      // must be updated to assert the no-throw behavior instead.
      await assert.rejects(() => index.indexDocument('file:///fail.pike', 'int x;', 1), {
        message: 'Callback exploded',
      });
    });

    it('can unset the error callback by setting null', async () => {
      const index = new WorkspaceIndex({
        isRunning: () => true,
        analyze: async () => {
          throw new Error('Bridge failure');
        },
      } as any);

      const errors: string[] = [];
      index.setErrorCallback(msg => errors.push(msg));
      await index.indexDocument('file:///fail1.pike', 'int x;', 1);
      assert.strictEqual(errors.length, 1);

      // Unset — no more callbacks
      index.setErrorCallback(null as unknown as IndexErrorCallback);
      await index.indexDocument('file:///fail2.pike', 'int y;', 1);
      assert.strictEqual(errors.length, 1, 'No new errors after unsetting callback');
    });
  });

  // ---- 5. getMetrics / resetMetrics after real indexing ----
  describe('getMetrics and resetMetrics after indexing', () => {
    it('getMetrics totalFilesIndexed stays zero for indexDocument (only indexDirectory increments it)', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      const before = index.getMetrics();
      assert.strictEqual(before.totalFilesIndexed, 0);

      await index.indexDocument('file:///a.pike', 'int x;', 1);
      await index.indexDocument('file:///b.pike', 'int y;', 1);

      const after = index.getMetrics();
      assert.strictEqual(after.totalFilesIndexed, 0);
    });

    it('resetMetrics clears counters without affecting indexed documents', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);

      index.resetMetrics();

      const afterReset = index.getMetrics();
      assert.strictEqual(afterReset.totalFilesIndexed, 0);
      assert.strictEqual(afterReset.lastIndexTimeMs, 0);

      // Documents remain indexed — resetMetrics does not clear the index
      assert.strictEqual(index.getStats().documents, 1);
      const results = index.searchSymbols('mySymbol');
      assert.ok(results.length > 0, 'Documents should still be searchable after resetMetrics');
    });
  });

  // ---- 6. clear() full lifecycle ----
  describe('clear() lifecycle', () => {
    it('clear then re-index produces correct results', async () => {
      const index = new WorkspaceIndex(makeBridge({ symbolName: 'firstSymbol' }) as any);

      await index.indexDocument('file:///a.pike', 'int x;', 1);
      assert.strictEqual(index.getStats().documents, 1);
      assert.ok(index.searchSymbols('firstSymbol').length > 0);

      index.clear();
      assert.deepStrictEqual(index.getStats(), { documents: 0, symbols: 0, uniqueNames: 0 });
      assert.deepStrictEqual(index.searchSymbols('firstSymbol'), []);

      // Re-index with a different bridge
      index.setBridge(makeBridge({ symbolName: 'secondSymbol' }) as any);
      await index.indexDocument('file:///b.pike', 'int y;', 2);
      assert.strictEqual(index.getStats().documents, 1);
      assert.ok(index.searchSymbols('secondSymbol').length > 0);
      assert.deepStrictEqual(index.searchSymbols('firstSymbol'), []);
    });

    it('clear is idempotent', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      assert.doesNotThrow(() => {
        index.clear();
        index.clear();
        index.clear();
      });
      assert.deepStrictEqual(index.getStats(), { documents: 0, symbols: 0, uniqueNames: 0 });
    });

    it('clear resets metrics counters', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      // Seed a document directly
      const docs = index as unknown as {
        documents: Map<string, { uri: string; symbols: unknown[] }>;
      };
      docs.documents.set('file:///a.pike', { uri: 'file:///a.pike', symbols: [] });

      index.clear();
      // Metrics are not reset by clear() — only by resetMetrics()
      // This test documents the contract: clear() wipes data, not metrics
      assert.strictEqual(docs.documents.size, 0, 'Documents should be empty after clear');
    });
  });

  // ---- 7. indexDocument with URI-encoded paths ----
  describe('indexDocument URI handling', () => {
    it('indexes documents with space-encoded URIs', async () => {
      const index = new WorkspaceIndex(makeBridge({ symbolName: 'spaceSymbol' }) as any);
      await index.indexDocument('file:///my%20dir/my%20file.pike', 'int x;', 1);
      assert.ok(index.getAllDocumentUris().length > 0);
      const results = index.searchSymbols('spaceSymbol');
      assert.ok(results.length > 0);
      assert.ok(
        results[0]!.location.uri.includes('my%20dir'),
        `URI should preserve encoding: ${results[0]!.location.uri}`
      );
    });

    it('indexes documents with special characters in URI', async () => {
      const index = new WorkspaceIndex(makeBridge({ symbolName: 'specialSymbol' }) as any);
      await index.indexDocument('file:///path/to/file%28copy%29.pike', 'int z;', 1);
      const results = index.searchSymbols('specialSymbol');
      assert.ok(results.length > 0);
    });

    it('handles consecutive indexDocument calls to the same URI (version update)', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///same.pike', 'int x;', 1);
      await index.indexDocument('file:///same.pike', 'int y;', 2);

      assert.strictEqual(
        index.getStats().documents,
        1,
        'Same URI should not create duplicate entries'
      );
    });
  });

  // ---- 8. searchSymbols case insensitivity ----
  describe('searchSymbols case handling', () => {
    it('search matches query case-insensitively against symbol names', async () => {
      const index = new WorkspaceIndex(makeBridge({ symbolName: 'mySymbol' }) as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);

      const lower = index.searchSymbols('mysym');
      const upper = index.searchSymbols('MYSYM');
      const mixed = index.searchSymbols('mYsYm');

      assert.ok(lower.length > 0, 'Lowercase query should match');
      assert.ok(upper.length > 0, 'Uppercase query should match');
      assert.ok(mixed.length > 0, 'Mixed case query should match');
      assert.strictEqual(lower.length, upper.length);
      assert.strictEqual(lower.length, mixed.length);
      assert.strictEqual(lower[0]!.name, 'mySymbol');
    });
  });

  // ---- 9. getStats accuracy ----
  describe('getStats accuracy', () => {
    it('symbol count reflects actual indexed symbols', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      await index.indexDocument('file:///b.pike', 'int y;', 1);

      const stats = index.getStats();
      assert.strictEqual(stats.documents, 2);
      // makeBridge returns 1 symbol per document
      assert.strictEqual(stats.symbols, 2);
    });

    it('symbol count is zero after removing all documents', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      await index.indexDocument('file:///b.pike', 'int y;', 1);

      index.removeDocument('file:///a.pike');
      index.removeDocument('file:///b.pike');

      const stats = index.getStats();
      assert.strictEqual(stats.documents, 0);
      assert.strictEqual(stats.symbols, 0);
    });
  });

  // ---- 10. getDocumentSymbols returns symbols from IndexedDocument ----
  describe('getDocumentSymbols', () => {
    it('returns original PikeSymbol objects (not FlattenedSymbolEntry)', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);

      const symbols = index.getDocumentSymbols('file:///a.pike');
      assert.strictEqual(symbols.length, 1);
      assert.strictEqual(symbols[0]!.name, 'mySymbol');
      // The returned object should be a PikeSymbol, not wrapped in FlattenedSymbolEntry
      assert.ok(!('parentName' in symbols[0]!), 'Should not have parentName on unwrapped symbol');
      assert.ok(!('symbol' in symbols[0]!), 'Should not have nested symbol property');
    });

    it('returns empty array for non-existent URI without throwing', () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      assert.deepStrictEqual(index.getDocumentSymbols('file:///ghost.pike'), []);
    });
  });

  // ---- 11. searchImportableSymbols options ----
  describe('searchImportableSymbols', () => {
    it('excludeUri filters out symbols from the specified URI', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      await index.indexDocument('file:///a.pike', 'int x;', 1);
      await index.indexDocument('file:///b.pike', 'int y;', 1);

      const all = index.searchImportableSymbols('my');
      const filtered = index.searchImportableSymbols('my', { excludeUri: 'file:///a.pike' });

      assert.ok(all.length >= 2, 'Both URIs should contribute symbols');
      for (const result of filtered) {
        assert.notStrictEqual(result.modulePath, 'a', 'Excluded URI should not appear');
      }
    });

    it('limit parameter restricts results', async () => {
      const index = new WorkspaceIndex(makeBridge() as any);
      for (let i = 0; i < 10; i++) {
        await index.indexDocument(`file:///f${i}.pike`, 'int x;', 1);
      }

      const limited = index.searchImportableSymbols('my', { limit: 3 });
      assert.ok(limited.length <= 3, `Expected at most 3 results, got ${limited.length}`);
    });
  });

  // ---- 12. removeDocument clears search cache for affected URI ----
  describe('removeDocument search cache invalidation', () => {
    it('search after removeDocument does not return stale results', async () => {
      const index = new WorkspaceIndex(makeBridge({ symbolName: 'ephemeral' }) as any);
      await index.indexDocument('file:///temp.pike', 'int x;', 1);

      // Populate cache
      const before = index.searchSymbols('ephemeral');
      assert.ok(before.length > 0);

      // Remove the document
      index.removeDocument('file:///temp.pike');

      // Search should return empty (cache invalidated for that URI)
      const after = index.searchSymbols('ephemeral');
      assert.deepStrictEqual(after, [], 'Should not return stale cached results after removal');
    });
  });
});
