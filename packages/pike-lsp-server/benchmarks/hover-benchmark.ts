/**
 * Hover Benchmark
 *
 * Measures hover response time with varying symbol counts.
 * Part of Issue #1229: Performance profiling of LSP hot paths
 */

import { PikeBridge } from '@pike-lsp/pike-bridge';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BenchmarkResult {
  name: string;
  iterations: number;
  mean_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  stddev_ms: number;
}

interface HoverBenchmarkConfig {
  name: string;
  fixtureFile: string;
  line: number;
  column: number;
  iterations: number;
}

/**
 * Run a single hover benchmark configuration
 */
async function runHoverBenchmark(
  bridge: PikeBridge,
  config: HoverBenchmarkConfig
): Promise<BenchmarkResult> {
  const { name, fixtureFile, line, column, iterations } = config;

  // Read fixture file
  const fixturePath = path.join(__dirname, 'fixtures', fixtureFile);
  const code = fs.readFileSync(fixturePath, 'utf8');
  const uri = `benchmark://${fixtureFile}`;

  // Pre-analyze to populate cache (warmup)
  await bridge.analyze(code, ['parse', 'introspect'], fixtureFile, 1);

  // Find a word at the specified position for hover
  const lines = code.split('\n');
  const targetLine = lines[line - 1] || '';
  const word =
    targetLine.slice(column).match(/^[a-zA-Z_]\w*/)?.[0] ||
    targetLine.slice(0, column).match(/[a-zA-Z_]\w*$/)?.[0] ||
    'test';

  console.log(`  Running ${name} (${iterations} iterations)...`);

  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    // Simulate hover lookup: analyze + resolve type
    await bridge.analyze(code, ['introspect'], fixtureFile, 1);

    // Additional type resolution for variable/method hover
    try {
      await bridge.getTypeAtPosition(code, fixtureFile, line, word);
    } catch {
      // Type lookup may fail for some positions, that's OK for benchmark
    }

    const end = performance.now();
    times.push(end - start);
  }

  // Calculate statistics
  times.sort((a, b) => a - b);
  const n = times.length;
  const sum = times.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const p50 = times[Math.floor(n * 0.5)];
  const p95 = times[Math.floor(n * 0.95)];
  const p99 = times[Math.floor(n * 0.99)];
  const min = times[0];
  const max = times[n - 1];
  const variance = times.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);

  return {
    name,
    iterations: n,
    mean_ms: Math.round(mean * 1000) / 1000,
    p50_ms: Math.round(p50 * 1000) / 1000,
    p95_ms: Math.round(p95 * 1000) / 1000,
    p99_ms: Math.round(p99 * 1000) / 1000,
    min_ms: Math.round(min * 1000) / 1000,
    max_ms: Math.round(max * 1000) / 1000,
    stddev_ms: Math.round(stddev * 1000) / 1000,
  };
}

/**
 * Main benchmark runner
 */
async function main(): Promise<void> {
  console.log('=== Hover Response Time Benchmark ===\n');
  console.log('Issue #1229: Performance profiling of LSP hot paths\n');

  // Count symbols in each fixture
  const fixtures = [
    { name: 'small', file: 'small.pike', estimatedSymbols: 10 },
    { name: 'medium', file: 'medium.pike', estimatedSymbols: 50 },
    { name: 'large', file: 'large.pike', estimatedSymbols: 200 },
  ];

  for (const f of fixtures) {
    const fixturePath = path.join(__dirname, 'fixtures', f.file);
    if (fs.existsSync(fixturePath)) {
      const content = fs.readFileSync(fixturePath, 'utf8');
      const classMatches = content.match(/\bclass\s+\w+/g) || [];
      const methodMatches =
        content.match(/\b(?:void|int|string|float|array|mapping|object|mixed)\s+\w+\s*\(/g) || [];
      f.estimatedSymbols = classMatches.length + methodMatches.length + 10; // +10 for variables
    }
  }

  console.log('Estimated symbols per fixture:');
  for (const f of fixtures) {
    console.log(`  ${f.name}: ~${f.estimatedSymbols} symbols`);
  }
  console.log('');

  // Initialize bridge
  const bridge = new PikeBridge();
  await bridge.start();

  const results: BenchmarkResult[] = [];
  const ITERATIONS = 100;

  try {
    // Benchmark configurations
    const configs: HoverBenchmarkConfig[] = [
      {
        name: 'Hover: Small File (~10 symbols)',
        fixtureFile: 'small.pike',
        line: 5,
        column: 4,
        iterations: ITERATIONS,
      },
      {
        name: 'Hover: Medium File (~50 symbols)',
        fixtureFile: 'medium.pike',
        line: 20,
        column: 8,
        iterations: ITERATIONS,
      },
      {
        name: 'Hover: Large File (~200 symbols)',
        fixtureFile: 'large.pike',
        line: 100,
        column: 12,
        iterations: ITERATIONS,
      },
    ];

    for (const config of configs) {
      const result = await runHoverBenchmark(bridge, config);
      results.push(result);
    }

    // Output summary
    console.log('\n=== Results Summary ===\n');
    console.log(
      `${'Benchmark'.padEnd(35)} ${'Mean'.padStart(8)} ${'P50'.padStart(8)} ${'P95'.padStart(8)} ${'P99'.padStart(8)} ${'Min'.padStart(8)} ${'Max'.padStart(8)}`
    );
    console.log('-'.repeat(85));

    for (const r of results) {
      const name = r.name.length > 34 ? r.name.slice(0, 31) + '...' : r.name;
      console.log(
        `${name.padEnd(35)} ` +
          `${r.mean_ms.toFixed(2).padStart(8)} ` +
          `${r.p50_ms.toFixed(2).padStart(8)} ` +
          `${r.p95_ms.toFixed(2).padStart(8)} ` +
          `${r.p99_ms.toFixed(2).padStart(8)} ` +
          `${r.min_ms.toFixed(2).padStart(8)} ` +
          `${r.max_ms.toFixed(2).padStart(8)}`
      );
    }

    // JSON output
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      issue: '#1229',
      description: 'Hover Response Time Benchmark',
      iterations: ITERATIONS,
      results,
    };

    // Write JSON results
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(resultsDir, `hover-benchmark-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));

    console.log(`\nJSON results written to: ${jsonPath}`);

    // Also output to stdout as JSON if requested
    if (process.env.HOVER_BENCH_JSON) {
      process.stdout.write(JSON.stringify(jsonOutput, null, 2));
    }

    // Performance assertions
    console.log('\n=== Performance Assertions ===');
    const largeFileP99 = results.find(r => r.name.includes('Large'))?.p99_ms ?? 0;
    if (largeFileP99 > 100) {
      console.warn(
        `⚠️  WARNING: Large file P99 (${largeFileP99.toFixed(2)}ms) exceeds 100ms threshold`
      );
    } else {
      console.log(`✓ Large file P99 (${largeFileP99.toFixed(2)}ms) within 100ms threshold`);
    }

    const mediumFileP95 = results.find(r => r.name.includes('Medium'))?.p95_ms ?? 0;
    if (mediumFileP95 > 50) {
      console.warn(
        `⚠️  WARNING: Medium file P95 (${mediumFileP95.toFixed(2)}ms) exceeds 50ms threshold`
      );
    } else {
      console.log(`✓ Medium file P95 (${mediumFileP95.toFixed(2)}ms) within 50ms threshold`);
    }
  } finally {
    await bridge.stop();
  }

  console.log('\n=== Benchmark Complete ===');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}

export { runHoverBenchmark, main };
