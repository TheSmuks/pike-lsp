/**
 * Validation Cycle Metrics
 *
 * Tracks per-cycle metrics for the diagnostics validation pipeline:
 * totalMs, cacheHits, and blocked (superseded) request counts.
 *
 * Issue #1299: Previous implementation collected _perf data from the bridge
 * but never aggregated it, so totalMs/cacheHits/blocked were always zero.
 */

import type { Logger } from '@pike-lsp/core';

/** Metrics for a single validation cycle */
export interface ValidationCycleMetrics {
  /** Wall-clock time from validate start to publish, in milliseconds */
  totalMs: number;
  /** Number of validations that hit the bridge compilation cache */
  cacheHits: number;
  /** Number of validations blocked (superseded by a newer request) */
  blocked: number;
}

/** Summary snapshot of accumulated validation metrics */
export interface ValidationMetricsSummary {
  /** Total validation cycles completed */
  cycles: number;
  /** Cumulative wall-clock time across all cycles (ms) */
  totalMs: number;
  /** Total cache hits */
  cacheHits: number;
  /** Total blocked requests */
  blocked: number;
  /** Average cycle time (ms) */
  avgMs: number;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
}

/** Per-cycle data captured from the bridge _perf and timing */
export interface CycleObservation {
  /** Whether the Pike compilation cache was hit */
  cacheHit: boolean;
  /** Whether the request was blocked/superseded */
  blocked: boolean;
  /** Wall-clock time for this cycle in ms */
  totalMs: number;
}

const SUMMARY_LOG_EVERY = 50;

/**
 * Accumulates validation cycle metrics and periodically logs summaries.
 *
 * Thread-safe for single-threaded LSP server — no locking needed.
 */
export class ValidationCycleTracker {
  private cycles = 0;
  private totalMs = 0;
  private cacheHits = 0;
  private blocked = 0;
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  /**
   * Record a completed validation cycle.
   * Logs a summary every SUMMARY_LOG_EVERY cycles.
   */
  record(observation: CycleObservation): void {
    this.cycles += 1;
    this.totalMs += observation.totalMs;
    if (observation.cacheHit) {
      this.cacheHits += 1;
    }
    if (observation.blocked) {
      this.blocked += 1;
    }

    if (this.cycles % SUMMARY_LOG_EVERY === 0) {
      this.log.info('Validation cycle metrics summary', this.snapshot());
    }
  }

  /** Get a point-in-time snapshot of accumulated metrics. */
  snapshot(): ValidationMetricsSummary {
    return {
      cycles: this.cycles,
      totalMs: this.totalMs,
      cacheHits: this.cacheHits,
      blocked: this.blocked,
      avgMs: this.cycles > 0 ? Math.round(this.totalMs / this.cycles) : 0,
      cacheHitRate: this.cycles > 0 ? this.cacheHits / this.cycles : 0,
    };
  }

  /** Reset all counters. Useful in tests. */
  reset(): void {
    this.cycles = 0;
    this.totalMs = 0;
    this.cacheHits = 0;
    this.blocked = 0;
  }
}
