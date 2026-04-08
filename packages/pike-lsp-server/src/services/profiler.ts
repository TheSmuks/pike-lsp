/**
 * Lightweight Performance Profiler
 *
 * A simple profiler for tracking performance metrics across LSP operations.
 * Provides start/end timing, accumulated storage, and reporting capabilities.
 *
 * Usage:
 *   profiler.start('operation-name');
 *   // ... do work ...
 *   profiler.end('operation-name');
 *   // ... later ...
 *   const report = profiler.report();
 */

export interface TimingEntry {
  label: string;
  durationMs: number;
  timestamp: number;
}

export interface AccumulatedTiming {
  label: string;
  totalMs: number;
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  entries: TimingEntry[];
}

export interface ProfilerReport {
  timings: AccumulatedTiming[];
  totalOperations: number;
  totalDurationMs: number;
  slowestOperation: AccumulatedTiming | null;
}

export class Profiler {
  private activeTimers = new Map<string, number>();
  private accumulatedData = new Map<string, AccumulatedTiming>();

  /**
   * Start timing an operation. Returns the label for convenience.
   */
  start(label: string): string {
    this.activeTimers.set(label, performance.now());
    return label;
  }

  /**
   * End timing an operation and store the results.
   * Throws if the label was not started.
   */
  end(label: string): number {
    const startTime = this.activeTimers.get(label);
    if (startTime === undefined) {
      throw new Error(`Profiler.end() called for untracked label: "${label}". Call start() first.`);
    }

    this.activeTimers.delete(label);
    const durationMs = performance.now() - startTime;
    const timestamp = Date.now();

    const entry: TimingEntry = { label, durationMs, timestamp };

    const existing = this.accumulatedData.get(label);
    if (existing) {
      existing.totalMs += durationMs;
      existing.count++;
      existing.avgMs = existing.totalMs / existing.count;
      existing.minMs = Math.min(existing.minMs, durationMs);
      existing.maxMs = Math.max(existing.maxMs, durationMs);
      existing.entries.push(entry);
    } else {
      this.accumulatedData.set(label, {
        label,
        totalMs: durationMs,
        count: 1,
        avgMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
        entries: [entry],
      });
    }

    return durationMs;
  }

  /**
   * Check if a label is currently being tracked (has been started but not ended).
   */
  isActive(label: string): boolean {
    return this.activeTimers.has(label);
  }

  /**
   * Get the elapsed time for an active timer without ending it.
   * Returns undefined if the label is not active.
   */
  getElapsedMs(label: string): number | undefined {
    const startTime = this.activeTimers.get(label);
    if (startTime === undefined) {
      return undefined;
    }
    return performance.now() - startTime;
  }

  /**
   * Get accumulated data for a specific label.
   */
  getAccumulated(label: string): AccumulatedTiming | undefined {
    return this.accumulatedData.get(label);
  }

  /**
   * Clear all accumulated data and active timers.
   */
  clear(): void {
    this.activeTimers.clear();
    this.accumulatedData.clear();
  }

  /**
   * Clear only accumulated data, preserving active timers.
   */
  clearAccumulated(): void {
    this.accumulatedData.clear();
  }

  /**
   * Clear only active timers (this will lose timing data for unfinished operations).
   */
  clearActive(): void {
    this.activeTimers.clear();
  }

  /**
   * Generate a report of all accumulated timings, sorted by total duration (descending).
   */
  report(): ProfilerReport {
    const timings = Array.from(this.accumulatedData.values()).sort((a, b) => b.totalMs - a.totalMs);

    const totalOperations = timings.reduce((sum, t) => sum + t.count, 0);
    const totalDurationMs = timings.reduce((sum, t) => sum + t.totalMs, 0);

    let slowestOperation: AccumulatedTiming | null = null;
    for (const timing of timings) {
      if (!slowestOperation || timing.maxMs > slowestOperation.maxMs) {
        slowestOperation = timing;
      }
    }

    return {
      timings,
      totalOperations,
      totalDurationMs,
      slowestOperation,
    };
  }

  /**
   * Generate a formatted string report suitable for console output.
   */
  formatReport(): string {
    const data = this.report();

    if (data.timings.length === 0) {
      return 'Profiler Report: No timings recorded';
    }

    const lines: string[] = [
      '═══════════════════════════════════════════════════════════════',
      '                     PROFILER REPORT',
      '═══════════════════════════════════════════════════════════════',
      `Total Operations: ${data.totalOperations}`,
      `Total Duration: ${data.totalDurationMs.toFixed(2)}ms`,
      '',
      'Timings (sorted by total duration):',
      '───────────────────────────────────────────────────────────────',
    ];

    for (const t of data.timings) {
      lines.push(
        `  ${t.label}:`,
        `    Count: ${t.count} | Total: ${t.totalMs.toFixed(2)}ms | Avg: ${t.avgMs.toFixed(2)}ms`,
        `    Min: ${t.minMs.toFixed(2)}ms | Max: ${t.maxMs.toFixed(2)}ms`
      );
    }

    if (data.slowestOperation) {
      lines.push(
        '',
        `Slowest Single Operation: ${data.slowestOperation.label}`,
        `  Max Duration: ${data.slowestOperation.maxMs.toFixed(2)}ms`
      );
    }

    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

/**
 * Global profiler instance for convenience.
 * Use this for application-wide profiling, or create new Profiler instances
 * for scoped profiling.
 */
export const globalProfiler = new Profiler();
