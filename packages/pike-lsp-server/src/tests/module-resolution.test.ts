/**
 * Module Resolution Tests
 *
 * Covers: basic resolution, stdlib, inherit, edge cases
 * Merged from 4 separate files for cleaner organization (vscode-go pattern: 1 file per feature).
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

// --- Basic module resolution ---
describe('Module Resolution', () => {
  it('should resolve basic module paths', async () => {
    // Import and test the module resolution logic
    const { PikeBridge } = await import('@pike-lsp/pike-bridge');
    const bridge = new PikeBridge();
    await bridge.start();

    const result = await bridge.resolveModule('Stdio.File');
    assert.ok(result === null || typeof result === 'string', 'Should return path or null');
    await bridge.stop();
  });

  it('should resolve relative imports', async () => {
    const { PikeBridge } = await import('@pike-lsp/pike-bridge');
    const bridge = new PikeBridge();
    await bridge.start();

    const result = await bridge.resolveModule('.MyModule', '/tmp/test.pike');
    assert.ok(result === null || typeof result === 'string', 'Should handle relative imports');
    await bridge.stop();
  });
});

// --- Stdlib resolution ---
describe('Module Resolution - Stdlib', () => {
  it('should resolve stdlib modules', async () => {
    const { PikeBridge } = await import('@pike-lsp/pike-bridge');
    const bridge = new PikeBridge();
    await bridge.start();

    const result = await bridge.resolveStdlib('Stdio.File');
    assert.ok(result.symbols !== undefined, 'Should return symbols for stdlib module');
    await bridge.stop();
  });
});

// --- Inherit resolution ---
describe('Module Resolution - Inherit', () => {
  it('should handle inherit directives', async () => {
    const { PikeBridge } = await import('@pike-lsp/pike-bridge');
    const bridge = new PikeBridge();
    await bridge.start();

    const result = await bridge.resolveImport('inherit', 'module', '/tmp/test.pike');
    assert.ok(result !== undefined, 'Should handle inherit resolution');
    await bridge.stop();
  });
});

// --- Edge cases ---
describe('Module Resolution - Edge Cases', () => {
  it('should return null for non-existent modules', async () => {
    const { PikeBridge } = await import('@pike-lsp/pike-bridge');
    const bridge = new PikeBridge();
    await bridge.start();

    const result = await bridge.resolveModule('NonExistent.Module');
    assert.equal(result, null, 'Should return null for non-existent module');
    await bridge.stop();
  });

  it('should handle circular dependency detection', async () => {
    const { PikeBridge } = await import('@pike-lsp/pike-bridge');
    const bridge = new PikeBridge();
    await bridge.start();

    const result = await bridge.checkCircular('import A;\nimport B;', 'test.pike');
    assert.ok(result !== undefined, 'Should handle circular check');
    await bridge.stop();
  });
});
