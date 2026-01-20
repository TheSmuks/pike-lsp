/**
 * LSP Smoke Tests
 *
 * Fast validation that core LSP functionality works.
 * Used by pre-push hooks and CI for quick feedback.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('LSP Smoke Tests', { timeout: 30000 }, () => {
  let bridge: PikeBridge;

  before(async () => {
    bridge = new PikeBridge();
    await bridge.start();
    // Suppress stderr output during tests
    bridge.on('stderr', () => {});
  });

  after(async () => {
    if (bridge) {
      await bridge.stop();
    }
  });

  it('responds to parse request with symbol array', async () => {
    const result = await bridge.parse('int x;', 'test.pike');

    // Verify we got a result
    assert.ok(result, 'Parse should return a result');

    // Verify symbols is an array (may be empty, but must exist)
    assert.ok(Array.isArray(result.symbols), 'symbols should be an array');
  });

  it('responds to introspect request', async () => {
    const code = 'int x = 1;';
    const result = await bridge.introspect(code, 'test.pike');

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

    const result3 = await bridge.introspect('float c = 1.0;', 'test3.pike');
    assert.ok(result3);
  });
});
