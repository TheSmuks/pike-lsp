import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { RequestScheduler, RequestSupersededError } from '../services/request-scheduler.js';

describe('RequestScheduler regressions (#882)', () => {
  it('cancels an in-flight keyed request when superseded and runs the replacement', async () => {
    const scheduler = new RequestScheduler();
    const releaseFirst: { fn?: () => void } = {};
    const gate = new Promise<void>(resolve => {
      releaseFirst.fn = resolve;
    });

    const first = scheduler.schedule({
      requestClass: 'typing',
      key: 'completion:file:///tmp/file.pike',
      run: async checkpoint => {
        await gate;
        checkpoint();
        return 'first';
      },
    });

    const second = scheduler.schedule({
      requestClass: 'typing',
      key: 'completion:file:///tmp/file.pike',
      run: async () => 'second',
    });

    const release = releaseFirst.fn;
    if (!release) {
      throw new Error('missing gate release function');
    }
    release();

    let firstError: unknown;
    try {
      await first;
      throw new Error('expected first request to be superseded');
    } catch (error) {
      firstError = error;
    }

    assert.equal(firstError instanceof RequestSupersededError, true);
    assert.equal(
      (firstError as Error).message,
      'Cancelled during execution key=completion:file:///tmp/file.pike id=1'
    );
    assert.equal(await second, 'second');
  });

  it('coalesces repeated keyed requests and rejects superseded coalesced entry', async () => {
    const scheduler = new RequestScheduler();
    let runs = 0;

    const first = scheduler.schedule({
      requestClass: 'typing',
      key: 'file:///tmp/coalesce.pike',
      coalesceMs: 20,
      run: async () => {
        runs += 1;
        return 'first';
      },
    });

    const second = scheduler.schedule({
      requestClass: 'typing',
      key: 'file:///tmp/coalesce.pike',
      coalesceMs: 20,
      run: async () => {
        runs += 1;
        return 'second';
      },
    });

    let firstError: unknown;
    try {
      await first;
      throw new Error('expected first coalesced request to reject');
    } catch (error) {
      firstError = error;
    }

    assert.equal(firstError instanceof RequestSupersededError, true);
    assert.equal((firstError as Error).message, 'Superseded request key=file:///tmp/coalesce.pike');
    assert.equal(await second, 'second');
    assert.equal(runs, 1);
  });

  it('prioritizes typing over background queued in grace window', async () => {
    const scheduler = new RequestScheduler({ maxConcurrent: 1 });
    const runOrder: string[] = [];

    const background = scheduler.schedule({
      requestClass: 'background',
      run: async () => {
        runOrder.push('background');
      },
    });

    const typing = scheduler.schedule({
      requestClass: 'typing',
      run: async () => {
        runOrder.push('typing');
      },
    });

    await Promise.all([background, typing]);
    assert.deepEqual(runOrder, ['typing', 'background']);
  });

  it('propagates run() promise rejection and records failure metrics', async () => {
    const scheduler = new RequestScheduler();
    const rejection = new Error('scheduler downstream rejection');

    const request = scheduler.schedule({
      requestClass: 'interactive',
      run: async () => Promise.reject(rejection),
    });

    let seenError: unknown;
    try {
      await request;
      throw new Error('expected scheduler to reject');
    } catch (error) {
      seenError = error;
    }

    assert.equal(seenError, rejection);
    const metrics = scheduler.snapshotMetrics();
    assert.equal(metrics.scheduled, 1);
    assert.equal(metrics.started, 1);
    assert.equal(metrics.completed, 0);
    assert.equal(metrics.failed, 1);
    assert.equal(metrics.canceled, 0);
  });

  it('logs processQueue scheduling failures instead of swallowing them silently (#871)', async () => {
    const logged: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const scheduler = new RequestScheduler({
      logger: {
        error: (message, meta) => {
          logged.push({ message, meta });
        },
      },
    });

    const internal = scheduler as unknown as {
      processQueue: () => Promise<void>;
    };
    internal.processQueue = async () => {
      throw new Error('forced processQueue failure');
    };

    void scheduler.schedule({
      requestClass: 'typing',
      run: async () => 'ok',
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(logged.length, 1);
    assert.equal(logged[0]?.message, 'Request scheduler internal async error');
    assert.equal(logged[0]?.meta?.location, 'schedule:processQueue');
    assert.equal(logged[0]?.meta?.error, 'forced processQueue failure');
  });
});

describe('Batch config-change validation (#2204)', () => {
  it('does not delay interactive requests during batch config-change validation', async () => {
    const scheduler = new RequestScheduler({ maxConcurrent: 2 });
    const order: string[] = [];
    let batchDocumentsValidated = 0;
    const totalDocuments = 50;

    const releaseGate: { fn?: () => void } = {};
    const gate = new Promise<void>(resolve => {
      releaseGate.fn = resolve;
    });

    // Schedule single batch background task that validates 50 documents sequentially
    const batchPromise = scheduler.schedule({
      requestClass: 'background',
      run: async checkpoint => {
        for (let i = 0; i < totalDocuments; i++) {
          checkpoint();
          // Simulate per-document validation work
          if (i === 10) {
            // Gate: wait for interactive request to arrive and prove it runs concurrently
            await gate;
          }
          batchDocumentsValidated += 1;
        }
        order.push('batch-complete');
      },
    });

    // Allow background to start
    await new Promise(resolve => setTimeout(resolve, 20));

    // Schedule interactive request while batch is running
    const interactiveStart = Date.now();
    const interactivePromise = scheduler.schedule({
      requestClass: 'interactive',
      run: async () => {
        order.push('interactive');
      },
    });

    await interactivePromise;
    const interactiveLatencyMs = Date.now() - interactiveStart;

    // Release the batch gate
    const release = releaseGate.fn;
    if (release) release();

    await batchPromise;

    // Interactive should complete while batch is still running (concurrent slot)
    assert.equal(order.includes('interactive'), true);
    assert.equal(order.indexOf('interactive') < order.indexOf('batch-complete'), true);
    // Interactive latency must be bounded (not blocked behind 50 background validations)
    assert.equal(interactiveLatencyMs < 100, true);
    assert.equal(batchDocumentsValidated, totalDocuments);
  });
});
