/**
 * Roxen diagnostics error-path scenarios.
 *
 * Tests provideRoxenDiagnostics through its public API:
 * - Bridge throws an error
 * - Bridge returns error field in result
 * - Bridge returns valid diagnostics (conversion correctness)
 * - Debounce cancellation
 * - Bridge returns empty diagnostics
 */

import { describe, it, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { provideRoxenDiagnostics } from '../features/roxen/diagnostics.js';
import type { RoxenValidationResult, RoxenDiagnostic } from '../features/roxen/types.js';

type MockBridge = {
  roxenValidate: (
    code: string,
    filename: string,
    moduleInfo?: Record<string, unknown>
  ) => Promise<RoxenValidationResult>;
};

function makeBridge(result: RoxenValidationResult): MockBridge {
  return { roxenValidate: (_code: string, _filename: string) => Promise.resolve(result) };
}

function makeFailingBridge(error: Error): MockBridge {
  return { roxenValidate: (_code: string, _filename: string) => Promise.reject(error) };
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe('provideRoxenDiagnostics', () => {
  afterEach(async () => {
    // Let pending debounce timers settle
    await wait(50);
  });

  it('returns empty array when bridge throws an error', async () => {
    const bridge = makeFailingBridge(new Error('Bridge process crashed'));
    const result = await provideRoxenDiagnostics('file:///test.pike', 'code', bridge, 0);
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when bridge returns error field in result', async () => {
    const bridge = makeBridge({
      error: { code: 1, message: 'Internal Pike error' },
    });
    const result = await provideRoxenDiagnostics('file:///test.pike', 'code', bridge, 0);
    assert.deepStrictEqual(result, []);
  });

  it('converts valid diagnostics from 1-based to 0-based LSP positions', async () => {
    const roxenDiags: RoxenDiagnostic[] = [
      { line: 1, column: 5, severity: 'error', message: 'expected ;' },
      { line: 10, column: 1, severity: 'warning', message: 'unused variable' },
      { line: 3, column: 20, severity: 'info', message: 'suggestion' },
    ];
    const bridge = makeBridge({ diagnostics: roxenDiags });
    const result = await provideRoxenDiagnostics('file:///test.pike', 'code', bridge, 0);

    assert.equal(result.length, 3);

    const d0 = result[0]!;
    assert.equal(d0.range.start.line, 0); // 1-based -> 0-based
    assert.equal(d0.range.start.character, 4);
    assert.equal(d0.severity, 1); // error = 1
    assert.equal(d0.message, 'expected ;');
    assert.equal(d0.source, 'roxen');

    const d1 = result[1]!;
    assert.equal(d1.range.start.line, 9);
    assert.equal(d1.range.start.character, 0);
    assert.equal(d1.severity, 2); // warning = 2

    const d2 = result[2]!;
    assert.equal(d2.severity, 3); // info = 3
  });

  it('returns empty array when bridge returns no diagnostics', async () => {
    const bridge = makeBridge({ diagnostics: [] });
    const result = await provideRoxenDiagnostics('file:///test.pike', 'code', bridge, 0);
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when bridge returns undefined diagnostics', async () => {
    const bridge = makeBridge({});
    const result = await provideRoxenDiagnostics('file:///test.pike', 'code', bridge, 0);
    assert.deepStrictEqual(result, []);
  });

  it('handles line 0 from bridge by clamping to 0', async () => {
    const roxenDiags: RoxenDiagnostic[] = [
      { line: 0, column: 0, severity: 'error', message: 'bad position' },
    ];
    const bridge = makeBridge({ diagnostics: roxenDiags });
    const result = await provideRoxenDiagnostics('file:///test.pike', 'code', bridge, 0);

    const d = result[0]!;
    assert.equal(d.range.start.line, 0);
    assert.equal(d.range.start.character, 0);
  });

  it('forwards moduleInfo to bridge', async () => {
    let receivedModuleInfo: Record<string, unknown> | undefined;
    const bridge: MockBridge = {
      roxenValidate(_code, _filename, moduleInfo?) {
        receivedModuleInfo = moduleInfo;
        return Promise.resolve({ diagnostics: [] });
      },
    };
    const moduleInfo = { module_type: ['MODULE_TAG'], module_name: 'test' };
    await provideRoxenDiagnostics('file:///test.pike', 'code', bridge, 0, moduleInfo);
    assert.deepStrictEqual(receivedModuleInfo, moduleInfo);
  });

  it('resolves previous caller with empty array on debounce cancellation', async () => {
    const bridge = makeBridge({ diagnostics: [] });
    const uri = 'file:///debounce.pike';

    // First call with large debounce
    const first = provideRoxenDiagnostics(uri, 'code1', bridge, 100);

    // Second call should cancel first
    const second = provideRoxenDiagnostics(uri, 'code2', bridge, 100);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.deepStrictEqual(firstResult, [], 'Cancelled call should resolve with empty array');
    assert.deepStrictEqual(secondResult, [], 'Second call should resolve with diagnostics');
  });
});
