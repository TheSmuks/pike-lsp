/**
 * ESM Compatibility Tests
 *
 * Tests that the bundled LSP server works correctly.
 * The extension passes analyzerPath explicitly, so auto-detection is not needed.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('ESM Compatibility', () => {
  it('LSP server accepts analyzerPath from initialization options', async () => {
    // This test checks that the bundled server.js accepts analyzerPath
    // from initialization options, which is how it's used in production
    const serverJsPath = join(__dirname, '../../../vscode-pike/server/server.js');

    // Skip test if bundled server doesn't exist yet (created in later CI step)
    if (!existsSync(serverJsPath)) {
      console.log('Bundled server not found (created in later CI step), skipping test');
      return;
    }

    const serverCode = readFileSync(serverJsPath, 'utf-8');

    // The bundled server should accept analyzerPath from init options
    // This avoids the need for runtime path discovery
    assert.ok(serverCode.includes('analyzerPath'),
      'server.js should accept analyzerPath from initialization options');

    // The server should handle initialization without crashing
    assert.ok(serverCode.includes('initializationOptions'),
      'server.js should handle initialization options');
  });

  it('LSP server supports ESM mode via import.meta.url', async () => {
    // The source code uses import.meta.url for ESM compatibility
    // Even if esbuild optimizes it away in the bundled version,
    // the source code must be ESM-compatible
    const bridgeSourcePath = join(__dirname, '../../../pike-bridge/src/bridge.ts');
    const bridgeSource = readFileSync(bridgeSourcePath, 'utf-8');

    // The bridge source must use import.meta.url (not __filename)
    assert.ok(bridgeSource.includes('import.meta.url'),
      'bridge.ts source should use import.meta.url for ESM compatibility');

    // Should NOT use __filename in the source
    assert.ok(!bridgeSource.includes('__filename'),
      'bridge.ts source should not use __filename (only works in CJS)');
  });
});
