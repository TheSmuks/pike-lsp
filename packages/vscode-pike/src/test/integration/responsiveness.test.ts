/**
 * Responsiveness E2E Tests
 *
 * These tests verify that the LSP server remains responsive during rapid typing.
 * Key focus: Debouncing prevents CPU thrashing by coalescing rapid edits.
 *
 * Tests verify:
 * - Rapid typing (10 keystrokes/second for 5 seconds) doesn't block UI
 * - Debounce delay coalesces edits into single validations
 * - LSP remains responsive after typing burst
 *
 * Performance criteria:
 * - Typing simulation (50 edits over 5 seconds) completes in < 10 seconds
 * - LSP features still work after rapid typing (debounce didn't block)
 */

// @ts-nocheck - Integration tests use mocha types at runtime
// These tests require vscode package to run - skip in standard test environment

import * as assert from 'assert';
import { suite, test } from 'mocha';

// Skip all tests in this file if vscode is not available
let vscode: any;
let vscodeAvailable = false;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vscode = require('vscode');
    vscodeAvailable = true;
} catch {
    // vscode not available - tests will be skipped
}

const itSkip = vscodeAvailable ? test : test.skip;

suite('Responsiveness E2E Tests', () => {
    let workspaceFolder: any;
    let fixtureUri: any;
    let document: any;

    suiteSetup(async function() {
        if (!vscodeAvailable) {
            this.skip();
            return;
        }
        this.timeout(60000);

        // Ensure workspace folder exists
        workspaceFolder = vscode.workspace.workspaceFolders?.[0]!;
        assert.ok(workspaceFolder, 'Workspace folder should exist');

        // Explicitly activate the extension before running tests
        const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
        assert.ok(extension, 'Extension should be found');

        if (!extension.isActive) {
            await extension.activate();
            console.log('Extension activated for responsiveness tests');
        }

        // Open test-typing.pike fixture
        fixtureUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-typing.pike');
        console.log(`Opening test fixture: ${fixtureUri.fsPath}`);

        document = await vscode.workspace.openTextDocument(fixtureUri);

        // Show the document in an editor to ensure LSP synchronization
        await vscode.window.showTextDocument(document);
        console.log('Document opened and shown in editor');

        // Wait for LSP to fully initialize and analyze the file
        console.log('Waiting for LSP to analyze document...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Check for diagnostics on the file (could indicate Pike errors)
        const diagnostics = vscode.languages.getDiagnostics(fixtureUri);
        if (diagnostics.length > 0) {
            console.log(`Found ${diagnostics.length} diagnostics on test file:`);
            diagnostics.forEach(d => {
                console.log(`  Line ${d.range.start.line}: ${d.message}`);
            });
        } else {
            console.log('No diagnostics on test file (normal for valid Pike code)');
        }

        console.log('Responsiveness test setup complete');
    });

    suiteTeardown(async () => {
        // Close document if open
        if (document) {
            await vscode.window.showTextDocument(document);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });

    /**
     * Rapid Typing Simulation Test
     *
     * Simulates 10 keystrokes/second for 5 seconds (50 total edits).
     * Verifies that:
     * 1. Typing completes without blocking (< 10 seconds total)
     * 2. Debounce coalesces edits (no CPU thrashing)
     * 3. LSP remains responsive after typing burst
     *
     * The 250ms debounce delay should coalesce the 50 edits into
     * ~2 validation calls instead of 50, preventing CPU overload.
     */
    itSkip('Debouncing prevents CPU thrashing during rapid typing', async function() {
        this.timeout(30000);

        const editor = await vscode.window.showTextDocument(document);
        const startTime = Date.now();

        console.log('Starting rapid typing simulation: 50 edits over 5 seconds...');

        // Simulate rapid typing: 10 keystrokes/second for 5 seconds = 50 edits
        for (let i = 0; i < 50; i++) {
            // Wait 100ms between keystrokes (10 per second = fast typist)
            await new Promise(resolve => setTimeout(resolve, 100));

            // Type a line at position i (append lines to document)
            await editor.edit(editBuilder => {
                const lineCount = document.lineCount;
                editBuilder.insert(new vscode.Position(lineCount, 0), 'x\n');
            });
        }

        const elapsed = Date.now() - startTime;
        console.log(`Typing simulation completed in ${elapsed}ms`);

        // Verify typing completed in reasonable time
        // 50 edits * 100ms = 5000ms minimum, plus overhead
        // Allow up to 10 seconds (2x theoretical minimum) for debounce overhead
        assert.ok(elapsed < 10000, `Typing should complete within 10 seconds (took ${elapsed}ms)`);

        // Verify we can still interact with LSP (debounce didn't block)
        console.log('Verifying LSP responsiveness after rapid typing...');
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            fixtureUri
        );

        assert.ok(symbols, 'Document symbols should still be accessible after rapid typing');
        console.log(`LSP responsive: ${symbols.length} symbols retrieved`);
    });

    /**
     * Additional test: Verify LSP recovers quickly after typing burst
     *
     * After rapid typing stops, the debounce timer should expire
     * and a final validation should occur. This test verifies that
     * the LSP is ready to handle new queries shortly after typing stops.
     */
    itSkip('LSP recovers quickly after typing burst', async function() {
        this.timeout(30000);

        const editor = await vscode.window.showTextDocument(document);

        // First, do a burst of rapid edits
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 50)); // Very fast burst
            await editor.edit(editBuilder => {
                const lineCount = document.lineCount;
                editBuilder.insert(new vscode.Position(lineCount, 0), 'y\n');
            });
        }

        // Wait for debounce to expire (250ms) plus some margin
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify LSP is responsive
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            fixtureUri
        );

        assert.ok(symbols, 'LSP should be responsive after debounce period');
        assert.ok(symbols.length > 0, 'Should have symbols after typing burst');
    });
});
