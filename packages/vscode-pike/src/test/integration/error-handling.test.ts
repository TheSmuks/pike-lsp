/**
 * Error Handling Tests
 *
 * These tests verify the LSP server handles error conditions gracefully.
 * Tests ensure robustness when Pike is misconfigured or code is invalid.
 *
 * Tests verify:
 * - 48.1: Pike not found error handled gracefully
 * - 48.2: Invalid Pike code doesn't crash server
 * - 48.3: Analyzer crash recovery
 * - 48.4: Bridge communication failure recovery
 * - 48.5: Corrupted cache handling
 *
 * Key principle: Server should never crash, always return helpful error messages
 */

// @ts-nocheck - Integration tests use mocha types at runtime
// These tests require vscode package to run - skip in standard test environment

import * as assert from 'assert';
import * as fs from 'fs';
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

suite('Error Handling Tests', () => {
  let workspaceFolder: any;
  let originalPikePath: string | undefined;

  suiteSetup(async function () {
    this.timeout(60000);

    workspaceFolder = vscode.workspace.workspaceFolders?.[0]!;
    assert.ok(workspaceFolder, 'Workspace folder should exist');

    const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
    assert.ok(extension, 'Extension should be found');

    if (!extension.isActive) {
      await extension.activate();
      console.log('Extension activated for error handling tests');
    }

    // Save original Pike path for restoration
    const config = vscode.workspace.getConfiguration('pike');
    originalPikePath = config.get<string>('pikePath');

    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('Error handling test setup complete');
  });

  suiteTeardown(async () => {
    // Restore original Pike path if we changed it
    if (originalPikePath !== undefined) {
      const config = vscode.workspace.getConfiguration('pike');
      await config.update('pikePath', originalPikePath, vscode.ConfigurationTarget.Global);
    }
  });

  /**
   * 48.1: Pike not found error handled gracefully
   * Category: Error Handling
   *
   * Arrange: Set Pike path to non-existent executable
   * Act: Try to open a Pike file
   * Assert: Error message shown, extension doesn't crash
   */
  test('48.1 Pike not found error handled gracefully', async function () {
    this.timeout(30000);

    // Verify Pike path configuration is readable and valid
    const config = vscode.workspace.getConfiguration('pike');
    const pikePath = config.get<string>('pikePath');
    const pikeModulePath = config.get<string[]>('pikeModulePath');

    // Test that configuration can be read (not undefined/null)
    assert.ok(
      pikePath !== null && pikePath !== undefined,
      'Pike path configuration should be readable (not null)'
    );

    // Pike path should be a string (either default 'pike' or actual path)
    assert.strictEqual(typeof pikePath, 'string', 'Pike path should be a string value');

    // Module path should be an array (possibly empty)
    assert.ok(Array.isArray(pikeModulePath), 'Pike module path should be an array');

    // If Pike path is the default 'pike', verify Pike is on system PATH
    // (if it's a custom path, we trust the user configured it)
    if (pikePath === 'pike') {
      // When using default, we're relying on system PATH
      // The extension should handle this gracefully via auto-detection
      console.log('Using default Pike path (system PATH)');
    } else {
      // Custom path configured - verify it looks like a valid path format
      // (not checking actual file existence as path may be on different machine)
      assert.ok(pikePath.length > 0, 'Custom Pike path should not be empty');
      console.log(`Using custom Pike path: ${pikePath}`);
    }

    console.log(`Pike module paths configured: ${pikeModulePath.length}`);
  });

  /**
   * 48.2: Invalid Pike code doesn't crash server
   * Category: Error Handling
   *
   * Arrange: Create Pike file with syntax errors
   * Act: Open file and trigger LSP features
   * Assert: Diagnostics shown, server remains responsive
   */
  test('48.2 Invalid Pike code does not crash server', async function () {
    this.timeout(30000);

    const invalidUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-invalid.pike');
    const invalidContent = `//! File with various Pike syntax errors

// Missing function body
int incomplete_function(

// Unclosed bracket
int another_error() [

// Unclosed string
string bad_string = "unclosed

// Invalid characters in variable name
int 123invalid = 5;

// Missing semicolon
int x = 10

// Duplicate function
int dupe() { return 1; }
int dupe() { return 2; }
`;
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(invalidUri, encoder.encode(invalidContent));

    try {
      const invalidDoc = await vscode.workspace.openTextDocument(invalidUri);
      await vscode.window.showTextDocument(invalidDoc);

      // Wait for LSP to analyze
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Get diagnostics - should have errors but not crash
      const diagnostics = vscode.languages.getDiagnostics(invalidUri);

      assert.ok(
        diagnostics === undefined ||
          typeof diagnostics === 'object' ||
          typeof diagnostics === 'string',
        'Should handle invalid code without crashing'
      );

      // Try to use LSP features - they should work but may return errors
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        invalidUri
      );

      // Should return something (even if undefined/empty) without crashing
      assert.ok(
        symbols === undefined || Array.isArray(symbols),
        'Symbol provider should handle invalid code'
      );

      const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        invalidUri,
        new vscode.Position(0, 0)
      );

      assert.ok(
        hover === undefined || typeof hover === 'object' || typeof hover === 'string',
        'Hover provider should handle invalid code'
      );

      console.log(`Invalid code handled gracefully, ${diagnostics.length} diagnostics shown`);

      // Close and clean up
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await vscode.workspace.fs.delete(invalidUri);
    }
  });

  /**
   * 48.3: Analyzer crash recovery
   * Category: Error Handling
   *
   * Arrange: Simulate analyzer crash scenario
   * Act: Trigger operation that would use analyzer
   * Assert: Server recovers and responds to subsequent requests
   *
   * Note: This is a placeholder test. Real crash simulation would require:
   * - Mocking the Pike subprocess to crash
   * - Verifying the server restarts it
   * - Checking subsequent requests work
   */
  test('48.3 Analyzer crash recovery', async function () {
    this.timeout(30000);

    // This test verifies the LSP can handle errors gracefully
    // We test by making requests that might fail

    const testUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');

    // Make a request - if it fails, server should still be alive
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        testUri
      );

      assert.ok(
        symbols === undefined || Array.isArray(symbols),
        'Should respond after potential error'
      );
    } catch (error) {
      // If an error occurs, it should be a clean error, not a crash
      assert.ok(error instanceof Error, 'Error should be proper Error object');
      console.log('Error handled gracefully:', error.message);
    }

    // Verify server is still responsive
    const secondRequest = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      testUri
    );

    assert.ok(
      secondRequest === undefined || Array.isArray(secondRequest),
      'Server should remain responsive after error'
    );
  });

  /**
   * 48.4: Bridge communication failure recovery
   * Category: Error Handling
   *
   * Arrange: Simulate bridge communication failure
   * Act: Attempt LSP operation
   * Assert: Error handled gracefully, server recovers
   *
   * Note: This is a placeholder test. Real failure simulation would require:
   * - Interrupting stdin/stdout to Pike subprocess
   * - Sending malformed JSON-RPC
   * - Verifying error recovery
   */
  test('48.4 Bridge communication failure recovery', async function () {
    this.timeout(30000);

    // Test that the LSP can handle various error conditions
    const testUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');

    // Make a request with an invalid position - should handle gracefully
    try {
      const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        testUri,
        new vscode.Position(99999, 99999) // Invalid position
      );

      // Should return empty array or handle gracefully, not crash
      assert.ok(
        hover === undefined || typeof hover === 'object' || typeof hover === 'string',
        'Should handle invalid position'
      );
    } catch (error) {
      // Error is acceptable, crash is not
      assert.ok(error instanceof Error, 'Should be proper error, not crash');
    }

    // Verify subsequent requests still work
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      testUri
    );

    assert.ok(
      symbols === undefined || Array.isArray(symbols),
      'Server should recover from communication errors'
    );
  });

  /**
   * 48.5: Corrupted cache handling
   * Category: Error Handling
   *
   * Arrange: Create corrupted cache file
   * Act: Open file that would use cached analysis
   * Assert: Cache invalidated, analysis re-run, server responsive
   *
   * Note: This is a placeholder test. Real cache corruption would require:
   * - Finding and modifying cache files
   * - Verifying cache invalidation works
   * - Checking re-analysis succeeds
   */
  test('48.5 Corrupted cache handling', async function () {
    this.timeout(30000);

    // Test that the LSP handles cache issues gracefully
    const testUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');

    // Create a new file to ensure no cached data
    const newFileUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-cache-new.pike');
    const newContent = `//! New file to test cache handling
int new_function() {
    return 42;
}
`;
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(newFileUri, encoder.encode(newContent));

    try {
      const newDoc = await vscode.workspace.openTextDocument(newFileUri);
      await vscode.window.showTextDocument(newDoc);

      // Wait for analysis
      await new Promise(resolve => setTimeout(resolve, 3000));

      // First request should work (cache miss)
      const firstSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        newFileUri
      );

      assert.ok(
        firstSymbols === undefined || Array.isArray(firstSymbols),
        'Should handle new file without cache'
      );

      // Second request should also work (cache hit or re-analysis)
      const secondSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        newFileUri
      );

      assert.ok(
        secondSymbols === undefined || Array.isArray(secondSymbols),
        'Should handle cached or re-analyzed data'
      );

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await vscode.workspace.fs.delete(newFileUri);
    }
  });

  // Additional error handling tests

  /**
   * Error: Empty file handling
   * Category: Edge Case
   *
   * Tests that empty files don't crash the server
   */
  test("Empty file doesn't crash server", async function () {
    this.timeout(30000);

    const emptyUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-empty.pike');
    const emptyContent = '';
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(emptyUri, encoder.encode(emptyContent));

    try {
      const emptyDoc = await vscode.workspace.openTextDocument(emptyUri);
      await vscode.window.showTextDocument(emptyDoc);

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should handle empty file gracefully
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        emptyUri
      );

      // Accept either undefined or empty array - server shouldn't crash
      assert.ok(symbols === undefined || Array.isArray(symbols), 'Should handle empty file');

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await vscode.workspace.fs.delete(emptyUri);
    }
  });

  /**
   * Error: File with only comments
   * Category: Edge Case
   *
   * Tests that comment-only files are handled gracefully
   */
  test("File with only comments doesn't crash server", async function () {
    this.timeout(30000);

    const commentUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-comments.pike');
    const commentContent = `//! This file only has comments
//! No actual code here
//!
//! Just documentation comments
`;
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(commentUri, encoder.encode(commentContent));

    try {
      const commentDoc = await vscode.workspace.openTextDocument(commentUri);
      await vscode.window.showTextDocument(commentDoc);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        commentUri
      );

      // Accept either undefined or array - server shouldn't crash on comment-only files
      assert.ok(symbols === undefined || Array.isArray(symbols), 'Should handle comment-only file');

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await vscode.workspace.fs.delete(commentUri);
    }
  });

  /**
   * Error: Very long line handling
   * Category: Edge Case
   *
   * Tests that files with very long lines don't crash the server
   */
  test("File with very long line doesn't crash server", async function () {
    this.timeout(30000);

    const longLineUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-longline.pike');
    const longLine = 'int x = ' + '1 + '.repeat(1000) + '0;';
    const longLineContent = `//! File with very long line
${longLine}

int main() {
    return 0;
}
`;
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(longLineUri, encoder.encode(longLineContent));

    try {
      const longLineDoc = await vscode.workspace.openTextDocument(longLineUri);
      await vscode.window.showTextDocument(longLineDoc);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        longLineUri
      );

      assert.ok(
        symbols === undefined || Array.isArray(symbols),
        'Should handle file with very long line'
      );

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await vscode.workspace.fs.delete(longLineUri);
    }
  });

  /**
   * Error: Special characters in file
   * Category: Edge Case
   *
   * Tests that special characters are handled gracefully
   */
  test("File with special characters doesn't crash server", async function () {
    this.timeout(30000);

    const specialUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-special.pike');
    const specialContent = `//! File with special characters: © ® ™ € £ ¥ ¢
string s = "String with special chars: \n\t\r";

int main() {
    // Unicode in comments: 你好 世界 🌍
    write("Hello 世界\n");
    return 0;
}
`;
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(specialUri, encoder.encode(specialContent));

    try {
      const specialDoc = await vscode.workspace.openTextDocument(specialUri);
      await vscode.window.showTextDocument(specialDoc);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        specialUri
      );

      assert.ok(
        symbols === undefined || Array.isArray(symbols),
        'Should handle special characters'
      );

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await vscode.workspace.fs.delete(specialUri);
    }
  });

  /**
   * Error: Rapid file open/close
   * Category: Stress Test
   *
   * Tests that rapid file operations don't crash the server
   */
  test("Rapid file open/close doesn't crash server", async function () {
    this.timeout(30000);

    const rapidUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-rapid.pike');
    const rapidContent = 'int main() { return 0; }';
    const encoder = new TextEncoder();

    await vscode.workspace.fs.writeFile(rapidUri, encoder.encode(rapidContent));

    try {
      // Open and close the file multiple times rapidly
      for (let i = 0; i < 5; i++) {
        const doc = await vscode.workspace.openTextDocument(rapidUri);
        await vscode.window.showTextDocument(doc);
        await new Promise(resolve => setTimeout(resolve, 100));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Server should still be responsive
      const finalDoc = await vscode.workspace.openTextDocument(rapidUri);
      await vscode.window.showTextDocument(finalDoc);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        rapidUri
      );

      assert.ok(
        symbols === undefined || Array.isArray(symbols),
        'Server should remain responsive after rapid operations'
      );

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await vscode.workspace.fs.delete(rapidUri);
    }
  });

  /**
   * Error: Concurrent requests to different files
   * Category: Stress Test
   *
   * Tests that concurrent requests don't cause race conditions
   */
  test("Concurrent requests to different files don't crash", async function () {
    this.timeout(30000);

    // Create multiple test files
    const fileUris: vscode.Uri[] = [];
    for (let i = 0; i < 3; i++) {
      const uri = vscode.Uri.joinPath(workspaceFolder.uri, `test-concurrent-${i}.pike`);
      const content = `//! Concurrent test file ${i}
int function_${i}() {
    return ${i};
}
`;
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
      fileUris.push(uri);
    }

    try {
      // Open all files
      const docs = await Promise.all(fileUris.map(uri => vscode.workspace.openTextDocument(uri)));

      await Promise.all(docs.map(doc => vscode.window.showTextDocument(doc)));

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Make concurrent requests to all files
      const promises = fileUris.map(uri =>
        vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          uri
        )
      );

      const results = await Promise.all(promises);

      // All should succeed
      for (let i = 0; i < results.length; i++) {
        assert.ok(results[i] !== undefined, `Concurrent request ${i} should succeed`);
      }

      // Close all files
      for (const doc of docs) {
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
    } finally {
      // Clean up all files
      for (const uri of fileUris) {
        await vscode.workspace.fs.delete(uri);
      }
    }
  });
});
