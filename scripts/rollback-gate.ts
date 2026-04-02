#!/usr/bin/env bun
/**
 * Rollback Gate Checker
 *
 * Automated rollback decisions with explicit triggers.
 * Monitors metrics and triggers rollback when thresholds are breached.
 *
 * Usage: bun run scripts/rollback-gate.ts --check
 *        bun run scripts/rollback-gate.ts --drill
 */

import { readFileSync } from 'node:fs';

interface RollbackTriggers {
  p95LatencyThresholdMs: number;
  maxErrorRate: number;
  maxStalePublishes: number;
  maxPostCancelPublishes: number;
  maxLifecycleLeaks: number;
}

interface Metrics {
  p95Latency?: number;
  errorRate?: number;
  stalePublishes?: number;
  postCancelPublishes?: number;
  lifecycleLeaks?: number;
  // Confidence band metrics
  sampleSize?: number;
  variance?: number;
}

const DEFAULT_TRIGGERS: RollbackTriggers = {
  p95LatencyThresholdMs: 1000,
  maxErrorRate: 0.05,
  maxStalePublishes: 1,
  maxPostCancelPublishes: 1,
  maxLifecycleLeaks: 1,
};

function loadMetrics(): Metrics {
  const metricsPath = process.env['ROLLBACK_METRICS_PATH'] || './metrics/rollback-metrics.json';
  try {
    const data = readFileSync(metricsPath, 'utf8');
    return JSON.parse(data) as Metrics;
  } catch {
    return {
      p95Latency: parseFloat(process.env['METRIC_P95_LATENCY'] || '0'),
      errorRate: parseFloat(process.env['METRIC_ERROR_RATE'] || '0'),
      stalePublishes: parseInt(process.env['METRIC_STALE_PUBLISHES'] || '0', 10),
      postCancelPublishes: parseInt(process.env['METRIC_POST_CANCEL_PUBLISHES'] || '0', 10),
      lifecycleLeaks: parseInt(process.env['METRIC_LIFECYCLE_LEAKS'] || '0', 10),
      sampleSize: parseInt(process.env['METRIC_SAMPLE_SIZE'] || '100', 10),
      variance: parseFloat(process.env['METRIC_VARIANCE'] || '0'),
    };
  }
}

function checkConfidence(metrics: Metrics): { confident: boolean; reason?: string } {
  const minSampleSize = 50;
  const maxVariance = 0.3; // 30% variance threshold

  if (!metrics.sampleSize || metrics.sampleSize < minSampleSize) {
    return {
      confident: false,
      reason: `Sample size ${metrics.sampleSize} below minimum ${minSampleSize}`,
    };
  }

  if (metrics.variance && metrics.variance > maxVariance) {
    return {
      confident: false,
      reason: `Variance ${metrics.variance} exceeds threshold ${maxVariance}`,
    };
  }

  return { confident: true };
}

function checkRollbackTriggers(
  metrics: Metrics,
  triggers: RollbackTriggers
): { shouldRollback: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (metrics.p95Latency !== undefined && metrics.p95Latency > triggers.p95LatencyThresholdMs) {
    reasons.push(
      `p95 latency ${metrics.p95Latency}ms > threshold ${triggers.p95LatencyThresholdMs}ms`
    );
  }

  if (metrics.errorRate !== undefined && metrics.errorRate > triggers.maxErrorRate) {
    reasons.push(`error rate ${metrics.errorRate} > threshold ${triggers.maxErrorRate}`);
  }

  if (metrics.stalePublishes !== undefined && metrics.stalePublishes > triggers.maxStalePublishes) {
    reasons.push(
      `stale publishes ${metrics.stalePublishes} > threshold ${triggers.maxStalePublishes}`
    );
  }

  if (
    metrics.postCancelPublishes !== undefined &&
    metrics.postCancelPublishes > triggers.maxPostCancelPublishes
  ) {
    reasons.push(
      `post-cancel publishes ${metrics.postCancelPublishes} > threshold ${triggers.maxPostCancelPublishes}`
    );
  }

  if (metrics.lifecycleLeaks !== undefined && metrics.lifecycleLeaks > triggers.maxLifecycleLeaks) {
    reasons.push(
      `lifecycle leaks ${metrics.lifecycleLeaks} > threshold ${triggers.maxLifecycleLeaks}`
    );
  }

  return { shouldRollback: reasons.length > 0, reasons };
}

function runDrill(): void {
  console.log('🧪 Running rollback drill simulation');
  console.log('');

  // Simulate various failure scenarios
  const scenarios = [
    {
      name: 'p95 latency breach',
      metrics: { p95Latency: 1500, errorRate: 0.01, sampleSize: 100, variance: 0.1 },
    },
    {
      name: 'error rate spike',
      metrics: { p95Latency: 300, errorRate: 0.1, sampleSize: 100, variance: 0.15 },
    },
    {
      name: 'stale publish detected',
      metrics: { stalePublishes: 5, sampleSize: 100, variance: 0.05 },
    },
    {
      name: 'post-cancel publish detected',
      metrics: { postCancelPublishes: 3, sampleSize: 100, variance: 0.08 },
    },
    {
      name: 'lifecycle leak detected',
      metrics: { lifecycleLeaks: 2, sampleSize: 100, variance: 0.1 },
    },
    { name: 'insufficient data', metrics: { p95Latency: 500, sampleSize: 20, variance: 0.5 } },
    { name: 'high variance', metrics: { p95Latency: 500, sampleSize: 100, variance: 0.5 } },
    {
      name: 'all clear',
      metrics: { p95Latency: 200, errorRate: 0.001, sampleSize: 100, variance: 0.05 },
    },
  ];

  for (const scenario of scenarios) {
    console.log(`Scenario: ${scenario.name}`);

    const confidence = checkConfidence(scenario.metrics);
    if (!confidence.confident) {
      console.log(`  ⚠️  Not confident: ${confidence.reason}`);
      console.log('  Action: Hold (monitor longer)');
      console.log('');
      continue;
    }

    const { shouldRollback, reasons } = checkRollbackTriggers(scenario.metrics, DEFAULT_TRIGGERS);

    if (shouldRollback) {
      console.log('  ❌ ROLLBACK TRIGGERED');
      for (const reason of reasons) {
        console.log(`     - ${reason}`);
      }
    } else {
      console.log('  ✅ No rollback needed');
    }
    console.log('');
  }
}

function runCheck(): void {
  console.log('🔍 Checking rollback triggers');
  console.log('');

  const metrics = loadMetrics();

  console.log('Current metrics:');
  console.log(`  p95 latency: ${metrics.p95Latency ?? 'N/A'}ms`);
  console.log(`  error rate: ${metrics.errorRate ?? 'N/A'}`);
  console.log(`  stale publishes: ${metrics.stalePublishes ?? 'N/A'}`);
  console.log(`  post-cancel publishes: ${metrics.postCancelPublishes ?? 'N/A'}`);
  console.log(`  lifecycle leaks: ${metrics.lifecycleLeaks ?? 'N/A'}`);
  console.log(`  sample size: ${metrics.sampleSize ?? 'N/A'}`);
  console.log(`  variance: ${metrics.variance ?? 'N/A'}`);
  console.log('');

  const confidence = checkConfidence(metrics);
  if (!confidence.confident) {
    console.log(`⚠️  Not confident: ${confidence.reason}`);
    console.log('Recommendation: Hold (continue monitoring)');
    process.exit(2); // Exit code 2 = hold/uncertain
  }

  console.log('✅ Confidence check passed');
  console.log('');

  const { shouldRollback, reasons } = checkRollbackTriggers(metrics, DEFAULT_TRIGGERS);

  if (shouldRollback) {
    console.log('❌ ROLLBACK RECOMMENDED');
    console.log('');
    console.log('Triggers:');
    for (const reason of reasons) {
      console.log(`  - ${reason}`);
    }
    process.exit(1);
  } else {
    console.log('✅ No rollback triggers detected');
    console.log('System is healthy');
    process.exit(0);
  }
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--drill')) {
    runDrill();
  } else if (args.includes('--check') || args.length === 0) {
    runCheck();
  } else {
    console.error('Usage: bun run scripts/rollback-gate.ts [--check|--drill]');
    process.exit(1);
  }
}

main();
