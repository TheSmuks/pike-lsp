import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { createMockBridge } from '../../tests/helpers/test-helpers.js';
import { stressRunner } from '../stress-runner.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Stress: cancel-restart cycle', () => {
  it('recovers from repeated cancel and restart during validation load', async () => {
    let cancelCount = 0;
    let queryCount = 0;

    const bridge = createMockBridge({
      delayMs: 1,
      onCancel: () => {
        cancelCount += 1;
      },
      onQuery: () => {
        queryCount += 1;
      },
    });

    const result = await stressRunner.run(
      'cancel-restart',
      1000,
      async seed => {
        const mode = seed % 4;

        if (mode === 0) {
          if (!bridge.isRunning()) {
            await bridge.start();
          }
          await bridge.engineQuery({ queryParams: { text: `validate:${seed}` } });
          return;
        }

        if (mode === 1) {
          await bridge.engineCancelRequest();
          return;
        }

        if (mode === 2) {
          await bridge.stop();
          await sleep((seed % 5) + 1);
          await bridge.start();
          return;
        }

        await bridge.stop();
        let expectedFailure = false;
        try {
          await bridge.engineQuery({ queryParams: { text: `stopped:${seed}` } });
        } catch {
          expectedFailure = true;
        }

        await bridge.start();
        await bridge.engineQuery({ queryParams: { text: `recovered:${seed}` } });
        assert.strictEqual(expectedFailure, true);
      },
      {
        concurrency: 4,
        delayMs: { min: 10, max: 30 },
        timeoutMs: 5_000,
      }
    );

    assert.strictEqual(result.failures, 0);
    assert.strictEqual(bridge.isRunning(), true);
    assert(cancelCount > 0);
    assert(queryCount > 0);
    assert(result.durationMs < 90_000);
  }, 60_000);
});
