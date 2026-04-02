import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { RequestScheduler } from '../services/request-scheduler.js';
import { createMockBridge, type FaultInjectableMockBridge } from '../tests/helpers/test-helpers.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe('Fault scenario: request timeout and retry', () => {
  it('cancels a hanging keyed request and allows retry to succeed', async () => {
    const bridge = createMockBridge({
      faultInjection: {
        hangDurationMs: 5000,
        crashAtOperation: 'engineQuery',
        failWithError: new Error('simulated timeout crash'),
        probability: 1,
      },
    }) as FaultInjectableMockBridge;

    const scheduler = new RequestScheduler({ maxConcurrent: 2 });
    const key = 'diagnostics:file:///fault-timeout.pike';

    const first = scheduler.schedule({
      requestClass: 'typing',
      key,
      run: async checkpoint => {
        checkpoint();
        await bridge.engineQuery({ queryParams: { text: 'int x = 1;\n' } });
        checkpoint();
      },
    });
    first.catch(() => {});

    await wait(20);
    bridge.setFaultConfig({});

    const retry = scheduler.schedule({
      requestClass: 'typing',
      key,
      run: async checkpoint => {
        checkpoint();
        await bridge.engineQuery({ queryParams: { text: 'int x = 2;\n' } });
        checkpoint();
      },
    });

    await retry;

    const metrics = scheduler.snapshotMetrics();
    assert.equal(metrics.canceled >= 1, true);
    assert.equal(bridge.callCount >= 2, true);
  });
});
