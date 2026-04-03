import { describe, it, expect } from 'bun:test';
import { WorkspaceIndex } from '../../workspace-index.js';

function seedWorkspaceSymbols(index: WorkspaceIndex, symbolCount: number): void {
  const state = index as unknown as {
    documents: Map<string, unknown>;
    addToLookup: (uri: string, entries: unknown[], lineCount?: number) => void;
    searchCache: Map<string, unknown>;
  };

  const perFile = 250;
  const fileCount = Math.ceil(symbolCount / perFile);

  for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
    const uri = `file:///workspace/perf-${fileIndex}.pike`;
    const entries: Array<{ symbol: { name: string; kind: string; position: { line: number } } }> =
      [];

    for (let i = 0; i < perFile; i++) {
      const globalIndex = fileIndex * perFile + i;
      if (globalIndex >= symbolCount) {
        break;
      }

      const name =
        globalIndex % 200 === 0 ? `renderSymbol${globalIndex}` : `utilitySymbol${globalIndex}`;
      entries.push({
        symbol: {
          name,
          kind: 'method',
          position: { line: i + 1 },
        },
      });
    }

    state.documents.set(uri, {
      uri,
      symbols: entries,
      version: 1,
      lastModified: Date.now(),
      lineCount: perFile + 5,
    });
    state.addToLookup(uri, entries, perFile + 5);
  }

  state.searchCache.clear();
}

describe('Workspace symbol latency gate', () => {
  it('returns first ranked page under 100ms for 10k symbols', () => {
    const index = new WorkspaceIndex();
    seedWorkspaceSymbols(index, 10_000);

    const start = performance.now();
    const results = index.searchSymbols('render', 100);
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name.startsWith('render')).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});
