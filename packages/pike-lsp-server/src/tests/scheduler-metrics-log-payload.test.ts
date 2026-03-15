import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

import { toSchedulerMetricsLogPayload } from '../features/utils/scheduler-metrics.js';
import type { RequestSchedulerMetrics } from '../services/request-scheduler.js';

describe('scheduler metrics log payload', () => {
  it('normalizes live scheduler metrics into a stable log schema', () => {
    const metrics: RequestSchedulerMetrics = {
      scheduled: 12,
      started: 10,
      completed: 9,
      failed: 1,
      canceled: 2,
      maxConcurrent: 2,
      activeWorkers: 1,
      queueDepth: {
        typing: 3,
        interactive: 1,
        background: 2,
      },
      inFlightByClass: {
        typing: 1,
        interactive: 0,
        background: 0,
      },
      queueWaitMs: {
        typing: [1, 2],
        interactive: [3],
        background: [4],
      },
    };

    const payload = toSchedulerMetricsLogPayload(metrics);
    assert.deepEqual(payload, {
      maxConcurrent: 2,
      activeWorkers: 1,
      queueDepth: {
        typing: 3,
        interactive: 1,
        background: 2,
      },
      inFlightByClass: {
        typing: 1,
        interactive: 0,
        background: 0,
      },
      scheduled: 12,
      started: 10,
      completed: 9,
      failed: 1,
      canceled: 2,
    });
  });
});
