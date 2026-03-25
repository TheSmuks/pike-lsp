import type { DocumentCacheEntry } from '../../../core/types.js';
import { buildStaleFallbackEntry } from '../../../features/diagnostics/index.js';

const { describe, expect, it } = require('bun:test');

describe('error-tolerant analysis fallback', () => {
  it('preserves last known symbols when parse fails', () => {
    const existing: DocumentCacheEntry = {
      version: 2,
      symbols: [
        {
          name: 'stableSymbol',
          kind: 'variable',
          modifiers: [],
        },
      ],
      diagnostics: [],
      symbolPositions: new Map([['stableSymbol', [{ line: 0, character: 4 }]]]),
      symbolNames: new Map(),
      contentHash: 'prev',
      lineHashes: [1, 2],
    };

    const next = buildStaleFallbackEntry(existing, 3, [], 'next', [3, 4]);

    expect(next.version).toBe(3);
    expect(next.symbols.map(symbol => symbol.name)).toEqual(['stableSymbol']);
    expect(next.symbolPositions.get('stableSymbol')?.length).toBe(1);
    expect(next.analysisState).toEqual({ isStale: true, parseFailed: true });
    expect(next.contentHash).toBe('next');
  });

  it('creates predictable empty stale entry when no prior analysis exists', () => {
    const next = buildStaleFallbackEntry(undefined, 1, [], 'fresh', [5]);

    expect(next.version).toBe(1);
    expect(next.symbols).toEqual([]);
    expect(next.symbolPositions.size).toBe(0);
    expect(next.symbolNames.size).toBe(0);
    expect(next.analysisState).toEqual({ isStale: true, parseFailed: true });
  });
});
