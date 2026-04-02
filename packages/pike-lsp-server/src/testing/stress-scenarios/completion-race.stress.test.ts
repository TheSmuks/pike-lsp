import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { createMockBridge } from '../../tests/helpers/test-helpers.js';
import { stressRunner } from '../stress-runner.js';

describe('Stress: completion under load', () => {
  it('handles 1000 completion queries with concurrency', async () => {
    const bridge = createMockBridge({ delayMs: 1 });

    const result = await stressRunner.run(
      'completion-race',
      1000,
      async (seed, iteration) => {
        const line = seed % 100;
        const character = (seed >>> 7) % 120;
        const response = await bridge.engineQuery({
          queryParams: {
            text: `completion:${iteration}:${line}:${character}`,
          },
        });

        assert.strictEqual(typeof response.snapshotIdUsed, 'string');
      },
      {
        concurrency: 5,
        delayMs: { min: 10, max: 100 },
        timeoutMs: 5_000,
      }
    );

    assert.strictEqual(result.failures, 0);
    assert.strictEqual(result.completed, 1000);
    assert.strictEqual(bridge.callCount, 1000);
    assert(result.durationMs < 60_000);
  }, 60_000);
});
