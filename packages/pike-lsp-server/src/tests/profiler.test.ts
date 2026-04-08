/**
 * Unit tests for the Profiler service
 *
 * Tests timing accumulation, report generation, and edge cases.
 */

import { describe, it, beforeEach } from 'bun:test';
import * as assert from 'node:assert/strict';
import { Profiler, globalProfiler } from '../services/profiler.js';

describe('Profiler', () => {
  let profiler: Profiler;

  beforeEach(() => {
    profiler = new Profiler();
  });

  describe('basic timing', () => {
    it('should record a single timing', () => {
      profiler.start('test-op');
      const duration = profiler.end('test-op');

      assert.ok(duration >= 0, 'Duration should be non-negative');

      const accumulated = profiler.getAccumulated('test-op');
      assert.ok(accumulated, 'Should have accumulated data');
      assert.strictEqual(accumulated!.label, 'test-op');
      assert.strictEqual(accumulated!.count, 1);
      assert.ok(accumulated!.totalMs >= 0, 'Total should be non-negative');
    });

    it('should accumulate multiple timings for the same label', async () => {
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        profiler.start('repeated-op');
        // Small delay to ensure measurable duration
        await new Promise(r => setTimeout(r, 1));
        profiler.end('repeated-op');
      }

      const accumulated = profiler.getAccumulated('repeated-op');
      assert.ok(accumulated, 'Should have accumulated data');
      assert.strictEqual(accumulated!.count, iterations);
      assert.ok(accumulated!.totalMs > 0, 'Total should be positive');
      assert.ok(accumulated!.avgMs > 0, 'Average should be positive');
    });

    it('should track different labels independently', async () => {
      profiler.start('op-a');
      await new Promise(r => setTimeout(r, 2));
      profiler.end('op-a');

      profiler.start('op-b');
      await new Promise(r => setTimeout(r, 1));
      profiler.end('op-b');

      const dataA = profiler.getAccumulated('op-a');
      const dataB = profiler.getAccumulated('op-b');

      assert.ok(dataA, 'Should have data for op-a');
      assert.ok(dataB, 'Should have data for op-b');
      assert.strictEqual(dataA!.count, 1);
      assert.strictEqual(dataB!.count, 1);
      // op-a should take longer than op-b
      assert.ok(dataA!.totalMs > dataB!.totalMs, 'op-a should take longer than op-b');
    });
  });

  describe('timing accuracy', () => {
    it('should measure elapsed time for active timer', async () => {
      profiler.start('active-op');

      // Get elapsed before ending
      const elapsed1 = profiler.getElapsedMs('active-op');
      await new Promise(r => setTimeout(r, 5));
      const elapsed2 = profiler.getElapsedMs('active-op');

      profiler.end('active-op');

      assert.ok(elapsed1 !== undefined, 'Should get elapsed time');
      assert.ok(elapsed2 !== undefined, 'Should get elapsed time after delay');
      assert.ok(elapsed2! > elapsed1!, 'Elapsed should increase over time');
    });

    it('should return undefined for non-existent active timer', () => {
      const elapsed = profiler.getElapsedMs('non-existent');
      assert.strictEqual(elapsed, undefined);
    });

    it('should calculate correct min/max/avg', async () => {
      // First timing: ~5ms
      profiler.start('stats-op');
      await new Promise(r => setTimeout(r, 5));
      profiler.end('stats-op');

      // Second timing: ~10ms
      profiler.start('stats-op');
      await new Promise(r => setTimeout(r, 10));
      profiler.end('stats-op');

      // Third timing: ~1ms
      profiler.start('stats-op');
      await new Promise(r => setTimeout(r, 1));
      profiler.end('stats-op');

      const data = profiler.getAccumulated('stats-op');
      assert.ok(data, 'Should have data');
      assert.strictEqual(data!.count, 3);

      // Min should be ~1ms, max ~10ms
      assert.ok(data!.minMs < data!.avgMs, 'Min should be less than avg');
      assert.ok(data!.maxMs > data!.avgMs, 'Max should be greater than avg');
      assert.ok(data!.minMs <= data!.maxMs, 'Min should be <= max');
    });
  });

  describe('error handling', () => {
    it('should throw when ending untracked label', () => {
      assert.throws(() => profiler.end('never-started'), /untracked label/);
    });

    it('should throw when ending already-ended label', () => {
      profiler.start('once');
      profiler.end('once');

      assert.throws(() => profiler.end('once'), /untracked label/);
    });
  });

  describe('isActive', () => {
    it('should return true for active timer', () => {
      profiler.start('active');
      assert.strictEqual(profiler.isActive('active'), true);
      profiler.end('active');
    });

    it('should return false for ended timer', () => {
      profiler.start('ended');
      profiler.end('ended');
      assert.strictEqual(profiler.isActive('ended'), false);
    });

    it('should return false for never-started timer', () => {
      assert.strictEqual(profiler.isActive('never'), false);
    });
  });

  describe('clear operations', () => {
    it('should clear all data with clear()', () => {
      profiler.start('op1');
      profiler.end('op1');
      profiler.start('op2');
      // Leave op2 active

      profiler.clear();

      assert.strictEqual(profiler.getAccumulated('op1'), undefined);
      assert.strictEqual(profiler.isActive('op2'), false);
    });

    it('should clear only accumulated with clearAccumulated()', () => {
      profiler.start('op1');
      profiler.end('op1');
      profiler.start('op2');

      profiler.clearAccumulated();

      assert.strictEqual(profiler.getAccumulated('op1'), undefined);
      assert.strictEqual(profiler.isActive('op2'), true);
    });

    it('should clear only active with clearActive()', () => {
      profiler.start('op1');
      profiler.end('op1');
      profiler.start('op2');

      profiler.clearActive();

      assert.ok(profiler.getAccumulated('op1'), 'Accumulated should remain');
      assert.strictEqual(profiler.isActive('op2'), false);
    });
  });

  describe('report generation', () => {
    it('should generate empty report when no timings', () => {
      const report = profiler.report();

      assert.deepStrictEqual(report.timings, []);
      assert.strictEqual(report.totalOperations, 0);
      assert.strictEqual(report.totalDurationMs, 0);
      assert.strictEqual(report.slowestOperation, null);
    });

    it('should sort timings by total duration descending', async () => {
      // Create timings with different durations
      profiler.start('short');
      await new Promise(r => setTimeout(r, 1));
      profiler.end('short');

      profiler.start('long');
      await new Promise(r => setTimeout(r, 10));
      profiler.end('long');

      profiler.start('medium');
      await new Promise(r => setTimeout(r, 5));
      profiler.end('medium');

      const report = profiler.report();

      assert.strictEqual(report.timings.length, 3);
      assert.strictEqual(report.timings[0].label, 'long');
      assert.strictEqual(report.timings[1].label, 'medium');
      assert.strictEqual(report.timings[2].label, 'short');
    });

    it('should identify slowest operation by max duration', async () => {
      profiler.start('consistent');
      await new Promise(r => setTimeout(r, 5));
      profiler.end('consistent');
      profiler.start('consistent');
      await new Promise(r => setTimeout(r, 5));
      profiler.end('consistent');

      profiler.start('spiky');
      await new Promise(r => setTimeout(r, 1));
      profiler.end('spiky');
      profiler.start('spiky');
      await new Promise(r => setTimeout(r, 20));
      profiler.end('spiky');

      const report = profiler.report();

      assert.ok(report.slowestOperation, 'Should identify slowest operation');
      assert.strictEqual(report.slowestOperation!.label, 'spiky');
      assert.ok(report.slowestOperation!.maxMs >= 20, 'Max should be the spike');
    });

    it('should calculate total operations and duration', async () => {
      profiler.start('a');
      await new Promise(r => setTimeout(r, 5));
      profiler.end('a');

      profiler.start('a');
      await new Promise(r => setTimeout(r, 5));
      profiler.end('a');

      profiler.start('b');
      await new Promise(r => setTimeout(r, 5));
      profiler.end('b');

      const report = profiler.report();

      assert.strictEqual(report.totalOperations, 3);
      assert.ok(report.totalDurationMs >= 15, 'Total should be sum of all');
    });
  });

  describe('formatReport', () => {
    it('should format empty report', () => {
      const formatted = profiler.formatReport();
      assert.ok(formatted.includes('No timings recorded'));
    });

    it('should format report with timings', async () => {
      profiler.start('test-operation');
      await new Promise(r => setTimeout(r, 5));
      profiler.end('test-operation');

      const formatted = profiler.formatReport();

      assert.ok(formatted.includes('PROFILER REPORT'));
      assert.ok(formatted.includes('test-operation'));
      assert.ok(formatted.includes('Count:'));
      assert.ok(formatted.includes('Total:'));
      assert.ok(formatted.includes('Avg:'));
      assert.ok(formatted.includes('Min:'));
      assert.ok(formatted.includes('Max:'));
    });
  });

  describe('nested/recursive operations', () => {
    it('should handle operations with same label in sequence', async () => {
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        profiler.start('seq');
        await new Promise(r => setTimeout(r, 1));
        profiler.end('seq');
      }

      const data = profiler.getAccumulated('seq');
      assert.ok(data, 'Should have data');
      assert.strictEqual(data!.count, iterations);
      assert.strictEqual(data!.entries.length, iterations);
    });

    it('should maintain separate entries array', async () => {
      profiler.start('tracked');
      await new Promise(r => setTimeout(r, 2));
      const dur1 = profiler.end('tracked');

      profiler.start('tracked');
      await new Promise(r => setTimeout(r, 3));
      const dur2 = profiler.end('tracked');

      const data = profiler.getAccumulated('tracked');
      assert.ok(data, 'Should have data');
      assert.strictEqual(data!.entries.length, 2);

      // Check timestamps are different
      assert.ok(
        data!.entries[0].timestamp <= data!.entries[1].timestamp,
        'Timestamps should be ordered'
      );

      // Check durations match
      assert.ok(
        Math.abs(data!.entries[0].durationMs - dur1) < 1,
        'First entry duration should match'
      );
      assert.ok(
        Math.abs(data!.entries[1].durationMs - dur2) < 1,
        'Second entry duration should match'
      );
    });
  });
});

describe('globalProfiler', () => {
  it('should be an instance of Profiler', () => {
    // Verify globalProfiler is a Profiler instance
    assert.ok(globalProfiler instanceof Profiler, 'globalProfiler should be a Profiler instance');
  });

  it('should maintain independent state from new instances', () => {
    const localProfiler = new Profiler();

    globalProfiler.start('global-test');
    localProfiler.start('local-test');

    globalProfiler.end('global-test');
    localProfiler.end('local-test');

    // Global should only have global-test
    const globalData = globalProfiler.getAccumulated('global-test');
    const globalLocalData = globalProfiler.getAccumulated('local-test');

    assert.ok(globalData, 'Global should have global-test');
    assert.strictEqual(globalLocalData, undefined, 'Global should not have local-test');

    // Local should only have local-test
    const localGlobalData = localProfiler.getAccumulated('global-test');
    const localData = localProfiler.getAccumulated('local-test');

    assert.strictEqual(localGlobalData, undefined, 'Local should not have global-test');
    assert.ok(localData, 'Local should have local-test');
  });
});
