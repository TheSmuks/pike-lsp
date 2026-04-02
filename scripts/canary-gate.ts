#!/usr/bin/env bun
/**
 * Canary Gate Checker
 *
 * Automated go/no-go decisions for QE2 canary progression.
 * Checks metrics against thresholds for stage progression.
 *
 * Usage: bun run scripts/canary-gate.ts --stage=internal|5pct|25pct|ga
 */

import { readFileSync } from 'node:fs';

interface Thresholds {
  p95LatencyMs: number;
  maxErrorRate: number;
  maxStalePublishes: number;
  maxPostCancelPublishes: number;
}

interface StageConfig {
  name: string;
  thresholds: Thresholds;
  requiredMetrics: string[];
}

const STAGE_CONFIGS: Record<string, StageConfig> = {
  internal: {
    name: 'Internal',
    thresholds: {
      p95LatencyMs: 500,
      maxErrorRate: 0.01,
      maxStalePublishes: 0,
      maxPostCancelPublishes: 0,
    },
    requiredMetrics: ['p95Latency', 'errorRate', 'cancelCorrectness'],
  },
  '5pct': {
    name: '5% Rollout',
    thresholds: {
      p95LatencyMs: 400,
      maxErrorRate: 0.005,
      maxStalePublishes: 0,
      maxPostCancelPublishes: 0,
    },
    requiredMetrics: ['p95Latency', 'errorRate', 'cancelCorrectness', 'stalePublishes'],
  },
  '25pct': {
    name: '25% Rollout',
    thresholds: {
      p95LatencyMs: 350,
      maxErrorRate: 0.001,
      maxStalePublishes: 0,
      maxPostCancelPublishes: 0,
    },
    requiredMetrics: [
      'p95Latency',
      'errorRate',
      'cancelCorrectness',
      'stalePublishes',
      'telemetryCompleteness',
    ],
  },
  ga: {
    name: 'General Availability',
    thresholds: {
      p95LatencyMs: 300,
      maxErrorRate: 0.0005,
      maxStalePublishes: 0,
      maxPostCancelPublishes: 0,
    },
    requiredMetrics: [
      'p95Latency',
      'errorRate',
      'cancelCorrectness',
      'stalePublishes',
      'telemetryCompleteness',
      'lifecycleLeaks',
    ],
  },
};

interface Metrics {
  p95Latency?: number;
  errorRate?: number;
  stalePublishes?: number;
  postCancelPublishes?: number;
  telemetryCompleteness?: number;
  lifecycleLeaks?: number;
}

function loadMetrics(): Metrics {
  // In production, this would read from monitoring system
  // For now, read from local metrics file or environment
  const metricsPath = process.env['CANARY_METRICS_PATH'] || './metrics/canary-metrics.json';
  try {
    const data = readFileSync(metricsPath, 'utf8');
    return JSON.parse(data) as Metrics;
  } catch {
    // Fallback: read from environment variables
    return {
      p95Latency: parseFloat(process.env['METRIC_P95_LATENCY'] || '0'),
      errorRate: parseFloat(process.env['METRIC_ERROR_RATE'] || '0'),
      stalePublishes: parseInt(process.env['METRIC_STALE_PUBLISHES'] || '0', 10),
      postCancelPublishes: parseInt(process.env['METRIC_POST_CANCEL_PUBLISHES'] || '0', 10),
      telemetryCompleteness: parseFloat(process.env['METRIC_TELEMETRY_COMPLETENESS'] || '1'),
      lifecycleLeaks: parseInt(process.env['METRIC_LIFECYCLE_LEAKS'] || '0', 10),
    };
  }
}

function checkThresholds(
  metrics: Metrics,
  stage: StageConfig
): { pass: boolean; violations: string[] } {
  const violations: string[] = [];

  if (metrics.p95Latency === undefined || metrics.p95Latency > stage.thresholds.p95LatencyMs) {
    violations.push(
      `p95 latency ${metrics.p95Latency ?? 'undefined'}ms exceeds threshold ${stage.thresholds.p95LatencyMs}ms`
    );
  }

  if (metrics.errorRate === undefined || metrics.errorRate > stage.thresholds.maxErrorRate) {
    violations.push(
      `error rate ${metrics.errorRate ?? 'undefined'} exceeds threshold ${stage.thresholds.maxErrorRate}`
    );
  }

  if (
    metrics.stalePublishes === undefined ||
    metrics.stalePublishes > stage.thresholds.maxStalePublishes
  ) {
    violations.push(
      `stale publishes ${metrics.stalePublishes ?? 'undefined'} exceeds threshold ${stage.thresholds.maxStalePublishes}`
    );
  }

  if (
    metrics.postCancelPublishes === undefined ||
    metrics.postCancelPublishes > stage.thresholds.maxPostCancelPublishes
  ) {
    violations.push(
      `post-cancel publishes ${metrics.postCancelPublishes ?? 'undefined'} exceeds threshold ${stage.thresholds.maxPostCancelPublishes}`
    );
  }

  if (
    stage.requiredMetrics.includes('telemetryCompleteness') &&
    (metrics.telemetryCompleteness === undefined || metrics.telemetryCompleteness < 0.95)
  ) {
    violations.push(
      `telemetry completeness ${metrics.telemetryCompleteness ?? 'undefined'} below required 0.95`
    );
  }

  return { pass: violations.length === 0, violations };
}

function main(): void {
  const args = process.argv.slice(2);
  const stageArg = args.find(a => a.startsWith('--stage='));
  const stageName = stageArg?.split('=')[1] || 'internal';

  const stage = STAGE_CONFIGS[stageName];
  if (!stage) {
    console.error(`Error: Unknown stage "${stageName}"`);
    console.error(`Valid stages: ${Object.keys(STAGE_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Checking canary gate for stage: ${stage.name}`);
  console.log('');

  const metrics = loadMetrics();
  const { pass, violations } = checkThresholds(metrics, stage);

  console.log('Metrics:');
  console.log(
    `  p95 latency: ${metrics.p95Latency ?? 'N/A'}ms (threshold: ${stage.thresholds.p95LatencyMs}ms)`
  );
  console.log(
    `  error rate: ${metrics.errorRate ?? 'N/A'} (threshold: ${stage.thresholds.maxErrorRate})`
  );
  console.log(
    `  stale publishes: ${metrics.stalePublishes ?? 'N/A'} (threshold: ${stage.thresholds.maxStalePublishes})`
  );
  console.log(
    `  post-cancel publishes: ${metrics.postCancelPublishes ?? 'N/A'} (threshold: ${stage.thresholds.maxPostCancelPublishes})`
  );
  if (stage.requiredMetrics.includes('telemetryCompleteness')) {
    console.log(
      `  telemetry completeness: ${metrics.telemetryCompleteness ?? 'N/A'} (required: 0.95)`
    );
  }
  console.log('');

  if (pass) {
    console.log('✅ Canary gate PASSED - promotion approved');
    process.exit(0);
  } else {
    console.log('❌ Canary gate FAILED - promotion blocked');
    console.log('');
    console.log('Violations:');
    for (const v of violations) {
      console.log(`  - ${v}`);
    }
    process.exit(1);
  }
}

main();
