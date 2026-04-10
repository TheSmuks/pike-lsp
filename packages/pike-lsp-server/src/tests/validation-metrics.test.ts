import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { ValidationCycleTracker } from '../features/diagnostics/validation-metrics.js';
import { createMockLogger } from './helpers/test-helpers.js';

describe('ValidationCycleTracker', () => {
  it('should start with all-zero snapshot', () => {
    const log = createMockLogger();
    const tracker = new ValidationCycleTracker(log);

    const snap = tracker.snapshot();
    assert.strictEqual(snap.cycles, 0);
    assert.strictEqual(snap.totalMs, 0);
    assert.strictEqual(snap.cacheHits, 0);
    assert.strictEqual(snap.blocked, 0);
    assert.strictEqual(snap.avgMs, 0);
    assert.strictEqual(snap.cacheHitRate, 0);
  });

  it('should accumulate successful cycle metrics', () => {
    const log = createMockLogger();
    const tracker = new ValidationCycleTracker(log);

    tracker.record({ totalMs: 100, cacheHit: true, blocked: false });
    tracker.record({ totalMs: 200, cacheHit: false, blocked: false });

    const snap = tracker.snapshot();
    assert.strictEqual(snap.cycles, 2);
    assert.strictEqual(snap.totalMs, 300);
    assert.strictEqual(snap.cacheHits, 1);
    assert.strictEqual(snap.blocked, 0);
    assert.strictEqual(snap.avgMs, 150);
    assert.strictEqual(snap.cacheHitRate, 0.5);
  });

  it('should track blocked (superseded) cycles', () => {
    const log = createMockLogger();
    const tracker = new ValidationCycleTracker(log);

    tracker.record({ totalMs: 50, cacheHit: false, blocked: true });
    tracker.record({ totalMs: 100, cacheHit: true, blocked: false });

    const snap = tracker.snapshot();
    assert.strictEqual(snap.cycles, 2);
    assert.strictEqual(snap.blocked, 1);
    assert.strictEqual(snap.cacheHits, 1);
  });

  it('should reset all counters', () => {
    const log = createMockLogger();
    const tracker = new ValidationCycleTracker(log);

    tracker.record({ totalMs: 100, cacheHit: true, blocked: false });
    tracker.record({ totalMs: 50, cacheHit: false, blocked: true });
    tracker.reset();

    const snap = tracker.snapshot();
    assert.strictEqual(snap.cycles, 0);
    assert.strictEqual(snap.totalMs, 0);
    assert.strictEqual(snap.cacheHits, 0);
    assert.strictEqual(snap.blocked, 0);
  });

  it('should compute avgMs and cacheHitRate correctly with many cycles', () => {
    const log = createMockLogger();
    const tracker = new ValidationCycleTracker(log);

    // Record 10 cycles: 7 cache hits, 3 misses, 2 blocked
    for (let i = 0; i < 7; i++) {
      tracker.record({ totalMs: 10, cacheHit: true, blocked: false });
    }
    for (let i = 0; i < 3; i++) {
      tracker.record({ totalMs: 20, cacheHit: false, blocked: i < 2 });
    }

    const snap = tracker.snapshot();
    assert.strictEqual(snap.cycles, 10);
    assert.strictEqual(snap.totalMs, 130); // 7*10 + 3*20
    assert.strictEqual(snap.cacheHits, 7);
    assert.strictEqual(snap.blocked, 2);
    assert.strictEqual(snap.avgMs, 13); // Math.round(130/10)
    assert.strictEqual(snap.cacheHitRate, 0.7);
  });

  it('should log summary every 50 cycles', () => {
    const log = createMockLogger({ captureInfos: true });
    const tracker = new ValidationCycleTracker(log);

    // Record 49 cycles — no summary log yet
    for (let i = 0; i < 49; i++) {
      tracker.record({ totalMs: 10, cacheHit: false, blocked: false });
    }
    assert.strictEqual(log.infos!.length, 0);

    // 50th cycle triggers summary
    tracker.record({ totalMs: 10, cacheHit: true, blocked: false });
    assert.strictEqual(log.infos!.length, 1);

    // 100th cycle triggers another summary
    for (let i = 0; i < 49; i++) {
      tracker.record({ totalMs: 10, cacheHit: false, blocked: false });
    }
    tracker.record({ totalMs: 10, cacheHit: true, blocked: false });
    assert.strictEqual(log.infos!.length, 2);
  });

  it('should not report NaN for avgMs when cycles is zero after reset', () => {
    const log = createMockLogger();
    const tracker = new ValidationCycleTracker(log);

    tracker.record({ totalMs: 100, cacheHit: true, blocked: false });
    tracker.reset();

    const snap = tracker.snapshot();
    assert.strictEqual(snap.avgMs, 0);
    assert.strictEqual(snap.cacheHitRate, 0);
    assert.ok(!Number.isNaN(snap.avgMs));
    assert.ok(!Number.isNaN(snap.cacheHitRate));
  });
});
