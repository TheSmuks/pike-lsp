/**
 * WorkspaceIndex Lookup Performance Tests (PERF-2085)
 *
 * Tests that prefix and substring symbol lookup remains fast with large symbol sets.
 * Uses WorkspaceIndex directly (no PikeBridge subprocess required).
 */
import { describe, it, expect } from 'bun:test';
import { WorkspaceIndex } from '../workspace-index.js';
import type { FlattenedSymbolEntry } from '../workspace-index-types.js';

/** Generate N unique symbol names. */
function generateSymbolNames(count: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const prefixes = [
      'get',
      'set',
      'handle',
      'process',
      'render',
      'compute',
      'parse',
      'validate',
      'transform',
      'resolve',
    ];
    const suffixes = [
      'Request',
      'Response',
      'Handler',
      'Processor',
      'Result',
      'Data',
      'Value',
      'Config',
      'Builder',
      'Factory',
    ];
    const prefix = prefixes[i % prefixes.length];
    const suffix = suffixes[Math.floor(i / prefixes.length) % suffixes.length];
    names.push(`${prefix}${suffix}${i}`);
  }
  return names;
}

/** Populate index with symbols without needing PikeBridge. */
function populateIndex(index: WorkspaceIndex, names: string[]): void {
  for (let i = 0; i < names.length; i++) {
    const uri = `file:///src/file${i % 100}.pike`;
    const symbols: FlattenedSymbolEntry[] = [
      {
        symbol: {
          name: names[i],
          kind: i % 3 === 0 ? 'method' : i % 3 === 1 ? 'class' : 'variable',
          position: { line: i + 1, character: 0 },
        },
      },
    ];
    (
      index as unknown as {
        addToLookup: (uri: string, syms: FlattenedSymbolEntry[], lc?: number) => void;
      }
    ).addToLookup(uri, symbols, 100);
  }
}

/** Compute p95 of an array of durations in ms. */
function p95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)];
}

describe('WorkspaceIndex Lookup Performance', () => {
  it('should resolve prefix queries efficiently with 100K symbols', () => {
    const index = new WorkspaceIndex();
    const names = generateSymbolNames(100_000);
    populateIndex(index, names);

    // Measure cold lookup times (clear cache between each)
    const coldDurations: number[] = [];
    const prefixQueries = [
      'get',
      'set',
      'handle',
      'process',
      'render',
      'compute',
      'parse',
      'valid',
      'trans',
      'reso',
    ];

    for (const query of prefixQueries) {
      (index as unknown as { searchCache: Map<string, unknown> }).searchCache.clear();
      const start = performance.now();
      index.searchSymbols(query);
      coldDurations.push(performance.now() - start);
    }

    const coldP95 = p95(coldDurations);
    console.log(
      `  [PERF-2085] Prefix cold query p95: ${coldP95.toFixed(3)}ms over ${coldDurations.length} queries`
    );
    // With 100K symbols, result construction/scoring dominates; trigram index keeps name collection O(k)
    expect(coldP95).toBeLessThan(50);
  });

  it('should resolve substring queries efficiently with 100K symbols', () => {
    const index = new WorkspaceIndex();
    const names = generateSymbolNames(100_000);
    populateIndex(index, names);

    const coldDurations: number[] = [];
    // Substring queries that are NOT prefixes — they appear mid-name
    const substringQueries = [
      'ler',
      'quest',
      'spon',
      'fact',
      'data',
      'valu',
      'uild',
      'cess',
      'nder',
      'sult',
    ];

    for (const query of substringQueries) {
      (index as unknown as { searchCache: Map<string, unknown> }).searchCache.clear();
      const start = performance.now();
      index.searchSymbols(query);
      coldDurations.push(performance.now() - start);
    }

    const coldP95 = p95(coldDurations);
    console.log(
      `  [PERF-2085] Substring cold query p95: ${coldP95.toFixed(3)}ms over ${coldDurations.length} queries`
    );
    expect(coldP95).toBeLessThan(50);
  });

  it('should find correct results via substring matching', () => {
    const index = new WorkspaceIndex();

    const symbols: FlattenedSymbolEntry[] = [
      { symbol: { name: 'requestHandler', kind: 'method', position: { line: 1, character: 0 } } },
      { symbol: { name: 'responseHandler', kind: 'method', position: { line: 2, character: 0 } } },
      { symbol: { name: 'dataProcessor', kind: 'method', position: { line: 3, character: 0 } } },
    ];

    (
      index as unknown as {
        addToLookup: (uri: string, syms: FlattenedSymbolEntry[], lc?: number) => void;
      }
    ).addToLookup('file:///src/test.pike', symbols, 10);

    const results = index.searchSymbols('handler');
    const names = results.map(r => r.name);

    expect(names).toContain('requestHandler');
    expect(names).toContain('responseHandler');
    expect(names).not.toContain('dataProcessor');
  });

  it('should handle index mutation without stale entries', () => {
    const index = new WorkspaceIndex();

    const symbols1: FlattenedSymbolEntry[] = [
      { symbol: { name: 'alphaHandler', kind: 'method', position: { line: 1, character: 0 } } },
      { symbol: { name: 'betaHandler', kind: 'method', position: { line: 2, character: 0 } } },
    ];

    const symbols2: FlattenedSymbolEntry[] = [
      { symbol: { name: 'gammaHandler', kind: 'method', position: { line: 1, character: 0 } } },
    ];

    const addLookup = (
      index as unknown as {
        addToLookup: (uri: string, syms: FlattenedSymbolEntry[], lc?: number) => void;
      }
    ).addToLookup.bind(index);

    addLookup('file:///src/a.pike', symbols1, 10);
    addLookup('file:///src/b.pike', symbols2, 10);

    // 'and' appears in all three names as part of 'handler'
    let results = index.searchSymbols('and');
    expect(results.map(r => r.name)).toEqual(
      expect.arrayContaining(['alphaHandler', 'betaHandler', 'gammaHandler'])
    );

    // Remove one document and clear cache (removeFromLookup is low-level)
    (index as unknown as { removeFromLookup: (uri: string) => void }).removeFromLookup(
      'file:///src/a.pike'
    );
    (index as unknown as { searchCache: Map<string, unknown> }).searchCache.clear();

    results = index.searchSymbols('and');
    const names = results.map(r => r.name);
    expect(names).not.toContain('alphaHandler');
    expect(names).not.toContain('betaHandler');
    expect(names).toContain('gammaHandler');
  });

  it('should handle trigram eviction gracefully with fallback', () => {
    const index = new WorkspaceIndex();
    const names = generateSymbolNames(500);
    populateIndex(index, names);

    // Force eviction by deleting most trigram entries
    const state = (
      index as unknown as {
        substringIndex: Map<string, Set<string>>;
      }
    ).substringIndex;

    const keys = Array.from(state.keys());
    for (let i = 0; i < keys.length - 2; i++) {
      state.delete(keys[i]);
    }

    // Substring search should still work via full-scan fallback
    const results = index.searchSymbols('handler');
    expect(Array.isArray(results)).toBe(true);
  });
});
