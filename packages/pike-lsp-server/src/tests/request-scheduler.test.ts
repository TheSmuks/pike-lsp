import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { RequestScheduler, RequestSupersededError } from '../services/request-scheduler.js';

describe('RequestScheduler', () => {
  it('runs queued classes in typing -> interactive -> background order', async () => {
    const scheduler = new RequestScheduler();
    const order: string[] = [];

    const releaseBackground: { fn?: () => void } = {};
    const backgroundBlock = new Promise<void>(resolve => {
      releaseBackground.fn = resolve;
    });

    const backgroundPromise = scheduler.schedule({
      requestClass: 'background',
      run: async () => {
        order.push('background-start');
        await backgroundBlock;
        order.push('background-end');
      },
    });

    const typingPromise = scheduler.schedule({
      requestClass: 'typing',
      run: async () => {
        order.push('typing');
      },
    });

    const interactivePromise = scheduler.schedule({
      requestClass: 'interactive',
      run: async () => {
        order.push('interactive');
      },
    });

    const releaseBackgroundFn = releaseBackground.fn;
    if (!releaseBackgroundFn) {
      throw new Error('background release hook missing');
    }
    releaseBackgroundFn();

    await Promise.all([backgroundPromise, typingPromise, interactivePromise]);
    assert.deepEqual(order, ['background-start', 'background-end', 'typing', 'interactive']);
  });

  it('coalesces keyed requests and rejects superseded entries', async () => {
    const scheduler = new RequestScheduler();
    let runs = 0;

    const first = scheduler.schedule({
      requestClass: 'typing',
      key: 'file:///tmp/test.pike',
      coalesceMs: 25,
      run: async () => {
        runs += 1;
      },
    });

    const second = scheduler.schedule({
      requestClass: 'typing',
      key: 'file:///tmp/test.pike',
      coalesceMs: 25,
      run: async () => {
        runs += 1;
      },
    });

    try {
      await first;
      throw new Error('expected superseded error for first coalesced request');
    } catch (err) {
      assert.equal(err instanceof RequestSupersededError, true);
    }
    await second;
    assert.equal(runs, 1);
  });

  it('cancels in-flight keyed request via checkpoint on supersede', async () => {
    const scheduler = new RequestScheduler();
    const releaseFirst: { fn?: () => void } = {};
    const waitForRelease = new Promise<void>(resolve => {
      releaseFirst.fn = resolve;
    });

    const first = scheduler.schedule({
      requestClass: 'typing',
      key: 'completion:file:///tmp/a.pike',
      run: async checkpoint => {
        await waitForRelease;
        checkpoint();
      },
    });

    const second = scheduler.schedule({
      requestClass: 'typing',
      key: 'completion:file:///tmp/a.pike',
      run: async () => {
        return;
      },
    });

    const releaseFirstFn = releaseFirst.fn;
    if (!releaseFirstFn) {
      throw new Error('release hook missing');
    }
    releaseFirstFn();

    try {
      await first;
      throw new Error('expected cancellation for superseded in-flight request');
    } catch (err) {
      assert.equal(err instanceof RequestSupersededError, true);
    }
    await second;
  });

  it('contains failing request and continues queue execution', async () => {
    const scheduler = new RequestScheduler();
    const ran: string[] = [];

    const fail = scheduler.schedule({
      requestClass: 'interactive',
      run: async () => {
        ran.push('fail');
        throw new Error('boom');
      },
    });

    const succeed = scheduler.schedule({
      requestClass: 'interactive',
      run: async () => {
        ran.push('succeed');
      },
    });

    try {
      await fail;
      throw new Error('expected failing request to throw');
    } catch (err) {
      assert.equal(err instanceof Error, true);
      if (err instanceof Error) {
        assert.equal(err.message, 'boom');
      }
    }
    await succeed;
    assert.deepEqual(ran, ['fail', 'succeed']);
  });

  it('coalesces reload-storm bursts into last request only', async () => {
    const scheduler = new RequestScheduler();
    let executions = 0;

    const requests: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      requests.push(
        scheduler.schedule({
          requestClass: 'background',
          key: 'config:workspace',
          coalesceMs: 10,
          run: async () => {
            executions += 1;
          },
        })
      );
    }

    let superseded = 0;
    for (const request of requests) {
      try {
        await request;
      } catch (err) {
        if (err instanceof RequestSupersededError) {
          superseded += 1;
          continue;
        }
        throw err;
      }
    }

    assert.equal(executions, 1);
    assert.equal(superseded, 99);
  });

  it('reports observability-complete scheduler metrics after mixed outcomes', async () => {
    const scheduler = new RequestScheduler();

    const ok = scheduler.schedule({
      requestClass: 'interactive',
      run: async () => {
        return;
      },
    });

    const fail = scheduler.schedule({
      requestClass: 'background',
      run: async () => {
        throw new Error('expected failure');
      },
    });

    const firstCoalesced = scheduler.schedule({
      requestClass: 'typing',
      key: 'obs:file:///tmp/obs.pike',
      coalesceMs: 5,
      run: async () => {
        return;
      },
    });

    const secondCoalesced = scheduler.schedule({
      requestClass: 'typing',
      key: 'obs:file:///tmp/obs.pike',
      coalesceMs: 5,
      run: async () => {
        return;
      },
    });

    await ok;
    try {
      await fail;
    } catch {}
    try {
      await firstCoalesced;
    } catch {}
    await secondCoalesced;

    const metrics = scheduler.snapshotMetrics();
    assert.equal(typeof metrics.scheduled, 'number');
    assert.equal(typeof metrics.started, 'number');
    assert.equal(typeof metrics.completed, 'number');
    assert.equal(typeof metrics.failed, 'number');
    assert.equal(typeof metrics.canceled, 'number');
    assert.equal(Array.isArray(metrics.queueWaitMs.typing), true);
    assert.equal(Array.isArray(metrics.queueWaitMs.interactive), true);
    assert.equal(Array.isArray(metrics.queueWaitMs.background), true);
    assert.equal(metrics.failed >= 1, true);
    assert.equal(metrics.canceled >= 1, true);
  });

  it('keeps cancel-stop latency within budget for superseded keyed requests', async () => {
    const scheduler = new RequestScheduler();

    const start = Date.now();
    const first = scheduler.schedule({
      requestClass: 'typing',
      key: 'lat:file:///tmp/latency.pike',
      coalesceMs: 1,
      run: async () => {
        return;
      },
    });

    const second = scheduler.schedule({
      requestClass: 'typing',
      key: 'lat:file:///tmp/latency.pike',
      coalesceMs: 1,
      run: async () => {
        return;
      },
    });

    let cancelSeenAt = -1;
    try {
      await first;
    } catch (err) {
      if (err instanceof RequestSupersededError) {
        cancelSeenAt = Date.now();
      } else {
        throw err;
      }
    }

    await second;
    assert.equal(cancelSeenAt > 0, true);
    assert.equal(cancelSeenAt - start < 100, true);
  });
});
