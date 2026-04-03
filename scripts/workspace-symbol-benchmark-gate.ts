import assert from 'node:assert/strict';
import { WorkspaceIndex } from '../packages/pike-lsp-server/src/workspace-index.js';

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
}

function seedWorkspaceIndex(index: WorkspaceIndex, symbolCount: number): void {
  const state = index as unknown as {
    documents: Map<string, unknown>;
    addToLookup: (uri: string, entries: unknown[], lineCount?: number) => void;
    searchCache: Map<string, unknown>;
  };

  const symbolsPerFile = 250;
  const files = Math.ceil(symbolCount / symbolsPerFile);

  for (let file = 0; file < files; file++) {
    const uri = `file:///benchmark/workspace-${file}.pike`;
    const entries: Array<{ symbol: { name: string; kind: string; position: { line: number } } }> =
      [];

    for (let i = 0; i < symbolsPerFile; i++) {
      const globalIndex = file * symbolsPerFile + i;
      if (globalIndex >= symbolCount) {
        break;
      }

      entries.push({
        symbol: {
          name:
            globalIndex % 200 === 0
              ? `renderWorkspaceSymbol${globalIndex}`
              : `utilitySymbol${globalIndex}`,
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
      lineCount: symbolsPerFile + 5,
    });
    state.addToLookup(uri, entries, symbolsPerFile + 5);
  }

  state.searchCache.clear();
}

function runGate(): void {
  const index = new WorkspaceIndex();
  seedWorkspaceIndex(index, 10_000);

  const samples: number[] = [];
  for (let i = 0; i < 40; i++) {
    const start = performance.now();
    const results = index.searchSymbols('render', 100);
    const elapsed = performance.now() - start;
    samples.push(elapsed);
    if (results.length === 0) {
      throw new Error('Workspace symbol benchmark returned no results');
    }
  }

  const p95 = percentile(samples, 0.95);
  const average = samples.reduce((acc, sample) => acc + sample, 0) / samples.length;

  console.log(
    `[workspace-symbol-benchmark] samples=${samples.length} avg=${average.toFixed(2)}ms p95=${p95.toFixed(2)}ms`
  );

  assert.equal(p95 < 100, true, `Expected p95 < 100ms for 10k symbols, got ${p95.toFixed(2)}ms`);
}

runGate();
