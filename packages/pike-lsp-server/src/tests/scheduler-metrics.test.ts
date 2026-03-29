import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { toSchedulerMetricsLogPayload } from '../features/utils/scheduler-metrics.js';
import type { RequestSchedulerMetrics } from '../services/request-scheduler.js';

describe('toSchedulerMetricsLogPayload', () => {
  const baseMetrics: RequestSchedulerMetrics = {
    scheduled: 10,
    started: 8,
    completed: 5,
    failed: 1,
    canceled: 2,
    maxConcurrent: 3,
    activeWorkers: 2,
    queueDepth: {
      typing: 1,
      interactive: 2,
      background: 3,
    },
    inFlightByClass: {
      typing: 1,
      interactive: 1,
      background: 0,
    },
    queueWaitMs: {
      typing: [10, 20],
      interactive: [30, 40, 50],
      background: [],
    },
  };

  it('should pass through all basic fields correctly', () => {
    const result = toSchedulerMetricsLogPayload(baseMetrics);

    assert.strictEqual(result.maxConcurrent, 3);
    assert.strictEqual(result.activeWorkers, 2);
    assert.strictEqual(result.scheduled, 10);
    assert.strictEqual(result.started, 8);
    assert.strictEqual(result.completed, 5);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.canceled, 2);
  });

  it('should include nested queueDepth object', () => {
    const result = toSchedulerMetricsLogPayload(baseMetrics);

    assert.deepStrictEqual(result.queueDepth, {
      typing: 1,
      interactive: 2,
      background: 3,
    });
  });

  it('should include nested inFlightByClass object', () => {
    const result = toSchedulerMetricsLogPayload(baseMetrics);

    assert.deepStrictEqual(result.inFlightByClass, {
      typing: 1,
      interactive: 1,
      background: 0,
    });
  });

  it('should handle zero values', () => {
    const zeroMetrics: RequestSchedulerMetrics = {
      scheduled: 0,
      started: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
      maxConcurrent: 0,
      activeWorkers: 0,
      queueDepth: {
        typing: 0,
        interactive: 0,
        background: 0,
      },
      inFlightByClass: {
        typing: 0,
        interactive: 0,
        background: 0,
      },
      queueWaitMs: {
        typing: [],
        interactive: [],
        background: [],
      },
    };

    const result = toSchedulerMetricsLogPayload(zeroMetrics);

    assert.strictEqual(result.scheduled, 0);
    assert.strictEqual(result.maxConcurrent, 0);
    assert.deepStrictEqual(result.queueDepth, {
      typing: 0,
      interactive: 0,
      background: 0,
    });
    assert.deepStrictEqual(result.inFlightByClass, {
      typing: 0,
      interactive: 0,
      background: 0,
    });
  });

  it('should handle empty arrays in queueWaitMs', () => {
    const emptyArraysMetrics: RequestSchedulerMetrics = {
      scheduled: 0,
      started: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
      maxConcurrent: 0,
      activeWorkers: 0,
      queueDepth: {
        typing: 0,
        interactive: 0,
        background: 0,
      },
      inFlightByClass: {
        typing: 0,
        interactive: 0,
        background: 0,
      },
      queueWaitMs: {
        typing: [],
        interactive: [],
        background: [],
      },
    };

    const result = toSchedulerMetricsLogPayload(emptyArraysMetrics);

    assert.deepStrictEqual(result.queueDepth, {
      typing: 0,
      interactive: 0,
      background: 0,
    });
  });

  it('should handle all fields populated', () => {
    const populatedMetrics: RequestSchedulerMetrics = {
      scheduled: 100,
      started: 90,
      completed: 80,
      failed: 5,
      canceled: 5,
      maxConcurrent: 10,
      activeWorkers: 8,
      queueDepth: {
        typing: 5,
        interactive: 10,
        background: 20,
      },
      inFlightByClass: {
        typing: 3,
        interactive: 4,
        background: 1,
      },
      queueWaitMs: {
        typing: [1, 2, 3, 4, 5],
        interactive: [10, 20, 30],
        background: [100, 200],
      },
    };

    const result = toSchedulerMetricsLogPayload(populatedMetrics);

    assert.strictEqual(result.scheduled, 100);
    assert.strictEqual(result.started, 90);
    assert.strictEqual(result.completed, 80);
    assert.strictEqual(result.failed, 5);
    assert.strictEqual(result.canceled, 5);
    assert.strictEqual(result.maxConcurrent, 10);
    assert.strictEqual(result.activeWorkers, 8);
    assert.deepStrictEqual(result.queueDepth, {
      typing: 5,
      interactive: 10,
      background: 20,
    });
    assert.deepStrictEqual(result.inFlightByClass, {
      typing: 3,
      interactive: 4,
      background: 1,
    });
  });

  it('should return a Record with all expected keys', () => {
    const result = toSchedulerMetricsLogPayload(baseMetrics);
    const keys = Object.keys(result).sort();

    assert.deepStrictEqual(keys, [
      'activeWorkers',
      'canceled',
      'completed',
      'failed',
      'inFlightByClass',
      'maxConcurrent',
      'queueDepth',
      'scheduled',
      'started',
    ]);
  });
});
