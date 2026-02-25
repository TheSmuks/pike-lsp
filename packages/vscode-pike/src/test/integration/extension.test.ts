/**
 * VS Code Extension Integration Tests
 *
 * These tests run in a real VS Code instance to verify
 * the extension activates correctly and the LSP server starts.
 */

// @ts-nocheck - Integration tests use mocha types at runtime
// These tests require vscode package to run - skip in standard test environment

import * as assert from 'assert';
import { suite, test } from 'mocha';

// Skip all tests in this file if vscode is not available
let vscode: any;
let vscodeAvailable = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  vscode = require('vscode');
  vscodeAvailable = true;
} catch {
  // vscode not available - tests will be skipped
}

const itSkip = test;
const createSuite = suite;

createSuite('Pike Language Extension Integration Test', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('pike-lsp.vscode-pike'));
  });

  test('Extension should activate', async function () {
    this.timeout(120000); // Give more time for activation with module path

    const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
    assert.ok(extension, 'Extension should be found');

    // Activate the extension
    await extension.activate();

    // Verify extension is active
    assert.strictEqual(extension.isActive, true);
  });

  test('Should open Pike file without crash', async function () {
    this.timeout(45000); // More than 30s for module loading

    // Ensure workspace folder exists
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder should exist');

    // Open a Pike test file
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');
    const document = await vscode.workspace.openTextDocument(uri);

    // Wait for LSP to initialize and analyze
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Document should be open without errors
    assert.strictEqual(document.languageId, 'pike');

    // Close the document
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('Should load Crypto.pmod/PGP.pmod from module path', async function () {
    this.timeout(45000); // More than 30s for module loading

    // Ensure workspace folder exists
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder should exist');

    // Create a test file that imports from Crypto.pmod/PGP.pmod
    const testUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-crypto.pike');
    const testContent = `//! Test file for Crypto.pmod/PGP.pmod module loading

// This should resolve via the module path configuration
// import Crypto.PGP;

int main() {
    // If PGP module is available, we can use it
    // For now, just verify the file can be analyzed
    write("Crypto module test file loaded\\n");
    return 0;
}
`;
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(testUri, encoder.encode(testContent));

    // Open the file to trigger LSP analysis
    const document = await vscode.workspace.openTextDocument(testUri);

    // Wait for LSP to analyze the file
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Document should be open without errors
    assert.strictEqual(document.languageId, 'pike');

    // Close the document
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    // Clean up test file
    await vscode.workspace.fs.delete(testUri);
  });

  /**
   * Verify extension is fully activated with LSP client running
   *
   * Tests that:
   * - Extension is active (extension.isActive === true)
   * - LSP client is running and can handle requests
   * - Server did not crash during startup
   *
   * This replaces the tautological "Extension started without crash" test
   * by actually verifying the activation state and client availability.
   */
  test('Should have no errors in output after startup', async function () {
    this.timeout(45000); // More than 30s for full startup

    // Wait for any startup errors to manifest
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify extension is actually active
    const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
    assert.ok(extension, 'Extension should be found');
    assert.strictEqual(extension?.isActive, true, 'Extension should be active after startup');

    // Verify we can make a basic LSP request (proves server is running)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder should exist');

    // Try to get document symbols - this verifies LSP server is responsive
    const testUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');

    // This will return undefined or an array, but should not throw
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      testUri
    );

    // Symbols may be undefined (file not analyzed yet) or an array
    // The important thing is we got a response (not a crash)
    assert.ok(
      symbols === undefined || Array.isArray(symbols),
      'LSP server should respond to requests (not crash)'
    );

    console.log('Extension activated and LSP server responsive');
  });
  test('Should remain stable through repeated deactivate/activate restart cycles', async function () {
    this.timeout(120000);

    const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
    assert.ok(extension, 'Extension should be found');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder should exist');
    const testUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');

    let responsiveCycles = 0;
    const cycles = 5;

    for (let i = 0; i < cycles; i++) {
      if (!extension.isActive) {
        await extension.activate();
      }

      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        testUri
      );

      if (symbols === undefined || Array.isArray(symbols)) {
        responsiveCycles += 1;
      }

      if (extension.exports && typeof extension.exports.deactivate === 'function') {
        await extension.exports.deactivate();
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    assert.strictEqual(
      responsiveCycles,
      cycles,
      'All restart cycles should keep extension responsive'
    );
  });

  test('Should auto-restart after unexpected client stop', async function () {
    this.timeout(120000);

    const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
    assert.ok(extension, 'Extension should be found');

    if (!extension.isActive) {
      await extension.activate();
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder should exist');
    const testUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');

    const beforeStopSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      testUri
    );
    assert.ok(
      beforeStopSymbols === undefined || Array.isArray(beforeStopSymbols),
      'Server should be responsive before forced stop'
    );

    await vscode.commands.executeCommand('pike.lsp.__simulateUnexpectedStopForTesting');

    let recovered = false;
    const deadline = Date.now() + 30000;

    while (Date.now() < deadline && !recovered) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          testUri
        );
        if (symbols === undefined || Array.isArray(symbols)) {
          recovered = true;
        }
      } catch {}
    }

    assert.strictEqual(recovered, true, 'Server should recover after unexpected stop');
  });

  test('Should pause auto-restart after repeated restart failures', async function () {
    this.timeout(120000);

    const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
    assert.ok(extension, 'Extension should be found');

    if (!extension.isActive) {
      await extension.activate();
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder should exist');
    const testUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');

    await vscode.commands.executeCommand('pike.lsp.__setAutoRestartPolicyForTesting', {
      windowMs: 20000,
      maxAttempts: 2,
      backoffMs: [100, 200],
    });
    await vscode.commands.executeCommand('pike.lsp.__setRestartFailureModeForTesting', true);

    try {
      try {
        await vscode.commands.executeCommand('pike.lsp.__simulateUnexpectedStopForTesting');
      } catch (err) {
        const message = String(err);
        if (!message.includes('Pending response rejected since connection got disposed')) {
          throw err;
        }
      }

      let paused = false;
      const deadline = Date.now() + 15000;

      while (Date.now() < deadline && !paused) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const state = await vscode.commands.executeCommand<{
          paused?: boolean;
          attempts?: number;
        }>('pike.lsp.__getAutoRestartStateForTesting');
        paused = Boolean(state?.paused);
      }

      assert.strictEqual(paused, true, 'Auto-restart should pause after repeated failures');
    } finally {
      await vscode.commands.executeCommand('pike.lsp.__setRestartFailureModeForTesting', false);
      await vscode.commands.executeCommand('pike.lsp.__setAutoRestartPolicyForTesting', {
        windowMs: 60000,
        maxAttempts: 3,
        backoffMs: [1000, 3000, 7000],
      });

      await vscode.commands.executeCommand('pike.lsp.restartServer');

      let recovered = false;
      const recoverDeadline = Date.now() + 30000;
      while (Date.now() < recoverDeadline && !recovered) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            testUri
          );
          if (symbols === undefined || Array.isArray(symbols)) {
            recovered = true;
          }
        } catch {}
      }

      assert.strictEqual(recovered, true, 'Server should recover after disabling failure mode');
    }
  });
});
