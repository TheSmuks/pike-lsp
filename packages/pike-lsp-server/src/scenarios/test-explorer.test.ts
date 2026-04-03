import { describe, it } from 'bun:test';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import {
  discoverTestFunctions,
  getTestPattern,
  isTestFile,
} from '../features/testing/test-discovery.js';
import { buildRunnableCodeLensCommand } from '../utils/code-lens.js';

function check(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function method(name: string, line: number, column: number): PikeSymbol {
  return {
    name,
    kind: 'method',
    modifiers: [],
    position: { line, column },
  } as unknown as PikeSymbol;
}

describe('Scenario: test explorer workflow', () => {
  it('discovers test files and test functions', () => {
    check(isTestFile('file:///workspace/test_math.pike'), 'expected test file pattern to match');
    check(
      !isTestFile('file:///workspace/math.pike'),
      'expected non-test file pattern to not match'
    );

    const tests = discoverTestFunctions(
      [
        method('main', 1, 1),
        method('test_add', 5, 1),
        method('test_sub', 12, 1),
        method('helper', 20, 1),
      ],
      getTestPattern('^test_')
    );

    check(tests.length === 2, `expected 2 tests, got ${tests.length}`);
    check(
      tests[0]?.name === 'test_add',
      `expected first test to be test_add, got ${tests[0]?.name}`
    );
    check(
      tests[1]?.name === 'test_sub',
      `expected second test to be test_sub, got ${tests[1]?.name}`
    );
  });

  it('builds runnable commands for file and function tests', () => {
    const uri = 'file:///workspace/test_math.pike';
    const runFileTests = buildRunnableCodeLensCommand('run-file-tests', uri, '');
    const runSingleTest = buildRunnableCodeLensCommand('run-test', uri, 'test_add');

    check(runFileTests.command === 'pike.lsp.runFileTests', 'expected run-file-tests command id');
    check(
      JSON.stringify(runFileTests.arguments) === JSON.stringify([uri]),
      `expected run-file-tests arguments [uri], got ${JSON.stringify(runFileTests.arguments)}`
    );

    check(runSingleTest.command === 'pike.lsp.runTest', 'expected run-test command id');
    check(
      JSON.stringify(runSingleTest.arguments) === JSON.stringify([uri, 'test_add']),
      `expected run-test arguments [uri, test_add], got ${JSON.stringify(runSingleTest.arguments)}`
    );
  });
});
