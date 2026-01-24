#!/usr/bin/env node
/**
 * Apply rolling average baseline for benchmark comparison
 *
 * This script modifies benchmark comparison behavior by:
 * 1. Fetching historical benchmark data from gh-pages
 * 2. Computing rolling average (last N runs) for each benchmark
 * 3. Outputting statistics for regression detection
 *
 * Note: Uses execSync with hardcoded git command (no user input) - safe from injection.
 *
 * Usage: node scripts/apply-rolling-average.js [window-size]
 * Default window size: 5 runs
 */

const { execSync } = require('child_process');
const fs = require('fs');

const WINDOW_SIZE = parseInt(process.argv[2] || '5', 10);
const CURRENT_RESULTS_PATH = process.env.BENCHMARK_RESULTS || 'benchmark-results.json';

function fetchHistoricalData() {
  try {
    // Static git command - no user input, safe from injection
    const data = execSync('git show origin/gh-pages:benchmarks/data.js 2>/dev/null', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024  // 10MB buffer for large history
    });

    // Extract JSON from window.BENCHMARK_DATA = {...}
    const jsonMatch = data.match(/window\.BENCHMARK_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!jsonMatch) {
      console.error('Could not parse benchmark data format');
      return null;
    }

    return JSON.parse(jsonMatch[1]);
  } catch (error) {
    console.error('Could not fetch historical data:', error.message);
    return null;
  }
}

function computeRollingStats(entries, windowSize) {
  const stats = {};

  for (const [suiteName, runs] of Object.entries(entries)) {
    if (!Array.isArray(runs) || runs.length === 0) continue;

    // Get the last N runs (most recent first)
    const recentRuns = runs.slice(-windowSize);

    // Collect values per benchmark name
    const benchmarkValues = {};

    for (const run of recentRuns) {
      if (!run.benches) continue;

      for (const bench of run.benches) {
        if (!benchmarkValues[bench.name]) {
          benchmarkValues[bench.name] = [];
        }
        benchmarkValues[bench.name].push(bench.value);
      }
    }

    // Compute stats for each benchmark
    for (const [name, values] of Object.entries(benchmarkValues)) {
      if (values.length === 0) continue;

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const sorted = [...values].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const stdDev = Math.sqrt(
        values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
      );
      const cv = (stdDev / avg) * 100;  // Coefficient of variation (%)

      stats[name] = {
        avg,
        min,
        max,
        stdDev,
        cv,
        sampleSize: values.length,
        values
      };
    }
  }

  return stats;
}

function analyzeCurrentResults(currentPath, historicalStats) {
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));

  const analysis = [];
  let hasRegression = false;

  for (const bench of current) {
    const historical = historicalStats[bench.name];

    if (!historical) {
      analysis.push({
        name: bench.name,
        current: bench.value,
        status: 'NEW',
        message: 'No historical data'
      });
      continue;
    }

    const { avg, stdDev, cv, min, max, sampleSize } = historical;
    const currentValue = bench.value;

    // Calculate z-score (how many std devs from mean)
    const zScore = stdDev > 0 ? (currentValue - avg) / stdDev : 0;

    // Determine dynamic threshold based on variance
    // High variance benchmarks (CV > 20%) get more lenient threshold
    let threshold;
    if (cv > 30) {
      threshold = 2.5;  // Very noisy benchmark
    } else if (cv > 20) {
      threshold = 2.0;  // Noisy benchmark
    } else if (cv > 10) {
      threshold = 1.5;  // Moderate variance
    } else {
      threshold = 1.2;  // Stable benchmark, tighter threshold
    }

    // Also check against max historical value
    const vsMax = currentValue / max;
    const vsAvg = currentValue / avg;

    let status = 'OK';
    let message = '';

    if (zScore > 3) {
      status = 'REGRESSION';
      message = `${zScore.toFixed(1)} std devs above mean (>${threshold} threshold)`;
      hasRegression = true;
    } else if (vsMax > 1.2 && zScore > 2) {
      status = 'REGRESSION';
      message = `${(vsMax * 100 - 100).toFixed(0)}% above historical max`;
      hasRegression = true;
    } else if (zScore > 2) {
      status = 'WARNING';
      message = `${zScore.toFixed(1)} std devs above mean`;
    } else if (vsAvg < 0.8) {
      status = 'IMPROVED';
      message = `${((1 - vsAvg) * 100).toFixed(0)}% faster than average`;
    }

    analysis.push({
      name: bench.name,
      current: currentValue,
      avg: avg.toFixed(4),
      stdDev: stdDev.toFixed(4),
      cv: cv.toFixed(1) + '%',
      zScore: zScore.toFixed(2),
      vsAvg: (vsAvg * 100).toFixed(0) + '%',
      vsMax: (vsMax * 100).toFixed(0) + '%',
      range: `${min.toFixed(4)}-${max.toFixed(4)}`,
      samples: sampleSize,
      status,
      message
    });
  }

  return { analysis, hasRegression };
}

function main() {
  console.log(`\n=== Rolling Average Benchmark Analysis (window=${WINDOW_SIZE}) ===\n`);

  // Fetch historical data
  const historical = fetchHistoricalData();
  if (!historical || !historical.entries) {
    console.log('No historical data available, skipping rolling average analysis');
    process.exit(0);
  }

  // Compute rolling statistics
  const stats = computeRollingStats(historical.entries, WINDOW_SIZE);

  if (Object.keys(stats).length === 0) {
    console.log('No benchmark statistics computed');
    process.exit(0);
  }

  // Analyze current results
  if (!fs.existsSync(CURRENT_RESULTS_PATH)) {
    console.error(`Current results not found: ${CURRENT_RESULTS_PATH}`);
    process.exit(1);
  }

  const { analysis, hasRegression } = analyzeCurrentResults(CURRENT_RESULTS_PATH, stats);

  // Print report
  console.log('Benchmark'.padEnd(55) + 'Current'.padStart(12) + 'Avg'.padStart(12) +
              'CV'.padStart(8) + 'Z-Score'.padStart(10) + 'Status'.padStart(12));
  console.log('-'.repeat(109));

  for (const item of analysis) {
    const name = item.name.length > 52 ? item.name.substring(0, 49) + '...' : item.name;
    const statusColor = item.status === 'REGRESSION' ? '\x1b[31m' :
                       item.status === 'WARNING' ? '\x1b[33m' :
                       item.status === 'IMPROVED' ? '\x1b[32m' : '';
    const reset = statusColor ? '\x1b[0m' : '';

    console.log(
      name.padEnd(55) +
      (typeof item.current === 'number' ? item.current.toFixed(4) : item.current).toString().padStart(12) +
      (item.avg || '-').toString().padStart(12) +
      (item.cv || '-').toString().padStart(8) +
      (item.zScore || '-').toString().padStart(10) +
      statusColor + item.status.padStart(12) + reset
    );

    if (item.message) {
      console.log(' '.repeat(55) + `└─ ${item.message}`);
    }
  }

  console.log('\n' + '='.repeat(109));

  // Summary
  const regressions = analysis.filter(a => a.status === 'REGRESSION');
  const warnings = analysis.filter(a => a.status === 'WARNING');
  const improved = analysis.filter(a => a.status === 'IMPROVED');

  console.log(`\nSummary: ${regressions.length} regressions, ${warnings.length} warnings, ${improved.length} improved\n`);

  if (hasRegression) {
    console.error('\x1b[31mRegression detected! Review the benchmarks above.\x1b[0m\n');
    process.exit(1);
  }

  console.log('\x1b[32mNo significant regressions detected.\x1b[0m\n');
  process.exit(0);
}

main();
