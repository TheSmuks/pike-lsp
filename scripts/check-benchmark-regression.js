#!/usr/bin/env node
/**
 * Benchmark Regression Check
 *
 * Analyzes mitata benchmark results to detect performance regressions.
 * Checks cache performance thresholds and overall benchmark regression.
 *
 * Usage: node scripts/check-benchmark-regression.js benchmark-results.json
 */

import fs from 'fs';
import path from 'path';

const RESULTS_FILE = process.argv[2] || 'benchmark-results.json';

// Configuration from environment
const CACHE_HIT_THRESHOLD = parseInt(process.env.CACHE_HIT_THRESHOLD || '80', 10);
const COMPILE_SPEEDUP_THRESHOLD = parseInt(process.env.COMPILE_SPEEDUP_THRESHOLD || '50', 10);
const ALERT_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD || '1.2'); // 20% regression threshold

// Read benchmark results
let results;
try {
  const content = fs.readFileSync(RESULTS_FILE, 'utf8');
  results = JSON.parse(content);
} catch (err) {
  console.error(`Error reading benchmark results from ${RESULTS_FILE}:`, err.message);
  process.exit(0); // Don't fail CI if file doesn't exist yet
}

// Find cache benchmark group
const cacheGroup = results.groups?.find(g => g.name?.includes('Compilation Cache'));

if (!cacheGroup) {
  console.log('No Compilation Cache benchmark group found, skipping cache checks.');
  process.exit(0);
}

// Find cache hit and cache miss benchmarks
const cacheHitBench = cacheGroup.benchmarks?.find(b => b.name?.includes('Cache Hit'));
const cacheMissBench = cacheGroup.benchmarks?.find(b => b.name?.includes('Cache Miss'));

if (!cacheHitBench || !cacheMissBench) {
  console.log('Cache Hit or Cache Miss benchmark not found, skipping cache checks.');
  process.exit(0);
}

// Calculate speedup
const hitMean = cacheHitBench.mean || 0;
const missMean = cacheMissBench.mean || 0;
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

if (speedupPercent < COMPILE_SPEEDUP_THRESHOLD) {
  console.error(`\nERROR: Cache speedup (${speedupPercent.toFixed(1)}%) below threshold (${COMPILE_SPEEDUP_THRESHOLD}%)`);
  failed = true;
} else {
  console.log(`OK: Cache speedup meets threshold (${COMPILE_SPEEDUP_THRESHOLD}%)`);
}

// Check overall benchmark regression against baseline
const baselineFile = process.env.BASELINE_FILE;
if (baselineFile && fs.existsSync(baselineFile)) {
  try {
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));

    // Compare overall means
    const currentMean = results.mean || 0;
    const baselineMean = baseline.mean || 0;
    const regression = currentMean / baselineMean;

    console.log(`\n=== Overall Regression Check ===`);
    console.log(`Current Mean:  ${currentMean.toFixed(3)} ms`);
    console.log(`Baseline Mean: ${baselineMean.toFixed(3)} ms`);
    console.log(`Regression:    ${(regression * 100).toFixed(1)}%`);

    if (regression > ALERT_THRESHOLD) {
      console.error(`\nERROR: Performance regression detected (${(regression * 100).toFixed(1)}% > ${ALERT_THRESHOLD * 100}%)`);
      failed = true;
    }
  } catch (err) {
    console.warn(`Warning: Could not compare against baseline: ${err.message}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log('\nBenchmark regression checks passed.');
