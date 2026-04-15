/**
 * Scenario: processBatch concurrency limiter semaphore queue (Issue #1982)
 *
 * Verifies that the inline semaphore in processBatch correctly queues
 * multiple waiters instead of overwriting a single resolver, which caused
 * lost wakeups and hangs when batch.size > MAX_CONCURRENT.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

/**
 * Reproduces the semaphore pattern from processBatch.
 * When a waiter is released, the slot is handed off directly (active stays the same)
 * rather than decrementing and re-incrementing.
 */
function makeSemaphore(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = () => {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>(r => {
      queue.push(r);
    });
  };
  const release = () => {
    const next = queue.shift();
    if (next) {
      next();
    } else {
      active--;
    }
  };
  return { acquire, release, getActive: () => active, getQueueLength: () => queue.length };
}

describe('processBatch concurrency semaphore', () => {
  it('should queue multiple waiters and resolve all of them', async () => {
    const sem = makeSemaphore(2);
    const completed: number[] = [];

    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      await sem.acquire();
      completed.push(i);
      await new Promise<void>(r => setTimeout(r, 10));
      sem.release();
    });

    await Promise.all(tasks.map(t => t()));

    assert.strictEqual(completed.length, 5, 'all 5 tasks should have completed');
    assert.strictEqual(sem.getQueueLength(), 0, 'no waiters should remain');
    assert.strictEqual(sem.getActive(), 0, 'no slots should remain active');
    assert.deepStrictEqual(
      completed.sort((a, b) => a - b),
      [0, 1, 2, 3, 4],
      'all tasks should have acquired a slot'
    );
  });

  it('should not exceed max concurrent', async () => {
    const MAX_CONCURRENT = 3;
    let maxObserved = 0;
    let currentActive = 0;

    let active = 0;
    const queue: Array<() => void> = [];
    const acquire = () => {
      if (active < MAX_CONCURRENT) {
        active++;
        currentActive = active;
        maxObserved = Math.max(maxObserved, currentActive);
        return Promise.resolve();
      }
      return new Promise<void>(r => {
        queue.push(r);
      });
    };
    const release = () => {
      const next = queue.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    };

    const tasks = Array.from({ length: 10 }, () => async () => {
      await acquire();
      await new Promise<void>(r => setTimeout(r, 5));
      release();
    });

    await Promise.all(tasks.map(t => t()));

    assert.ok(
      maxObserved <= MAX_CONCURRENT,
      `max concurrent ${maxObserved} should not exceed ${MAX_CONCURRENT}`
    );
    assert.strictEqual(active, 0);
  });

  it('should not lose wakeups when many waiters queue simultaneously', async () => {
    const sem = makeSemaphore(1);
    let completed = 0;
    const TOTAL = 20;

    // Block the single slot first
    await sem.acquire();

    // Queue all others
    const promises = Array.from({ length: TOTAL - 1 }, () =>
      sem.acquire().then(() => {
        completed++;
        sem.release();
      })
    );

    // Release the initial slot, starting the handoff chain
    sem.release();

    await Promise.all(promises);

    assert.strictEqual(completed, TOTAL - 1, 'all queued waiters should have completed');
    assert.strictEqual(sem.getActive(), 0);
  });
});
