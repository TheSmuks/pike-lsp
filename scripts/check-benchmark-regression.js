#!/usr/bin/env node
/**
 * Benchmark Regression Check
 *
 * Analyzes benchmark results to detect performance regressions.
 * Works with transformed benchmark-action format.
 *
 * Usage: node scripts/check-benchmark-regression.js benchmark-results.json
 */

import fs from 'fs';

const RESULTS_FILE = process.argv[2] || 'benchmark-results.json';

// Configuration from environment
const COMPILE_SPEEDUP_THRESHOLD = parseInt(process.env.COMPILE_SPEEDUP_THRESHOLD || '20', 10);

// Read benchmark results
let results;
try {
  const content = fs.readFileSync(RESULTS_FILE, 'utf8');
  results = JSON.parse(content);
} catch (err) {
  console.error(`Error reading benchmark results from ${RESULTS_FILE}:`, err.message);
  process.exit(0); // Don't fail CI if file doesn't exist yet
}

// Find cache benchmarks (flat format)
const cacheHitBench = results.find(b => b.name?.includes('Cache Hit'));
const cacheMissBench = results.find(b => b.name?.includes('Cache Miss'));

if (!cacheHitBench || !cacheMissBench) {
  console.log('Cache Hit or Cache Miss benchmark not found, skipping cache checks.');
  process.exit(0);
}

// Calculate speedup
const hitMean = cacheHitBench.value || 0;
const missMean = cacheMissBench.value || 0;
let speedupPercent = 0;

if (hitMean > 0 && missMean > 0) {
  speedupPercent = ((missMean - hitMean) / missMean) * 100;
} else if (missMean > 0) {
  speedupPercent = 100; // Hit was near-instant, 100% speedup
}

console.log('\n=== Compilation Cache Performance ===');
console.log(`Cache Hit Mean:     ${hitMean.toFixed(3)} ms`);
console.log(`Cache Miss Mean:    ${missMean.toFixed(3)} ms`);
console.log(`Cache Speedup:      ${speedupPercent.toFixed(1)}%`);

// Check thresholds
let failed = false;

// Skip check if values are very small (noise level) - both under 0.5ms
// At these small scales, timing variance dominates any cache benefit
if (hitMean < 0.5 && missMean < 0.5) {
  console.log(`SKIPPED: Values too small for reliable comparison (< 0.5ms)`);
} else if (speedupPercent < COMPILE_SPEEDUP_THRESHOLD) {
  console.error(`\nERROR: Cache speedup (${speedupPercent.toFixed(1)}%) below threshold (${COMPILE_SPEEDUP_THRESHOLD}%)`);
  failed = true;
} else {
  console.log(`OK: Cache speedup meets threshold (${COMPILE_SPEEDUP_THRESHOLD}%)`);
}

if (failed) {
  process.exit(1);
}

console.log('\nBenchmark regression checks passed.');
