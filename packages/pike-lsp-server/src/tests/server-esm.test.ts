/**
 * ESM Compatibility Tests
 *
 * Tests that the LSP server works correctly in ESM mode where __filename is not defined.
 * This test file should FAIL before the fix and PASS after.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('ESM Compatibility', () => {
  it('LSP server does not use CommonJS __filename', async () => {
    // This test checks that the compiled server.js doesn't use __filename
    // which is not available in ESM mode
    const serverJsPath = join(__dirname, '../server.js');
    const serverCode = readFileSync(serverJsPath, 'utf-8');

    // Before fix: server.js will contain "__filename"
    // After fix: server.js should use import.meta.url instead
    if (serverCode.includes('__filename')) {
      assert.fail(`server.js uses CommonJS __filename which is not defined in ESM mode.
The server will fail to start with: "__filename is not defined"

Found at: ${serverJsPath}`);
    }

    // After fix: should use import.meta.url
    assert.ok(serverCode.includes('import.meta.url'),
      'server.js should use import.meta.url for ESM compatibility');
  });
});
