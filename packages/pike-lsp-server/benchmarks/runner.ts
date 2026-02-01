import { run, bench, group } from 'mitata';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBenchmarks() {
  const smallPike = fs.readFileSync(path.join(__dirname, 'fixtures/small.pike'), 'utf8');
  const mediumPike = fs.readFileSync(path.join(__dirname, 'fixtures/medium.pike'), 'utf8');
  const largePike = fs.readFileSync(path.join(__dirname, 'fixtures/large.pike'), 'utf8');

  group('LSP Server Foundations', () => {
    bench('PikeBridge.start() [Cold Start]', async () => {
      const bridge = new PikeBridge();
      await bridge.start();
      await bridge.stop();
    });

    // PERF-011: Startup benchmark with detailed metrics
    bench('PikeBridge.start() with detailed metrics [Cold Start]', async () => {
      const bridge = new PikeBridge();
      await bridge.start();

      // Fetch startup metrics if available
      try {
        const metrics = await (bridge as any).sendRequest('get_startup_metrics', {});
        // Metrics will be available in result.startup
        const startup = metrics?.startup;
        if (startup && !process.env.MITATA_JSON) {
          console.error('  Pike startup phases:', JSON.stringify(startup));
        }
      } catch (e) {
        // Handler may not be available in older versions
      }

      await bridge.stop();
    });

    bench('Cold Start + First Request (getVersionInfo)', async () => {
      const bridge = new PikeBridge();
      await bridge.start();
      await bridge.getVersionInfo();
      await bridge.stop();
    });

    bench('Cold Start + Introspect', async () => {
      const bridge = new PikeBridge();
      await bridge.start();
      await bridge.analyze('int x;', ['introspect'], 'test.pike');
      await bridge.stop();
    });
  });

  const bridge = new PikeBridge();
  await bridge.start();

  const pikeMetrics: Record<string, number[]> = {};

  const trackPikeTime = (name: string, result: any) => {
    if (!pikeMetrics[name]) pikeMetrics[name] = [];
    if (result?._perf?.pike_total_ms) {
      pikeMetrics[name].push(result._perf.pike_total_ms);
    } else if (Array.isArray(result)) {
        // Handle batch results if needed, but here we usually have single objects
    } else if (typeof result === 'object' && result !== null) {
        // Check nested results (like in validation suite)
        for (const key in result) {
            if (result[key]?._perf?.pike_total_ms) {
                pikeMetrics[name].push(result[key]._perf.pike_total_ms);
            }
        }
    }
  };

  // PERF-011: Fetch startup metrics once for reporting
  let startupPhases: Record<string, number> | null = null;
  try {
    const startupResult = await (bridge as any).sendRequest('get_startup_metrics', {});
    startupPhases = startupResult?.startup || null;
  } catch (e) {
    // Handler may not be available
  }

  group('Validation Pipeline (Warm)', () => {
    const runValidation = async (code: string, filename: string, benchName: string) => {
      const results: any = {};
      const response = await bridge.analyze(code, ['parse', 'introspect', 'diagnostics'], filename);
      results.introspect = response.result.introspect;
      results.parse = response.result.parse;
      results.analyze = response.result.diagnostics;
      trackPikeTime(benchName, response.result);
      return results;
    };

    bench('Validation: Small File (~15 lines)', async () => {
      await runValidation(smallPike, 'small.pike', 'Validation: Small');
    });

    bench('Validation: Medium File (~100 lines)', async () => {
      await runValidation(mediumPike, 'medium.pike', 'Validation: Medium');
    });

    bench('Validation: Large File (~1000 lines)', async () => {
      await runValidation(largePike, 'large.pike', 'Validation: Large');
    });
  });

  await bridge.analyze(mediumPike, ['introspect'], 'medium.pike');
  await bridge.analyze(mediumPike, ['parse', 'introspect', 'diagnostics'], 'medium.pike');

  group('Request Consolidation (Warm)', async () => {
    // PERF-12-05: Benchmark legacy approach (3 separate calls) vs consolidated (1 call)
    const code = mediumPike;
    const filename = 'medium.pike';

    // Legacy: 3 separate IPC calls (the old validation approach)
    bench('Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)', async () => {
      const results: any = {};
      results.introspect = await bridge.analyze(code, ['introspect'], filename);
      results.parse = await bridge.parse(code, filename);
      results.analyze = await bridge.analyzeUninitialized(code, filename);
      trackPikeTime('Validation Legacy', results);
      return results;
    });

    // Consolidated: Single analyze() call with all include types
    bench('Validation Consolidated (1 call: analyze with all includes)', async () => {
      const response = await bridge.analyze(
        code,
        ['parse', 'introspect', 'diagnostics'],
        filename
      );
      trackPikeTime('Validation Consolidated', response.result);
      return response;
    });

    // Warm-up iteration to ensure JIT optimization before benchmarks run
    await bridge.analyze(code, ['introspect'], filename);
    await bridge.analyze(code, ['parse', 'introspect', 'diagnostics'], filename);
  });

  // PERF-13-04: Compilation Cache benchmark group
  // Measures the speedup from caching compiled programs
  group('Compilation Cache (Warm)', async () => {
    const cacheTestCode = fs.readFileSync(
      path.join(__dirname, 'fixtures/cache-test.pike'),
      'utf8'
    );
    const cacheTestFilename = 'cache-test.pike';

    // Warm up: First request always compiles (cache miss)
    await bridge.analyze(cacheTestCode, ['introspect'], cacheTestFilename, 1);

    // Benchmark: Repeated request with same version (cache hit)
    bench('Cache Hit: analyze with same document version', async () => {
      const response = await bridge.analyze(
        cacheTestCode,
        ['introspect'],
        cacheTestFilename,
        1  // Same version = cache hit
      );
      return response;
    });

    // Benchmark: Different version triggers recompile (cache miss)
    bench('Cache Miss: analyze with different version', async () => {
      const response = await bridge.analyze(
        cacheTestCode,
        ['introspect'],
        cacheTestFilename,
        999  // Different version = cache miss
      );
      return response;
    });

    // Benchmark: Closed file (no version) - uses stat for cache key
    bench('Closed File: analyze without version (stat-based key)', async () => {
      const response = await bridge.analyze(
        cacheTestCode,
        ['introspect'],
        cacheTestFilename,
        undefined  // No version = stat-based key
      );
      return response;
    });
  });

  // PERF-15-01: Cross-file cache verification
  group('Cross-File Cache Verification', async () => {
    const utilsCode = fs.readFileSync(
      path.join(__dirname, 'fixtures/cross-file/lib/utils.pike'),
      'utf8'
    );
    const mainCode = fs.readFileSync(
      path.join(__dirname, 'fixtures/cross-file/main.pike'),
      'utf8'
    );

    // First compile utils.pike directly to establish baseline
    await bridge.analyze(utilsCode, ['introspect'], 'lib/utils.pike', 1);

    // Benchmark: Compile main.pike (should inherit utils.pike from cache)
    bench('Cross-file: compile main with inherited utils', async () => {
      const response = await bridge.analyze(mainCode, ['introspect'], 'main.pike', 1);
      return response;
    });

    // Benchmark: Verify cache hit on recompile
    bench('Cross-file: recompile main (cache hit)', async () => {
      const response = await bridge.analyze(mainCode, ['introspect'], 'main.pike', 1);
      return response;
    });
  });

  // STDLIB-03: Stdlib performance benchmarks
  // Measures latency for introspecting stdlib modules - target: < 500ms
  await bridge.resolveStdlib('Stdio');

  group('Stdlib Performance (Warm)', () => {
    // Benchmark: Warm resolve (cached) for common modules
    bench('resolveStdlib("Stdio") - warm', async () => {
      const res = await bridge.resolveStdlib('Stdio');
      trackPikeTime('Stdlib: Stdio (warm)', res);
      return res;
    });

    bench('resolveStdlib("String")', async () => {
      const res = await bridge.resolveStdlib('String');
      trackPikeTime('Stdlib: String', res);
      return res;
    });

    bench('resolveStdlib("Array")', async () => {
      const res = await bridge.resolveStdlib('Array');
      trackPikeTime('Stdlib: Array', res);
      return res;
    });

    bench('resolveStdlib("Mapping")', async () => {
      const res = await bridge.resolveStdlib('Mapping');
      trackPikeTime('Stdlib: Mapping', res);
      return res;
    });

    // Benchmark: Nested module resolution
    bench('resolveStdlib("Stdio.File") - nested', async () => {
      const res = await bridge.resolveStdlib('Stdio.File');
      trackPikeTime('Stdlib: Stdio.File', res);
      return res;
    });

    // Benchmark: Another nested module for variety
    bench('resolveStdlib("String.SplitIterator") - nested', async () => {
      const res = await bridge.resolveStdlib('String.SplitIterator');
      trackPikeTime('Stdlib: String.SplitIterator', res);
      return res;
    });
  });

  // PERF-17-03: Responsiveness benchmarks
  // Measures user-perceived latency during typing and validation
  group('Responsiveness (Warm)', () => {
    // Benchmark: First keystroke response (user perception)
    bench('First diagnostic after document change', async () => {
      const start = Date.now();
      await bridge.analyze(mediumPike, ['introspect'], 'medium.pike', 1);
      return Date.now() - start;
    });

    // Benchmark: Validation with debounce delay (simulates post-typing validation)
    bench('Validation with 250ms debounce (default)', async () => {
      // Simulate waiting for debounce delay + validation
      const start = Date.now();
      await new Promise(resolve => setTimeout(resolve, 250));
      await bridge.analyze(mediumPike, ['introspect'], 'medium.pike', 2);
      return Date.now() - start;
    });

    // Benchmark: Rapid edit coalescing (multiple edits before debounce fires)
    bench('Rapid edit simulation (debounce coalescing)', async () => {
      // Simulate 5 rapid edits - only last one should trigger validation
      const start = Date.now();
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms between edits (faster than debounce)
        await bridge.analyze(mediumPike, ['introspect'], 'medium.pike', i + 1);
      }
      return Date.now() - start;
    });
  });

  group('Intelligence Operations (Warm)', () => {
    bench('Hover: resolveStdlib("Stdio.File")', async () => {
      const res = await bridge.resolveStdlib('Stdio.File');
      trackPikeTime('Hover: resolveStdlib', res);
    });

    bench('Hover: resolveModule("Stdio.File")', async () => {
      const res = await bridge.resolveModule('Stdio.File');
      trackPikeTime('Hover: resolveModule', res);
    });

    // PERF-003: Benchmark completion context with caching
    bench('Completion: getCompletionContext (Large File, Warm Cache)', async () => {
      // Use a different version to avoid cross-benchmark cache interference
      const res = await bridge.getCompletionContext(largePike, 20, 10, 'benchmark://large.pike', 1);
      trackPikeTime('Completion', res);
      return res;
    });

    // Different version = cache miss
    bench('Completion: getCompletionContext (Large File, Cold Cache)', async () => {
      const res = await bridge.getCompletionContext(largePike, 20, 10, 'benchmark://large.pike', 2);
      trackPikeTime('Completion (cold)', res);
      return res;
    });
  });

  const results = await run({
    format: process.env.MITATA_JSON ? 'json' : undefined,
    colors: !process.env.MITATA_JSON,
  });

  if (process.env.MITATA_JSON) {
    // If MITATA_JSON is a string (path), write to it, otherwise stdout
    if (process.env.MITATA_JSON !== '1') {
      fs.writeFileSync(process.env.MITATA_JSON, JSON.stringify(results, null, 2));
    } else {
      process.stdout.write(JSON.stringify(results, null, 2));
    }
  } else {
    console.log('\n--- Pike Internal Latency (Averages) ---');
    for (const [name, times] of Object.entries(pikeMetrics)) {
      if (times.length > 0) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        console.log(`${name.padEnd(40)}: ${avg.toFixed(3)} ms`);
      }
    }

    // PERF-011: Report startup phase breakdown
    if (startupPhases) {
      console.log('\n--- Pike Startup Phases (ms) ---');
      const phaseOrder = ['path_setup', 'version', 'handlers', 'context', 'total'];
      for (const phase of phaseOrder) {
        if (startupPhases[phase] !== undefined) {
          const value = startupPhases[phase];
          const displayPhase = phase.padEnd(12);
          console.log(`${displayPhase}: ${value.toFixed(3)} ms`);
        }
      }
    }

    // PERF-13-04: Report compilation cache statistics
    try {
      const cacheStats = await (bridge as any).sendRequest('get_cache_stats', {});
      if (cacheStats && !process.env.MITATA_JSON) {
        console.log('\n--- Compilation Cache Statistics ---');
        console.log(`Hits:        ${cacheStats.hits || 0}`);
        console.log(`Misses:      ${cacheStats.misses || 0}`);
        console.log(`Evictions:   ${cacheStats.evictions || 0}`);
        console.log(`Size:        ${cacheStats.size || 0} / ${cacheStats.max_files || 0} files`);
        const hitRate = cacheStats.hits > 0
          ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1)
          : '0.0';
        console.log(`Hit Rate:    ${hitRate}%`);
      }
    } catch (e) {
      // Handler may not be available yet
    }

    // PERF-15-01: Cross-file cache verification output
    if (!process.env.MITATA_JSON) {
      console.log('\n=== Cross-File Cache Verification ===');
      try {
        const cacheStats = await (bridge as any).sendRequest('get_cache_stats', {});
        console.log(`Files in cache: ${cacheStats.size || 0}`);
        console.log('Verification: Check if both main.pike and lib/utils.pike are cached');
        console.log('Expected: 2+ files (main.pike + lib/utils.pike) for cross-file caching');
      } catch (e) {
        console.log('Cache stats not available:', e);
      }
    }
  }

  await bridge.stop();
}

runBenchmarks().catch(console.error);
