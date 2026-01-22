import { run, bench, group, summary } from 'mitata';
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

    bench('Cold Start + First Request (getVersionInfo)', async () => {
      const bridge = new PikeBridge();
      await bridge.start();
      await bridge.getVersionInfo();
      await bridge.stop();
    });

    bench('Cold Start + Introspect', async () => {
      const bridge = new PikeBridge();
      await bridge.start();
      await bridge.introspect('int x;', 'test.pike');
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

  group('Validation Pipeline (Warm)', () => {
    const runValidation = async (code: string, filename: string, benchName: string) => {
      const results: any = {};
      results.introspect = await bridge.introspect(code, filename);
      results.parse = await bridge.parse(code, filename);
      results.analyze = await bridge.analyzeUninitialized(code, filename);
      trackPikeTime(benchName, results);
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

  group('Intelligence Operations (Warm)', () => {
    bench('Hover: resolveStdlib("Stdio.File")', async () => {
      const res = await bridge.resolveStdlib('Stdio.File');
      trackPikeTime('Hover: resolveStdlib', res);
    });

    bench('Hover: resolveModule("Stdio.File")', async () => {
      const res = await bridge.resolveModule('Stdio.File');
      trackPikeTime('Hover: resolveModule', res);
    });

    bench('Completion: getCompletionContext (Large File)', async () => {
      const res = await bridge.getCompletionContext(largePike, 20, 10);
      trackPikeTime('Completion', res);
    });
  });

  await run();

  console.log('\n--- Pike Internal Latency (Averages) ---');
  for (const [name, times] of Object.entries(pikeMetrics)) {
    if (times.length > 0) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`${name.padEnd(40)}: ${avg.toFixed(3)} ms`);
    }
  }

  await bridge.stop();
}

runBenchmarks().catch(console.error);
