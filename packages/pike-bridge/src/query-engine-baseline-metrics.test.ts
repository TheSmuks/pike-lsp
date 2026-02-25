import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';
import { BENCHMARK_CORPUS } from './benchmark-corpus.js';

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
}

describe('Query engine baseline metrics', () => {
  let bridge: PikeBridge;

  before(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Baseline metrics tests require Pike.');
    }
    await bridge.start();
  });

  after(async () => {
    await bridge.stop();
  });

  it('captures baseline p50/p95 and memory profile for migrated query features', async () => {
    const featureDurations: Record<string, number[]> = {
      diagnostics: [],
      definition: [],
      references: [],
      completion: [],
    };

    const iterations = 20;
    let peakHeapUsed = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      const corpus = BENCHMARK_CORPUS[i % BENCHMARK_CORPUS.length] ?? BENCHMARK_CORPUS[0];
      if (!corpus) {
        throw new Error('Benchmark corpus is empty');
      }

      const uri = corpus.uri;
      const filename = corpus.filename;
      const version = i + 1;
      const text = corpus.text;

      const queries: Array<{
        feature: keyof typeof featureDurations;
        params: Record<string, unknown>;
      }> = [
        {
          feature: 'diagnostics',
          params: { uri, filename, version, text },
        },
        {
          feature: 'definition',
          params: { uri, filename, version, text, position: { line: 1, character: 12 } },
        },
        {
          feature: 'references',
          params: { uri, filename, version, text, position: { line: 1, character: 12 } },
        },
        {
          feature: 'completion',
          params: { uri, filename, version, text, position: { line: 1, character: 2 } },
        },
      ];

      for (const query of queries) {
        const start = performance.now();
        const response = await bridge.engineQuery({
          feature: query.feature,
          requestId: `qe2-baseline-${query.feature}-${i}`,
          snapshot: { mode: 'latest' },
          queryParams: query.params,
        });
        const elapsed = performance.now() - start;

        const durations = featureDurations[query.feature];
        if (!durations) {
          throw new Error(`Missing duration bucket for feature ${query.feature}`);
        }
        durations.push(elapsed);
        assert.ok(
          typeof response.snapshotIdUsed === 'string' && response.snapshotIdUsed.length > 0
        );
      }

      const heapUsed = process.memoryUsage().heapUsed;
      if (heapUsed > peakHeapUsed) {
        peakHeapUsed = heapUsed;
      }
    }

    for (const [feature, durations] of Object.entries(featureDurations)) {
      const p50 = percentile(durations, 0.5);
      const p95 = percentile(durations, 0.95);
      assert.ok(Number.isFinite(p50) && p50 >= 0, `${feature} p50 should be captured`);
      assert.ok(Number.isFinite(p95) && p95 >= p50, `${feature} p95 should be captured`);
    }

    const finalHeapUsed = process.memoryUsage().heapUsed;
    assert.ok(peakHeapUsed >= finalHeapUsed, 'Peak heap should be at least final heap usage');
    assert.ok(peakHeapUsed > 0, 'Peak heap usage should be captured');
  });
});
