/**
 * Stdlib E2E Tests
 *
 * These tests verify LSP features work correctly against REAL Pike stdlib modules.
 * Tests verify against actual Pike stdlib at /usr/local/pike/8.0.1116/lib/modules/
 *
 * Purpose: Validate that module resolution, completions, hover, and navigation work
 * for stdlib modules that real developers use daily.
 *
 * Test Strategy:
 * - Create test files that import/using stdlib modules
 * - Verify LSP features return real stdlib API data (not mocks)
 * - Cross-check against actual Pike stdlib behavior
 *
 * Key principle: Tests fail if stdlib features return incorrect/null data
 */



import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stdlib E2E Tests', () => {
    let workspaceFolder: vscode.WorkspaceFolder;
    let testDocumentUri: vscode.Uri;
    let document: vscode.TextDocument;

    suiteSetup(async function() {
        this.timeout(60000);

        // Check if Pike is available and has stdlib
        const { execSync } = await import('child_process');
        const { default: fs } = await import('fs');
        let stdlibAvailable = false;
        try {
            const pikeShowPathsOutput = execSync('pike --show-paths', { encoding: 'utf8' });
            const modulePathMatch = pikeShowPathsOutput.match(/Module path\.\.\.:\s*(\S+)/);
            const extractedPath = modulePathMatch?.[1];
            if (extractedPath) {
                stdlibAvailable = fs.existsSync(extractedPath);
            }
        } catch {
            // Pike not available
            stdlibAvailable = false;
        }

        if (!stdlibAvailable) {
            console.log('Skipping stdlib E2E tests: Pike stdlib not available');
            this.skip();
            return;
        }

        workspaceFolder = vscode.workspace.workspaceFolders?.[0]!;
        assert.ok(workspaceFolder, 'Workspace folder should exist');

        const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
        assert.ok(extension, 'Extension should be found');

        if (!extension.isActive) {
            await extension.activate();
            console.log('Extension activated for stdlib E2E tests');
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Create a test file that uses stdlib modules
        const stdlibTestPath = vscode.Uri.joinPath(workspaceFolder.uri, 'test-stdlib.pike');
        testDocumentUri = stdlibTestPath;

        const testContent = `//! Test file for stdlib E2E tests
//! This file imports and uses real stdlib modules

import Stdio;
import Array;

void test_stdlib_functions() {
    // Test Array module functions
    array(int) arr = ({1, 2, 3});
    int sum = Array.sum(arr);

    // Test String module functions
    string trimmed = String.trim_all_whites("  hello  ");

    // Test Stdio.File
    Stdio.File file = Stdio.File();
}

class TestClass {
    int x;
    void method() { }
}
`;

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(testDocumentUri, encoder.encode(testContent));

        document = await vscode.workspace.openTextDocument(testDocumentUri);
        await vscode.window.showTextDocument(document);

        await new Promise(resolve => setTimeout(resolve, 15000));
        console.log('Stdlib E2E test setup complete');
    });

    suiteTeardown(async () => {
        if (document) {
            await vscode.window.showTextDocument(document);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }

        // Clean up test file
        try {
            await vscode.workspace.fs.delete(testDocumentUri);
        } catch {
            // Ignore if already deleted
        }
    });

    /**
     * Test: Array module completion returns real stdlib methods
     * Category: Real Stdlib Verification
     *
     * Validates that completing on "Array." returns actual Pike stdlib methods
     * like sum, sort, flatten, etc. from /usr/local/pike/8.0.1116/lib/modules/Array.pmod
     *
     * Expected: Completions should include real Array methods (sum, sort, flatten, etc.)
     */
    test('Array module completion returns real stdlib methods', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find "Array." in the test file
        const completionMatch = text.match(/Array\./);
        assert.ok(completionMatch, 'Should find Array. completion trigger');

        // Position after "Array." to trigger completion
        const completionOffset = text.indexOf(completionMatch[0]) + 'Array.'.length;
        const completionPosition = document.positionAt(completionOffset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            completionPosition
        );

        assert.ok(completions, 'Should return completions for Array module');
        assert.ok(completions!.items.length > 0, 'Should have completion items for Array');

        // Verify REAL stdlib methods appear (from Array.pmod at /usr/local/pike/8.0.1116/lib/modules/)
        const labels = completions!.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

        // Expected methods from real Array.pmod module
        const expectedMethods = ['sum', 'sort', 'flatten', 'filter', 'map', 'reduce'];

        const foundMethods = expectedMethods.filter(m => labels.includes(m));

        assert.ok(
            foundMethods.length >= 3,
            `Should find at least 3 real Array stdlib methods. Found: ${foundMethods.join(', ')}. All labels: ${labels.slice(0, 20).join(', ')}`
        );
    });

    /**
     * Test: String module completion returns real stdlib methods
     * Category: Real Stdlib Verification
     *
     * Validates that completing on "String." returns actual Pike stdlib methods
     * like trim_all_whites, capitalize, etc.
     */
    test('String module completion returns real stdlib methods', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find "String." in the test file
        const completionMatch = text.match(/String\./);
        assert.ok(completionMatch, 'Should find String. completion trigger');

        const completionOffset = text.indexOf(completionMatch[0]) + 'String.'.length;
        const completionPosition = document.positionAt(completionOffset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            completionPosition
        );

        assert.ok(completions, 'Should return completions for String module');
        assert.ok(completions!.items.length > 0, 'Should have completion items for String');

        // Verify REAL stdlib methods appear
        const labels = completions!.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

        // Expected methods from real String module (8.0.1116 compatible)
        const expectedMethods = ['trim_all_whites', 'capitalize', 'count', 'width'];

        const foundMethods = expectedMethods.filter(m => labels.includes(m));

        assert.ok(
            foundMethods.length >= 2,
            `Should find at least 2 real String stdlib methods. Found: ${foundMethods.join(', ')}. All labels: ${labels.slice(0, 20).join(', ')}`
        );
    });

    /**
     * Test: Stdio module completion returns real stdlib classes and functions
     * Category: Real Stdlib Verification
     *
     * Validates that completing on "Stdio." returns actual Pike stdlib classes
     * like File, Port, etc.
     */
    test('Stdio module completion returns real stdlib classes and functions', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find "Stdio." in the test file
        const completionMatch = text.match(/Stdio\./);
        assert.ok(completionMatch, 'Should find Stdio. completion trigger');

        const completionOffset = text.indexOf(completionMatch[0]) + 'Stdio.'.length;
        const completionPosition = document.positionAt(completionOffset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            completionPosition
        );

        assert.ok(completions, 'Should return completions for Stdio module');
        assert.ok(completions!.items.length > 0, 'Should have completion items for Stdio');

        // Verify REAL stdlib classes/ functions appear
        const labels = completions!.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

        // Expected from real Stdio module
        const expectedSymbols = ['File', 'stdout', 'stderr', 'stdin', 'Port'];

        const foundSymbols = expectedSymbols.filter(s => labels.includes(s));

        assert.ok(
            foundSymbols.length >= 2,
            `Should find at least 2 real Stdio stdlib symbols. Found: ${foundSymbols.join(', ')}. All labels: ${labels.slice(0, 20).join(', ')}`
        );
    });

    /**
     * Test: Hover on Array.sum shows function signature
     * Category: Real Stdlib Verification
     *
     * Validates that hovering over Array.sum shows type information
     * from the real stdlib module.
     */
    test('Hover on Array.sum shows function signature', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find "Array.sum" in the test file
        const hoverMatch = text.match(/Array\.sum/);
        assert.ok(hoverMatch, 'Should find Array.sum usage');

        // Position on "sum" part
        const hoverOffset = text.indexOf(hoverMatch[0]) + 'Array.'.length;
        const hoverPosition = document.positionAt(hoverOffset);

        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            testDocumentUri,
            hoverPosition
        );

        assert.ok(hovers, 'Should return hover data for Array.sum');
        assert.ok(hovers!.length > 0, 'Should have hover results');

        const firstHover = hovers[0]!;
        assert.ok(firstHover.contents, 'Hover should have contents');

        // Extract content string
        const contents = Array.isArray(firstHover.contents) ? firstHover.contents : [firstHover.contents];
        const content = contents[0];
        const contentStr = typeof content === 'string' ? content : content?.value || '';

        // Hover should contain some useful information
        assert.ok(
            contentStr.length > 0,
            'Hover content should not be empty for Array.sum'
        );
    });

    /**
     * Test: Document symbols includes stdlib-imported symbols
     * Category: Real Stdlib Verification
     *
     * Validates that document symbols are extracted correctly even when
     * using stdlib modules (no crash, correct parsing).
     */
    test('Document symbols parse correctly with stdlib imports', async function() {
        this.timeout(30000);

        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            testDocumentUri
        );

        assert.ok(symbols, 'Should return symbols from file with stdlib imports');
        assert.ok(symbols!.length > 0, 'Should have symbols in test file');

        // Should find test_stdlib_functions function and TestClass
        const symbolNames = symbols!.map(s => s.name);

        assert.ok(
            symbolNames.includes('test_stdlib_functions') || symbolNames.includes('TestClass'),
            `Should find user-defined symbols. Got: ${symbolNames.join(', ')}`
        );
    });

    /**
     * Test: Go-to-definition doesn't crash on stdlib module reference
     * Category: Real Stdlib Verification
     *
     * Validates that go-to-definition on stdlib references (Array, String, Stdio)
     * doesn't crash and returns appropriate results (may be null for stdlib).
     */
    test('Go-to-definition on Array module reference handles gracefully', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find "Array" module reference
        const refMatch = text.match(/Array\.sum/);
        assert.ok(refMatch, 'Should find Array.sum reference');

        const refOffset = text.indexOf(refMatch[0]);
        const refPosition = document.positionAt(refOffset);

        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            refPosition
        );

        // Should not crash - may return null for stdlib modules (expected)
        assert.ok(locations !== undefined, 'Definition handler should not crash on stdlib reference');
    });

    /**
     * Test: Verify String.trim_all_whites exists (Pike 8.0.1116 compatibility)
     * Category: Real Stdlib Verification
     *
     * Validates that the LSP knows about String.trim_all_whites which is
     * the correct method name in Pike 8.0.1116 (String.trim doesn't exist).
     *
     * This is important per ADR-002: Target Pike 8.0.1116
     */
    test('String.trim_all_whites completion available (Pike 8.0.1116 API)', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find "String." to check completions
        const completionMatch = text.match(/String\./);
        assert.ok(completionMatch, 'Should find String. completion trigger');

        const completionOffset = text.indexOf(completionMatch[0]) + 'String.'.length;
        const completionPosition = document.positionAt(completionOffset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            completionPosition
        );

        assert.ok(completions, 'Should return completions');

        const labels = completions!.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

        // String.trim_all_whites is the correct method in Pike 8.0.1116
        // (String.trim doesn't exist in 8.0)
        const hasTrimAllWhites = labels.includes('trim_all_whites');

        assert.ok(
            hasTrimAllWhites,
            `Should have trim_all_whites (Pike 8.0.1116 API). Got: ${labels.slice(0, 30).join(', ')}`
        );
    });

    /**
     * Test: Array.sum completion available (real stdlib method)
     * Category: Real Stdlib Verification
     *
     * Validates that Array.sum appears in completions.
     * This is a commonly used stdlib method.
     */
    test('Array.sum completion available', async function() {
        this.timeout(30000);

        const text = document.getText();

        const completionMatch = text.match(/Array\./);
        assert.ok(completionMatch, 'Should find Array. completion trigger');

        const completionOffset = text.indexOf(completionMatch[0]) + 'Array.'.length;
        const completionPosition = document.positionAt(completionOffset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            completionPosition
        );

        assert.ok(completions, 'Should return completions');

        const labels = completions!.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

        // Array.sum is a real stdlib method
        const hasSum = labels.includes('sum');

        assert.ok(
            hasSum,
            `Should have sum (Array.sum). Got: ${labels.slice(0, 30).join(', ')}`
        );
    });

    /**
     * Test: Stdio.File class completion available
     * Category: Real Stdlib Verification
     *
     * Validates that Stdio.File class appears in completions.
     */
    test('Stdio.File class completion available', async function() {
        this.timeout(30000);

        const text = document.getText();

        const completionMatch = text.match(/Stdio\./);
        assert.ok(completionMatch, 'Should find Stdio. completion trigger');

        const completionOffset = text.indexOf(completionMatch[0]) + 'Stdio.'.length;
        const completionPosition = document.positionAt(completionOffset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            completionPosition
        );

        assert.ok(completions, 'Should return completions');

        const labels = completions!.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

        // Stdio.File is a real stdlib class
        const hasFile = labels.includes('File');

        assert.ok(
            hasFile,
            `Should have File (Stdio.File class). Got: ${labels.slice(0, 30).join(', ')}`
        );
    });

    /**
     * Test: Verify Pike stdlib path is accessible
     * Category: Environment Validation
     *
     * Validates that Pike stdlib exists and contains expected modules.
     * Dynamically detects Pike path via `pike --show-paths`.
     */
    test('Pike stdlib path exists and contains modules', async function() {
        this.timeout(10000);

        // Dynamically detect Pike's module path
        const { execSync } = await import('child_process');
        let stdlibPath: string;

        try {
            const pikeShowPathsOutput = execSync('pike --show-paths', { encoding: 'utf8' });
            const modulePathMatch = pikeShowPathsOutput.match(/Module path\.\.\.:\s*(\S+)/);
            const extractedPath = modulePathMatch?.[1];
            if (extractedPath) {
                stdlibPath = extractedPath;
            } else {
                throw new Error('Could not parse module path from pike --show-paths');
            }
        } catch {
            // Fallback: try common locations
            const possiblePaths = [
                '/usr/local/pike/8.0.1116/lib/modules',
                '/usr/lib/pike/8.0/lib/modules',
                '/usr/share/pike/8.0/lib/modules'
            ];
            const found = possiblePaths.find(p => fs.existsSync(p));
            stdlibPath = found ?? possiblePaths[0] ?? '/usr/local/pike/8.0.1116/lib/modules';
        }

        // Verify stdlib directory exists
        const stdlibExists = fs.existsSync(stdlibPath);
        assert.ok(stdlibExists, `Pike stdlib should exist at ${stdlibPath}`);

        // List some expected modules
        const expectedModules = [
            'Array.pmod',
            'String.pmod',
            'Stdio.pmod'
        ];

        for (const mod of expectedModules) {
            const modPath = path.join(stdlibPath, mod);
            const modExists = fs.existsSync(modPath);
            assert.ok(modExists, `Stdlib module ${mod} should exist at ${modPath}`);
        }
    });
});
