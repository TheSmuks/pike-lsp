/**
 * Test Discovery Tests
 *
 * Tests for Pike test file and test function discovery.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import {
  isTestFile,
  discoverTestFunctions,
  getTestPattern,
} from '../../features/testing/test-discovery.js';

describe('Test Discovery', () => {
  describe('isTestFile', () => {
    it('should detect test.pike files', () => {
      assert.ok(isTestFile('file:///project/test.pike'));
      assert.ok(isTestFile('file:///project/src/test.pike'));
    });

    it('should detect _test.pike files', () => {
      assert.ok(isTestFile('file:///project/parser_test.pike'));
      assert.ok(isTestFile('file:///project/my_test.pike'));
    });

    it('should detect test_*.pike files', () => {
      assert.ok(isTestFile('file:///project/test_parser.pike'));
      assert.ok(isTestFile('file:///project/test_utils.pike'));
    });

    it('should detect -test.pike files', () => {
      assert.ok(isTestFile('file:///project/parser-test.pike'));
    });

    it('should detect tests.pike files', () => {
      assert.ok(isTestFile('file:///project/parser-tests.pike'));
      assert.ok(isTestFile('file:///project/tests.pike'));
    });

    it('should reject non-test files', () => {
      assert.ok(!isTestFile('file:///project/main.pike'));
      assert.ok(!isTestFile('file:///project/utils.pike'));
      assert.ok(!isTestFile('file:///project/parser.pike'));
      assert.ok(!isTestFile('file:///project/helper.pike'));
    });
  });

  describe('discoverTestFunctions', () => {
    it('should find test functions matching default pattern', () => {
      const symbols: PikeSymbol[] = [
        {
          name: 'test_something',
          kind: 'method',
          modifiers: ['public'],
          position: { file: '/test.pike', line: 5, column: 1 },
        },
        {
          name: 'test_another',
          kind: 'method',
          modifiers: ['public'],
          position: { file: '/test.pike', line: 10, column: 1 },
        },
        {
          name: 'regular_function',
          kind: 'method',
          modifiers: ['public'],
          position: { file: '/test.pike', line: 15, column: 1 },
        },
      ];

      const tests = discoverTestFunctions(symbols);
      assert.strictEqual(tests.length, 2);
      assert.strictEqual(tests[0].name, 'test_something');
      assert.strictEqual(tests[0].line, 5);
      assert.strictEqual(tests[1].name, 'test_another');
      assert.strictEqual(tests[1].line, 10);
    });

    it('should use custom pattern when provided', () => {
      const symbols: PikeSymbol[] = [
        {
          name: 'it_should_work',
          kind: 'method',
          modifiers: ['public'],
          position: { file: '/test.pike', line: 5, column: 1 },
        },
        {
          name: 'test_standard',
          kind: 'method',
          modifiers: ['public'],
          position: { file: '/test.pike', line: 10, column: 1 },
        },
      ];

      const tests = discoverTestFunctions(symbols, /^it_/);
      assert.strictEqual(tests.length, 1);
      assert.strictEqual(tests[0].name, 'it_should_work');
    });

    it('should return empty array when no test functions found', () => {
      const symbols: PikeSymbol[] = [
        {
          name: 'regular_function',
          kind: 'method',
          modifiers: ['public'],
          position: { file: '/test.pike', line: 5, column: 1 },
        },
      ];

      const tests = discoverTestFunctions(symbols);
      assert.strictEqual(tests.length, 0);
    });

    it('should only match methods, not other symbol kinds', () => {
      const symbols: PikeSymbol[] = [
        {
          name: 'test_variable',
          kind: 'variable',
          modifiers: ['int'],
          position: { file: '/test.pike', line: 5, column: 1 },
        },
        {
          name: 'test_constant',
          kind: 'constant',
          modifiers: ['constant'],
          position: { file: '/test.pike', line: 10, column: 1 },
        },
        {
          name: 'test_method',
          kind: 'method',
          modifiers: ['public'],
          position: { file: '/test.pike', line: 15, column: 1 },
        },
      ];

      const tests = discoverTestFunctions(symbols);
      assert.strictEqual(tests.length, 1);
      assert.strictEqual(tests[0].name, 'test_method');
    });

    it('should include range in test function', () => {
      const symbols: PikeSymbol[] = [
        {
          name: 'test_example',
          kind: 'method',
          modifiers: ['public'],
          position: { file: '/test.pike', line: 5, column: 3 },
        },
      ];

      const tests = discoverTestFunctions(symbols);
      assert.strictEqual(tests.length, 1);
      assert.strictEqual(tests[0].range.start.line, 4);
      assert.strictEqual(tests[0].range.start.character, 2);
      assert.strictEqual(tests[0].range.end.line, 4);
      assert.strictEqual(tests[0].range.end.character, 2 + 'test_example'.length);
    });
  });

  describe('getTestPattern', () => {
    it('should return default pattern when no config', () => {
      const pattern = getTestPattern(undefined);
      assert.ok(pattern.test('test_something'));
      assert.ok(!pattern.test('regular_function'));
    });

    it('should return default pattern when empty string', () => {
      const pattern = getTestPattern('');
      assert.ok(pattern.test('test_something'));
    });

    it('should use custom pattern when provided', () => {
      const pattern = getTestPattern('^it_');
      assert.ok(pattern.test('it_should_work'));
      assert.ok(!pattern.test('test_standard'));
    });

    it('should fall back to default on invalid regex', () => {
      const pattern = getTestPattern('[invalid');
      assert.ok(pattern.test('test_something'));
    });
  });
});
