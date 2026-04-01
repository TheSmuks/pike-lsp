// @ts-ignore - Bun test types
import { describe, it, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { BridgePool } from './bridge-pool.js';

const pikeReady = spawnSync('pike', ['--version']).status === 0;
const describeIfPike = pikeReady ? describe : describe.skip;

describeIfPike('BridgePool', () => {
  let pool: BridgePool;

  afterAll(async () => {
    if (pool) {
      await pool.stop();
    }
  });

  it('should create and start N bridges', async () => {
    pool = new BridgePool({ timeout: 10_000 }, { concurrency: 2 });
    assert.equal(pool.size, 2);
    assert.equal(pool.isRunning, false);

    await pool.start();
    assert.equal(pool.isRunning, true);
  });

  it('should dispatch work items across bridges', async () => {
    const items = ['a', 'b', 'c', 'd'];
    const results: Array<{ item: string; bridgeRunning: boolean }> = [];

    await pool.dispatch(items, async (item, bridge) => {
      results.push({ item, bridgeRunning: bridge.isRunning() });
    });

    assert.equal(results.length, 4);
    for (const r of results) {
      assert.ok(r.bridgeRunning, `Bridge should be running for item "${r.item}"`);
    }
  });

  it('should stop all bridges gracefully', async () => {
    const localPool = new BridgePool({ timeout: 10_000 }, { concurrency: 3 });
    await localPool.start();
    assert.equal(localPool.isRunning, true);

    await localPool.stop();
    assert.equal(localPool.isRunning, false);
  });

  it('should handle errors in work items without hanging', async () => {
    const localPool = new BridgePool({ timeout: 10_000 }, { concurrency: 2 });
    await localPool.start();

    try {
      await localPool.dispatch(['ok', 'fail', 'ok'], async item => {
        if (item === 'fail') throw new Error('intentional test error');
      });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('intentional test error'));
    } finally {
      await localPool.stop();
    }
  });

  it('should respect concurrency limit', async () => {
    const concurrency = 2;
    const localPool = new BridgePool({ timeout: 10_000 }, { concurrency });
    await localPool.start();

    let maxConcurrent = 0;
    let currentConcurrent = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await localPool.dispatch(items, async () => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) {
        maxConcurrent = currentConcurrent;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
      currentConcurrent--;
    });

    assert.ok(
      maxConcurrent <= concurrency,
      `Max concurrent ${maxConcurrent} exceeded pool size ${concurrency}`
    );
    assert.ok(maxConcurrent >= 1, 'At least one item should run concurrently');

    await localPool.stop();
  });

  it('should report progress via callback', async () => {
    const progressCalls: Array<{ completed: number; total: number }> = [];

    const localPool = new BridgePool(
      { timeout: 10_000 },
      { concurrency: 2, onProgress: (c, t) => progressCalls.push({ completed: c, total: t }) }
    );
    await localPool.start();

    await localPool.dispatch(['x', 'y', 'z'], async () => {});

    assert.equal(progressCalls.length, 3);
    assert.deepEqual(progressCalls[0], { completed: 1, total: 3 });
    assert.deepEqual(progressCalls[2], { completed: 3, total: 3 });

    await localPool.stop();
  });
});

describe('BridgePool (unit)', () => {
  it('should default concurrency to 4', () => {
    const pool = new BridgePool();
    assert.equal(pool.size, 4);
  });

  it('should throw when dispatching without start', async () => {
    const pool = new BridgePool({}, { concurrency: 1 });
    await assert.rejects(() => pool.dispatch(['a'], async () => {}), /BridgePool not started/);
  });

  it('should handle empty work items', async () => {
    const pool = new BridgePool({}, { concurrency: 1 });
    await pool.dispatch([], async () => {});
  });
});
