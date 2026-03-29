/**
 * Test Discovery Module
 *
 * Provides automatic detection of Pike test files and test functions.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Range } from 'vscode-languageserver/node.js';

export interface TestFunction {
  name: string;
  range: Range;
  line: number;
}

const TEST_FILE_PATTERNS = [
  /test\.pike$/,
  /_test\.pike$/,
  /test_.*\.pike$/,
  /-test\.pike$/,
  /tests\.pike$/,
];

const DEFAULT_TEST_FUNCTION_PATTERN = /^test_/;

export function isTestFile(uri: string): boolean {
  const filename = uri.split('/').pop() ?? '';
  return TEST_FILE_PATTERNS.some(pattern => pattern.test(filename));
}

export function discoverTestFunctions(
  symbols: PikeSymbol[],
  pattern: RegExp = DEFAULT_TEST_FUNCTION_PATTERN
): TestFunction[] {
  const tests: TestFunction[] = [];

  for (const symbol of symbols) {
    if (symbol.kind === 'method' && symbol.name && pattern.test(symbol.name)) {
      const line = symbol.position?.line ?? 1;
      const column = symbol.position?.column ?? 1;

      tests.push({
        name: symbol.name,
        line,
        range: {
          start: { line: line - 1, character: column - 1 },
          end: { line: line - 1, character: column - 1 + symbol.name.length },
        },
      });
    }
  }

  return tests;
}

export function getTestPattern(configuredPattern?: string): RegExp {
  if (configuredPattern && configuredPattern.length > 0) {
    try {
      return new RegExp(configuredPattern);
    } catch {
      return DEFAULT_TEST_FUNCTION_PATTERN;
    }
  }
  return DEFAULT_TEST_FUNCTION_PATTERN;
}
