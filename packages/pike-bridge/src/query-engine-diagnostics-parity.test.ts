import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

function percentile95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

describe('Query engine diagnostics parity', () => {
  let bridge: PikeBridge;

  before(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Tests require Pike to be installed.');
    }
    await bridge.start();
  });

  after(async () => {
    await bridge.stop();
  });

  it('maintains >=99% diagnostics shadow parity with analyze fallback', async () => {
    const codeSamples = [
      'int x = 1;\n',
      'int x = ;\n',
      'void f() {\n  string s;\n  write(s);\n}\n',
      'class A { int y = 2; }\n',
      'void g() {\n  int z = 1 + ;\n}\n',
    ];

    let compared = 0;
    let matches = 0;

    for (let i = 0; i < codeSamples.length; i++) {
      const text = codeSamples[i] ?? '';
      const uri = `file:///tmp/qe2-parity-${i}.pike`;
      const filename = `/tmp/qe2-parity-${i}.pike`;
      const version = i + 1;
      const requestId = `qe2-parity-${i}`;

      const qeResponse = await bridge.engineQuery({
        feature: 'diagnostics',
        requestId,
        snapshot: { mode: 'latest' },
        queryParams: {
          uri,
          filename,
          version,
          text,
        },
      });

      const analyzeResponse = await bridge.analyze(
        text,
        ['parse', 'introspect', 'diagnostics', 'tokenize'],
        filename,
        version
      );

      const qeAnalyze = qeResponse.result['analyzeResult'] as
        | { result?: { diagnostics?: { diagnostics?: unknown[] } } }
        | undefined;
      const qeDiagnostics = qeAnalyze?.result?.diagnostics?.diagnostics ?? [];
      const analyzeDiagnostics = analyzeResponse.result?.diagnostics?.diagnostics ?? [];

      compared += 1;
      if (qeDiagnostics.length === analyzeDiagnostics.length) {
        matches += 1;
      }
    }

    const parity = compared > 0 ? matches / compared : 0;
    assert.ok(
      parity >= 0.99,
      `Expected diagnostics parity >= 99%, got ${(parity * 100).toFixed(2)}%`
    );
  });

  it('keeps diagnostics query p95 latency non-regressing against analyze baseline', async () => {
    const text = 'int x = 1;\nvoid f() {\n  int y = x + 1;\n}\n';
    const iterations = 25;
    const qeDurations: number[] = [];
    const baselineDurations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const filename = `/tmp/qe2-p95-${i}.pike`;
      const uri = `file:///tmp/qe2-p95-${i}.pike`;
      const version = i + 1;

      const baselineStart = performance.now();
      await bridge.analyze(
        text,
        ['parse', 'introspect', 'diagnostics', 'tokenize'],
        filename,
        version
      );
      baselineDurations.push(performance.now() - baselineStart);

      const qeStart = performance.now();
      await bridge.engineQuery({
        feature: 'diagnostics',
        requestId: `qe2-p95-${i}`,
        snapshot: { mode: 'latest' },
        queryParams: {
          uri,
          filename,
          version,
          text,
        },
      });
      qeDurations.push(performance.now() - qeStart);
    }

    const baselineP95 = percentile95(baselineDurations);
    const qeP95 = percentile95(qeDurations);
    const regressionBudget = baselineP95 * 2.0;

    assert.ok(
      qeP95 <= regressionBudget,
      `Expected diagnostics query p95 <= ${regressionBudget.toFixed(2)}ms, got ${qeP95.toFixed(2)}ms (baseline p95 ${baselineP95.toFixed(2)}ms)`
    );
  });
});
