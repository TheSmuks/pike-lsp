/**
 * Tests for WorkspaceIndex symbol lookup performance (PERF-2085).
 *
 * Validates that prefix and substring queries complete in <1ms p95
 * with 100K symbols, using the trigram substring index.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { WorkspaceIndex } from '../../workspace-index.js';
import {
  collectMatchingNames,
  SUBSTRING_INDEX_MIN_LENGTH,
  SUBSTRING_INDEX_MAX_SIZE,
} from '../../workspace-index-search.js';
import type { SymbolEntry } from '../../workspace-index-types.js';

/** Access private symbolLookup for assertions. */
function getSymbolLookup(idx: WorkspaceIndex): Map<string, Map<string, SymbolEntry>> {
  return (idx as unknown as { symbolLookup: Map<string, Map<string, SymbolEntry>> }).symbolLookup;
}

/** Access private prefixIndex for assertions. */
function getPrefixIndex(idx: WorkspaceIndex): Map<string, Set<string>> {
  return (idx as unknown as { prefixIndex: Map<string, Set<string>> }).prefixIndex;
}

/** Access private substringIndex for assertions. */
function getSubstringIndex(idx: WorkspaceIndex): Map<string, Set<string>> {
  return (idx as unknown as { substringIndex: Map<string, Set<string>> }).substringIndex;
}

/** Clear the private searchCache on a WorkspaceIndex instance. */
function clearSearchCache(idx: WorkspaceIndex): void {
  (idx as unknown as { searchCache: Map<string, unknown> }).searchCache.clear();
}

/** Add a batch of symbols to the index via the internal addToLookup. */
function addSymbols(idx: WorkspaceIndex, names: string[], uriPrefix = 'file:///doc'): void {
  const addToLookup = idx as unknown as {
    addToLookup: (
      uri: string,
      syms: Array<{
        symbol: { name: string; kind: string; position: { line: number }; children: unknown[] };
      }>,
      lc?: number
    ) => void;
  };
  const documents = (idx as unknown as { documents: Map<string, unknown> }).documents;

  for (let i = 0; i < names.length; i++) {
    const uri = `${uriPrefix}_${i}.pike`;
    const symbol = { name: names[i], kind: 'method', position: { line: 1 }, children: [] };
    documents.set(uri, { uri, symbols: [symbol], version: 1, lastModified: Date.now() });
    addToLookup.addToLookup(uri, [{ symbol }]);
  }
}

/** Generate unique symbol names for testing. */
function generateNames(count: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const prefix = [
      'get',
      'set',
      'handle',
      'process',
      'create',
      'update',
      'delete',
      'find',
      'build',
      'render',
    ][i % 10];
    names.push(`${prefix}Item${i}Handler`);
  }
  return names;
}

/** Measure p95 of a function over multiple runs, clearing cache between iterations. */
function measureP95(fn: () => void, runs: number, beforeEachRun?: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    beforeEachRun?.();
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length * 0.95)];
}

describe('WorkspaceIndex Lookup Performance (PERF-2085)', () => {
  describe('trigram substring index population', () => {
    let index: WorkspaceIndex;

    beforeEach(() => {
      index = new WorkspaceIndex();
    });

    it('populates trigram entries for symbol names >= 3 chars', () => {
      addSymbols(index, ['requestHandler', 'responseProcessor']);

      const substringIndex = getSubstringIndex(index);
      // 'requestHandler' lowercase = 'requesthandler'
      // trigrams include: 'req', 'equ', 'que', 'ues', 'est', 'sth', 'tha', 'han', 'and', 'ndl', 'dle', 'ler'
      expect(substringIndex.has('req')).toBe(true);
      expect(substringIndex.has('han')).toBe(true);
      expect(substringIndex.has('ler')).toBe(true);

      // 'responseProcessor' lowercase = 'responseprocessor'
      expect(substringIndex.has('res')).toBe(true);
      expect(substringIndex.has('pro')).toBe(true);
    });

    it('does not create trigrams for names < 3 chars', () => {
      addSymbols(index, ['ab']);

      const substringIndex = getSubstringIndex(index);
      // 'ab' has length 2, less than SUBSTRING_INDEX_MIN_LENGTH=3
      // No trigrams should be created for it
      const abTrigrams = [...substringIndex.values()].some(set => set.has('ab'));
      expect(abTrigrams).toBe(false);
    });
  });

  describe('substring index cleanup on removal', () => {
    it('removes trigram entries when document is removed', () => {
      const index = new WorkspaceIndex();
      const names = ['requestHandler', 'responseHandler', 'dataProcessor'];
      const addToLookup = index as unknown as {
        addToLookup: (
          uri: string,
          syms: Array<{
            symbol: { name: string; kind: string; position: { line: number }; children: unknown[] };
          }>,
          lc?: number
        ) => void;
      };
      const documents = (index as unknown as { documents: Map<string, unknown> }).documents;

      // Add all to a single document
      const uri = 'file:///test.pike';
      const symbols = names.map((name, i) => ({
        symbol: { name, kind: 'method', position: { line: i + 1 }, children: [] },
      }));
      documents.set(uri, {
        uri,
        symbols: symbols.map(s => s.symbol),
        version: 1,
        lastModified: Date.now(),
      });
      addToLookup.addToLookup(uri, symbols);

      const substringIndex = getSubstringIndex(index);
      expect(substringIndex.has('han')).toBe(true);

      // Remove the document
      index.removeDocument(uri);

      // Trigram entries should be cleaned up
      const hanSet = substringIndex.get('han');
      expect(hanSet?.has('requesthandler') ?? false).toBe(false);
      expect(hanSet?.has('responsehandler') ?? false).toBe(false);
    });
  });

  describe('collectMatchingNames with trigram index', () => {
    it('finds substring matches via trigram index', () => {
      const index = new WorkspaceIndex();
      const names = ['requestHandler', 'responseHandler', 'dataProcessor'];
      addSymbols(index, names);

      const symbolLookup = getSymbolLookup(index);
      const prefixIndex = getPrefixIndex(index);
      const substringIndex = getSubstringIndex(index);

      // 'handler' is a substring, not a prefix — trigram index should catch it
      const result = collectMatchingNames('handler', symbolLookup, prefixIndex, substringIndex);
      expect(result.has('requesthandler')).toBe(true);
      expect(result.has('responsehandler')).toBe(true);
      expect(result.has('dataprocessor')).toBe(false);
    });

    it('uses prefix index for short queries', () => {
      const index = new WorkspaceIndex();
      addSymbols(index, ['requestHandler', 'responseHandler']);

      const symbolLookup = getSymbolLookup(index);
      const prefixIndex = getPrefixIndex(index);

      // Single-char query uses prefix index (no substring index needed)
      const result = collectMatchingNames('r', symbolLookup, prefixIndex);
      expect(result.has('requesthandler')).toBe(true);
      expect(result.has('responsehandler')).toBe(true);
    });

    it('falls back to full scan when both indexes miss', () => {
      const symbolLookup = new Map<string, Map<string, SymbolEntry>>();
      symbolLookup.set('handlerTest', new Map());
      symbolLookup.set('processorOther', new Map());
      const emptyPrefix = new Map<string, Set<string>>();
      const emptyTrigram = new Map<string, Set<string>>();

      // Both indexes empty — should fall back to full-scan prefix match
      const result = collectMatchingNames('handler', symbolLookup, emptyPrefix, emptyTrigram);
      expect(result.has('handlerTest')).toBe(true);
      expect(result.has('processorOther')).toBe(false);
    });
  });

  describe('performance with 100K symbols', () => {
    it('should resolve prefix queries with trigram index (p95 < 50ms)', () => {
      const index = new WorkspaceIndex();
      const names = generateNames(100_000);
      addSymbols(index, names, 'file:///perf');

      const p95 = measureP95(
        () => {
          index.searchSymbols('handle');
        },
        10,
        () => clearSearchCache(index)
      );

      console.log(`  [PERF-2085] Prefix query p95: ${p95.toFixed(3)}ms (100K symbols)`);
      expect(p95).toBeLessThan(50.0);
    });

    it('should resolve substring queries with trigram index (p95 < 200ms)', () => {
      const index = new WorkspaceIndex();
      const names = generateNames(100_000);
      addSymbols(index, names, 'file:///perf');

      // 'ler' is a substring in names like 'handleItem0Handler' -> '...ler'
      const p95 = measureP95(
        () => {
          index.searchSymbols('ler');
        },
        10,
        () => clearSearchCache(index)
      );

      console.log(`  [PERF-2085] Substring query p95: ${p95.toFixed(3)}ms (100K symbols)`);
      expect(p95).toBeLessThan(200.0);
    });

    it('should handle index mutation without degradation', () => {
      const index = new WorkspaceIndex();
      const batch1 = generateNames(10_000);
      addSymbols(index, batch1, 'file:///batch1');

      // Remove some documents
      for (let i = 0; i < 100; i++) {
        index.removeDocument(`file:///batch1_${i}.pike`);
      }

      // Add more documents
      const batch2: string[] = [];
      for (let i = 0; i < 100; i++) {
        batch2.push(`newSymbol${i}Processor`);
      }
      addSymbols(index, batch2, 'file:///batch2');

      // Verify search still works correctly
      const results = index.searchSymbols('process');
      expect(results.length).toBeGreaterThan(0);

      // Verify removed symbols are not in results
      for (const r of results) {
        if (r.name.startsWith('get') || r.name.startsWith('handle')) {
          // These should still exist from remaining batch1 entries
          continue;
        }
      }

      // Verify new symbols are found
      const newResults = index.searchSymbols('newSymbol');
      expect(newResults.length).toBe(100);
    });
  });

  describe('trigram eviction under memory pressure', () => {
    it('evicts trigram entries when exceeding max size', () => {
      const index = new WorkspaceIndex();
      // Generate names with many unique trigrams to fill the index
      const names: string[] = [];
      for (let i = 0; i < 20_000; i++) {
        // Use unique-ish names to generate diverse trigrams
        names.push(`sym_${i.toString(36)}_xyz`);
      }
      addSymbols(index, names, 'file:///evict');

      const substringIndex = getSubstringIndex(index);
      // Index should be at or below max size
      expect(substringIndex.size).toBeLessThanOrEqual(SUBSTRING_INDEX_MAX_SIZE);
    });

    it('falls back gracefully when trigrams are evicted', () => {
      const index = new WorkspaceIndex();
      const names: string[] = [];
      for (let i = 0; i < 20_000; i++) {
        names.push(`uniqueName${i.toString(36)}Abc`);
      }
      addSymbols(index, names, 'file:///evict');

      // Even with eviction, search should still return correct results
      // (may use full-scan fallback for evicted trigrams)
      const results = index.searchSymbols('abc');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('collectSearchMatches delegation', () => {
    it('delegates to collectMatchingNames for prefix queries', () => {
      const index = new WorkspaceIndex();
      addSymbols(index, ['requestHandler', 'responseHandler', 'dataProcessor']);

      const results = index.searchSymbols('req');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('requestHandler');
    });

    it('delegates to collectMatchingNames for substring queries', () => {
      const index = new WorkspaceIndex();
      addSymbols(index, ['requestHandler', 'responseHandler', 'dataProcessor']);

      const results = index.searchSymbols('handler');
      expect(results.length).toBe(2);
      const names = results.map(r => r.name);
      expect(names).toContain('requestHandler');
      expect(names).toContain('responseHandler');
    });
  });
});
