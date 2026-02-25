import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import { RequestScheduler, RequestSupersededError } from '../services/request-scheduler.js';

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[index] ?? 0;
}

describe('Query engine perf gates', () => {
  it('measures queue-wait p95 and cancel-stop latency budget', async () => {
    const scheduler = new RequestScheduler();
    const queueTasks: Promise<void>[] = [];

    for (let i = 0; i < 80; i++) {
      queueTasks.push(
        scheduler.schedule({
          requestClass: i % 3 === 0 ? 'typing' : i % 3 === 1 ? 'interactive' : 'background',
          run: async checkpoint => {
            checkpoint();
            await new Promise(resolve => setTimeout(resolve, 1));
            checkpoint();
          },
        })
      );
    }

    await Promise.all(queueTasks);

    const t0 = Date.now();
    const first = scheduler.schedule({
      requestClass: 'typing',
      key: 'perf:file:///tmp/perf.pike',
      coalesceMs: 2,
      run: async () => {
        return;
      },
    });
    const second = scheduler.schedule({
      requestClass: 'typing',
      key: 'perf:file:///tmp/perf.pike',
      coalesceMs: 2,
      run: async () => {
        return;
      },
    });

    let cancelStopLatencyMs = -1;
    try {
      await first;
    } catch (err) {
      if (err instanceof RequestSupersededError) {
        cancelStopLatencyMs = Date.now() - t0;
      } else {
        throw err;
      }
    }
    await second;

    const metrics = scheduler.snapshotMetrics();
    const waits = [
      ...metrics.queueWaitMs.typing,
      ...metrics.queueWaitMs.interactive,
      ...metrics.queueWaitMs.background,
    ];
    const queueWaitP95 = percentile(waits, 0.95);

    assert.equal(cancelStopLatencyMs >= 0, true);
    assert.equal(cancelStopLatencyMs < 250, true);
    assert.equal(queueWaitP95 < 500, true);
  });

  it('keeps parse hard-fail rate at zero for malformed edit corpus', async () => {
    const bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Perf gates require Pike.');
    }

    await bridge.start();
    const malformed = [
      'int x = ;\n',
      'class C {\n  int y\n',
      'void run() {\n if (x\n }\n',
      '@@@ invalid token stream @@@\n',
      'mapping m = ([\n',
      'array a = ({ 1, 2\n',
    ];

    let hardFails = 0;
    for (let i = 0; i < 40; i++) {
      const text = malformed[i % malformed.length] ?? '';
      try {
        const response = await bridge.engineQuery({
          feature: 'diagnostics',
          requestId: `qe2-perf-hard-fail-${i}`,
          snapshot: { mode: 'latest' },
          queryParams: {
            uri: `file:///tmp/qe2-perf-${i}.pike`,
            filename: `/tmp/qe2-perf-${i}.pike`,
            version: i + 1,
            text,
          },
        });

        assert.equal(typeof response.snapshotIdUsed, 'string');
      } catch {
        hardFails += 1;
      }
    }

    await bridge.stop();

    const hardFailRate = hardFails / 40;
    assert.equal(hardFailRate, 0);
  });
});
