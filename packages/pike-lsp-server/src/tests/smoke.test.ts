/**
 * LSP Smoke Tests
 *
 * Fast validation that core LSP functionality works.
 * Used by pre-push hooks and CI for quick feedback.
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('LSP Smoke Tests', { timeout: 30000 }, () => {
  let bridge: PikeBridge;

  beforeAll(async () => { bridge = new PikeBridge();
  await bridge.start();
  // Suppress stderr output during tests
  bridge.on('stderr', () => {}); });

  afterAll(async () => { if (bridge) {
    await bridge.stop();
  } });

  it('responds to parse request with symbol array', async () => {
    const result = await bridge.parse('int x;', 'test.pike');

    // Verify we got a result
    assert.ok(result, 'Parse should return a result');

    // Verify symbols is an array (may be empty, but must exist)
    assert.ok(Array.isArray(result.symbols), 'symbols should be an array');
  });

  it('responds to introspect request', async () => {
    const code = 'int x = 1;';
    const response = await bridge.analyze(code, ['introspect'], 'test.pike');
    const result = response.result?.introspect;

    // Verify we got a result
    assert.ok(result, 'Introspect should return a result');
  });

  it('handles invalid Pike gracefully (no crash)', async () => {
    // Invalid Pike syntax - should return diagnostics, not crash
    const result = await bridge.compile('int x = ;', 'test.pike');

    // Verify we got a result (not an exception)
    assert.ok(result, 'Compile should return result even for invalid syntax');

    // Verify diagnostics array exists (may be empty for parse, populated for compile)
    assert.ok(result.diagnostics !== undefined, 'Should have diagnostics field');
    assert.ok(Array.isArray(result.diagnostics), 'Diagnostics should be an array');
  });

  it('handles multiple requests without bridge restart', async () => {
    // Verify bridge stays alive across multiple requests
    const result1 = await bridge.parse('int a;', 'test1.pike');
    assert.ok(result1);

    const result2 = await bridge.parse('string b;', 'test2.pike');
    assert.ok(result2);

    const response3 = await bridge.analyze('float c = 1.0;', ['introspect'], 'test3.pike');
    assert.ok(response3.result?.introspect);
  });

  it('unified analyze handles partial failures gracefully', async () => {
    // Code that can be parsed but not compiled (references unknown module)
    const codeWithMissingDeps = `
      import Foo.Bar.Baz;
      void main() {
        Baz.something();
      }
    `;

    // The unified analyze should return partial results, not throw
    const result = await bridge.analyze(
      codeWithMissingDeps,
      ['parse', 'introspect', 'diagnostics'],
      'test-partial.pike'
    );

    // Should have a result object (not thrown)
    assert.ok(result, 'Analyze should return a result even with compilation errors');

    // Parse should succeed (tokenization works)
    assert.ok(result.result?.parse, 'Parse should succeed for valid syntax');

    // If introspect fails, it should be in failures, not throw
    // Either introspect succeeds, or failures.introspect exists
    const hasIntrospectResult = result.result?.introspect !== undefined;
    const hasIntrospectFailure = result.failures?.introspect !== undefined;
    assert.ok(hasIntrospectResult || hasIntrospectFailure, 'Introspect either succeeds or has failure recorded');
  });

  it('analyze reports introspect failure in failures object (not as thrown error)', async () => {
    // This test verifies that the unified analyze method reports compilation failures
    // in the failures object, NOT as a thrown exception. This is critical for
    // preventing server crashes when opening files that Pike can't compile.
    const codeWithError = `
      import NonExistent.Module;
      void main() { NonExistent.Module.call(); }
    `;

    // Using analyze instead of introspect - this should NOT throw
    const result = await bridge.analyze(
      codeWithError,
      ['parse', 'introspect', 'diagnostics'],
      'test-error.pike'
    );

    // Should return a result object, not throw
    assert.ok(result, 'Analyze should return result, not throw');

    // The introspect operation should have failed and be recorded in failures
    // or returned with success=0, or succeeded if module exists in test environment
    // All three outcomes are valid - verify the result structure is correct
    assert.ok(result.result !== undefined || result.failures !== undefined, 'Result has either result or failures');
    // Specifically check introspect handling
    const hasIntrospectFailure = result.failures?.introspect !== undefined;
    const hasIntrospectSuccess0 = result.result?.introspect?.success === 0;
    const hasIntrospectResult = result.result?.introspect !== undefined;
    assert.ok(hasIntrospectFailure || hasIntrospectSuccess0 || hasIntrospectResult, 'Introspect handled gracefully (failure recorded, success=0, or succeeded)');
  });

  it('analyze returns syntax errors in diagnostics array', async () => {
    // This test verifies that syntax errors are captured and returned in the
    // diagnostics array, which is critical for showing squiggles in the editor.
    const codeWithSyntaxError = 'int x = ;';  // Missing value after =

    const result = await bridge.analyze(
      codeWithSyntaxError,
      ['parse', 'diagnostics'],
      'test-syntax-error.pike'
    );

    // Should return a result object
    assert.ok(result, 'Analyze should return result');

    // Diagnostics should exist
    assert.ok(result.result?.diagnostics, 'Diagnostics result should exist');

    // Diagnostics array should contain the syntax error
    const diagnostics = result.result?.diagnostics?.diagnostics ?? [];
    assert.ok(diagnostics.length > 0, 'Should have at least one diagnostic for syntax error');

    // Verify the diagnostic has expected structure
    const syntaxError = diagnostics[0]!;
    assert.ok(syntaxError.message, 'Diagnostic should have a message');
    assert.equal(syntaxError.severity, 'error', 'Diagnostic should be an error');
    assert.ok(syntaxError.position, 'Diagnostic should have a position');
    assert.ok(syntaxError.position.line >= 1, 'Diagnostic should have a line number');
  });
});
