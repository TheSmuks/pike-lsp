/**
 * Slow Integration Test: Diagnostics Don't Block Typing
 *
 * RA-inspired latency guard test. Validates that background diagnostics
 * (compilation, validation) do not block or delay interactive typing requests.
 *
 * This is the direct counterpart to rust-analyzer's `diagnostics_dont_block_typing` test.
 * If background work is not properly scheduled, typing latency will spike, causing
 * a poor editor experience.
 *
 * Part of Risk R-003 mitigation.
 *
 * Run with: bun run test:slow
 */

import { describe, it, expect } from 'bun:test';
import { RequestScheduler } from '../../services/request-scheduler.js';

/**
 * Simulates a typing request (e.g., onKeypress completion/hover).
 * These must be fast — the user is waiting.
 * Returns the wall-clock latency in ms from request to completion.
 */
function simulateTypingRequest(scheduler: RequestScheduler, id: number): Promise<number> {
  const start = performance.now();
  return scheduler
    .schedule({
      requestClass: 'typing',
      key: `file:///typing-${id}.pike`,
      coalesceMs: 0,
      run: async () => {
        // Simulate minimal work (e.g., looking up a completion)
      },
    })
    .then(() => performance.now() - start);
}

/**
 * Simulates a background diagnostics run (e.g., full project compilation).
 * These are heavy but should not block typing.
 */
function simulateBackgroundDiagnostics(
  scheduler: RequestScheduler,
  durationMs: number,
): Promise<void> {
  return scheduler.schedule({
    requestClass: 'background',
    run: async () => {
      // Simulate heavy work
      await new Promise(resolve => setTimeout(resolve, durationMs));
    },
  });
}

describe('Slow Integration: Diagnostics Latency Guard', { timeout: 30_000 }, () => {
  describe('Background diagnostics should not block typing requests', () => {
    it('typing latency stays under budget even with heavy background work', async () => {
      const scheduler = new RequestScheduler();

      // Start several background diagnostics jobs (simulating full project compilation)
      const backgroundJobs = [
        simulateBackgroundDiagnostics(scheduler, 500),
        simulateBackgroundDiagnostics(scheduler, 300),
        simulateBackgroundDiagnostics(scheduler, 400),
      ];

      // Give background jobs a moment to start
      await new Promise(resolve => setTimeout(resolve, 20));

      // Now issue a typing request — it should be serviced quickly
      const typingLatency = await simulateTypingRequest(scheduler, 1);

      // Typing should complete in under 500ms despite background work
      // (generous budget for CI; the point is typing is NOT blocked by background)
      expect(typingLatency).toBeLessThan(500);

      await Promise.all(backgroundJobs);
    });

    it('multiple rapid typing requests are all served within budget', async () => {
      const scheduler = new RequestScheduler();

      // Start background work
      const bg = simulateBackgroundDiagnostics(scheduler, 800);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Issue 10 rapid typing requests
      const typingPromises: Promise<number>[] = [];
      for (let i = 0; i < 10; i++) {
        typingPromises.push(simulateTypingRequest(scheduler, i));
      }

      const latencies = await Promise.all(typingPromises);

      // All typing requests should complete in reasonable time
      for (const latency of latencies) {
        expect(latency).toBeLessThan(500);
      }

      // Average should be well under the budget
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(200);

      await bg;
    });
  });

  describe('Request scheduler prioritization under load', () => {
    it('typing class is always serviced before background', async () => {
      const scheduler = new RequestScheduler();
      const order: string[] = [];

      // Schedule background first
      const bgPromise = scheduler.schedule({
        requestClass: 'background',
        run: async () => {
          order.push('background-start');
          await new Promise(r => setTimeout(r, 100));
          order.push('background-end');
        },
      });

      // Then schedule typing — should run first
      const typingPromise = scheduler.schedule({
        requestClass: 'typing',
        run: async () => {
          order.push('typing');
        },
      });

      await Promise.all([bgPromise, typingPromise]);

      // Typing should execute before background completes
      const typingIdx = order.indexOf('typing');
      const bgEndIdx = order.indexOf('background-end');
      expect(typingIdx).toBeLessThan(bgEndIdx);
    });

    it('interactive requests are served between typing and background', async () => {
      const scheduler = new RequestScheduler();
      const order: string[] = [];

      const bgPromise = scheduler.schedule({
        requestClass: 'background',
        run: async () => {
          order.push('background');
        },
      });

      const interactivePromise = scheduler.schedule({
        requestClass: 'interactive',
        run: async () => {
          order.push('interactive');
        },
      });

      const typingPromise = scheduler.schedule({
        requestClass: 'typing',
        run: async () => {
          order.push('typing');
        },
      });

      await Promise.all([bgPromise, interactivePromise, typingPromise]);

      // Verify priority ordering: typing first, then interactive, then background
      const typingIdx = order.indexOf('typing');
      const interactiveIdx = order.indexOf('interactive');
      const bgIdx = order.indexOf('background');

      expect(typingIdx).toBeLessThan(interactiveIdx);
      expect(interactiveIdx).toBeLessThan(bgIdx);
    });
  });

  describe('Sustained load scenario', () => {
    it('typing latency remains stable over 100 requests with concurrent diagnostics', async () => {
      const scheduler = new RequestScheduler();
      const latencies: number[] = [];

      // Continuously schedule background work
      const bgJobs: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        bgJobs.push(
          scheduler.schedule({
            requestClass: 'background',
            run: async () => {
              await new Promise(r => setTimeout(r, 50));
            },
          }),
        );
      }

      // Issue typing requests concurrently
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await scheduler.schedule({
          requestClass: 'typing',
          key: `file:///stress-${i % 10}.pike`,
          coalesceMs: 0,
          run: async () => {
            latencies.push(performance.now() - start);
          },
        });
      }

      await Promise.all(bgJobs);

      // No single request should take more than 500ms
      const maxLatency = Math.max(...latencies);
      expect(maxLatency).toBeLessThan(500);

      // 95th percentile should be under 200ms
      const sorted = [...latencies].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      expect(p95).toBeLessThan(200);
    });
  });
});
