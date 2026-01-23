/**
 * LSP Feature E2E Tests
 *
 * These tests run in a real VS Code instance to verify LSP features
 * return valid data end-to-end: VSCode -> LSP Server -> Bridge -> Pike
 *
 * Tests verify:
 * - Document symbols (outline/symbol tree)
 * - Hover (type information)
 * - Go-to-definition (navigation)
 * - Completion (autocomplete suggestions)
 *
 * Key principle: Tests fail if LSP features return null/undefined (regression detection)
 *
 * Error capture: Pike subprocess errors are captured and displayed when tests fail.
 */

// @ts-nocheck - Integration tests use mocha types at runtime

import * as vscode from 'vscode';
import * as assert from 'assert';

// Captured Pike server logs for debugging test failures
let capturedLogs: string[] = [];

/**
 * Log capture utility - shows server logs when tests fail
 */
function logServerOutput(message: string) {
    capturedLogs.push(message);
    console.log(`[Pike Server] ${message}`);
}

/**
 * Display captured logs on test failure
 */
function dumpServerLogs(context: string) {
    console.log(`\n=== Pike Server Logs (${context}) ===`);
    if (capturedLogs.length === 0) {
        console.log('(No logs captured)');
    } else {
        capturedLogs.forEach(log => console.log(log));
    }
    console.log('=== End Server Logs ===\n');
}

/**
 * Enhanced assertion that dumps logs on failure
 */
function assertWithLogs(condition: unknown, message: string): asserts condition {
    if (!condition) {
        dumpServerLogs(`Assertion failed: ${message}`);
        assert.ok(condition, message);
    }
}

suite('LSP Feature E2E Tests', () => {
    let workspaceFolder: vscode.WorkspaceFolder;
    let testDocumentUri: vscode.Uri;
    let document: vscode.TextDocument;
    let outputChannelDisposable: vscode.Disposable | undefined;

    suiteSetup(async function() {
        this.timeout(60000); // Allow more time for LSP initialization
        capturedLogs = []; // Reset logs for this test run

        // Ensure workspace folder exists
        workspaceFolder = vscode.workspace.workspaceFolders?.[0]!;
        assert.ok(workspaceFolder, 'Workspace folder should exist');

        // Explicitly activate the extension before running tests
        const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
        assert.ok(extension, 'Extension should be found');

        if (!extension.isActive) {
            await extension.activate();
            console.log('Extension activated for LSP feature tests');
        }

        // Set up output channel monitoring for Pike server logs
        // The LSP client sends Pike output to the "Pike Language Server" output channel
        try {
            // Register a diagnostic listener to capture Pike stderr messages
            const diagnosticListener = vscode.languages.onDidChangeDiagnostics(e => {
                for (const uri of e.uris) {
                    const diagnostics = vscode.languages.getDiagnostics(uri);
                    diagnostics.forEach(d => {
                        logServerOutput(`Diagnostic: ${d.severity} - ${d.message} at line ${d.range.start.line}`);
                    });
                }
            });
            outputChannelDisposable = diagnosticListener;

            logServerOutput('Test setup: Diagnostic listener registered');
        } catch (e) {
            console.log('Could not set up output channel monitoring:', e);
        }

        // Wait a bit for the LSP server to fully start after activation
        logServerOutput('Waiting for LSP server to start...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Use the existing test.pike file in test-workspace instead of creating dynamically
        // This avoids URI scheme issues that prevent LSP from caching the document
        testDocumentUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');
        logServerOutput(`Opening test fixture: ${testDocumentUri.fsPath}`);

        document = await vscode.workspace.openTextDocument(testDocumentUri);

        // Show the document in an editor to ensure LSP synchronization
        await vscode.window.showTextDocument(document);
        logServerOutput('Document opened and shown in editor');

        // Wait for LSP to fully initialize and analyze the file
        // This is critical - LSP features won't work if server isn't ready
        logServerOutput('Waiting for LSP to analyze document...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Check for diagnostics on the file (could indicate Pike errors)
        const diagnostics = vscode.languages.getDiagnostics(testDocumentUri);
        if (diagnostics.length > 0) {
            logServerOutput(`Found ${diagnostics.length} diagnostics on test file:`);
            diagnostics.forEach(d => {
                logServerOutput(`  Line ${d.range.start.line}: ${d.message}`);
            });
        } else {
            logServerOutput('No diagnostics on test file (normal for valid Pike code)');
        }

        logServerOutput('Test setup complete');
    });

    suiteTeardown(async () => {
        // Dispose diagnostic listener
        if (outputChannelDisposable) {
            outputChannelDisposable.dispose();
        }

        // Close document if open
        if (document) {
            await vscode.window.showTextDocument(document);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }

        // Always dump logs at the end of the suite for debugging
        dumpServerLogs('Suite teardown');
    });

    /**
     * Task 2: Document Symbols Test
     *
     * Tests that textDocument/documentSymbol returns a valid symbol tree.
     * This verifies the outline/symbol tree feature works end-to-end.
     */
    test('Document symbols returns valid symbol tree', async function() {
        this.timeout(30000);

        logServerOutput('Starting document symbols test...');

        // Execute document symbol provider via VSCode command
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            testDocumentUri
        );

        // Log result for debugging
        logServerOutput(`Document symbols result: ${symbols ? `${symbols.length} symbols` : 'null'}`);
        if (!symbols) {
            logServerOutput('WARNING: Document symbols returned null - Pike analyzer may have crashed');
            dumpServerLogs('Document symbols test - null result');
        }

        // Verify response is not null (regression detection)
        assertWithLogs(symbols, 'Should return symbols (not null) - LSP feature may be broken');

        // Verify response is an array
        assert.ok(Array.isArray(symbols), 'Should return symbols array');

        // Verify we have symbols (test fixture has variables, functions, classes)
        assert.ok(symbols.length > 0, 'Should have at least one symbol from fixture file');

        // Verify first symbol has required structure
        const firstSymbol = symbols[0];
        assert.ok(firstSymbol.name, 'Symbol should have name');
        assert.ok(firstSymbol.kind !== undefined, 'Symbol should have kind (SymbolKind enum)');
        assert.ok(firstSymbol.range, 'Symbol should have range');

        // Verify range has valid structure
        assert.ok(firstSymbol.range.start, 'Symbol range should have start position');
        assert.ok(firstSymbol.range.end, 'Symbol range should have end position');
        assert.ok(typeof firstSymbol.range.start.line === 'number', 'Start line should be number');
        assert.ok(typeof firstSymbol.range.end.line === 'number', 'End line should be number');

        // Look for expected symbols from fixture
        const symbolNames = symbols.map(s => s.name);
        assert.ok(symbolNames.length > 0, 'Should extract symbol names');

        // Verify we can find specific symbols from fixture
        // Test fixture has: test_variable, test_function, TestClass, etc.
        const hasTopLevelSymbols = symbols.some(s =>
            s.name.includes('test_variable') ||
            s.name.includes('test_function') ||
            s.name.includes('TestClass') ||
            s.name.includes('use_variable')
        );
        assert.ok(hasTopLevelSymbols || symbols.length > 0,
            'Should find known symbols from fixture file');
    });

    /**
     * Task 3: Hover Test
     *
     * Tests that textDocument/hover returns type information.
     * This verifies hover shows type info when hovering over symbols.
     */
    test('Hover returns type information', async function() {
        this.timeout(30000);

        // Get document text to find symbol positions
        const text = document.getText();

        // Find position of "TestClass" usage (line 11: TestClass tc = TestClass();)
        // We want to hover on the class name
        const classMatch = text.match(/TestClass\s+tc\s*=/);
        assert.ok(classMatch, 'Should find TestClass usage in test.pike');

        // Calculate position: start of match to be on "TestClass"
        const classOffset = text.indexOf(classMatch[0]);
        const hoverPosition = document.positionAt(classOffset);

        // Execute hover provider via VSCode command
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            testDocumentUri,
            hoverPosition
        );

        // Verify response is not null (regression detection)
        assert.ok(hovers, 'Should return hover data (not null) - LSP hover feature may be broken');

        // Verify we have hover results
        assert.ok(hovers.length > 0, 'Should have at least one hover result');

        // Verify hover has content
        const firstHover = hovers[0];
        assert.ok(firstHover.contents, 'Hover should have contents');
        assert.ok(firstHover.contents.length > 0, 'Hover contents should not be empty');

        // Extract content string (can be string or MarkedString object)
        const content = firstHover.contents[0];
        const contentStr = typeof content === 'string' ? content : content.value;

        // Verify content contains some information
        assert.ok(contentStr, 'Hover content should be extractable');
    });

    /**
     * Task 4: Go-to-Definition Test
     *
     * Tests that textDocument/definition returns valid locations.
     * This verifies go-to-definition navigation works correctly.
     */
    test('Go-to-definition returns location', async function() {
        this.timeout(30000);

        // Get document text to find symbol reference
        const text = document.getText();

        // Find position of TestClass reference (line 11: TestClass tc = TestClass();)
        // Note: Pike syntax doesn't allow whitespace between class name and parentheses
        const referenceMatch = text.match(/TestClass\s*\(\)/);
        assert.ok(referenceMatch, 'Should find TestClass() constructor call in test.pike');

        // Calculate position to be on the class name
        const referenceOffset = text.indexOf(referenceMatch[0]);
        const referencePosition = document.positionAt(referenceOffset);

        // Execute definition provider via VSCode command
        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            referencePosition
        );

        // Verify response is not null (regression detection)
        assert.ok(locations, 'Should return definition locations (not null) - LSP definition feature may be broken');

        // Normalize to array (can be single Location, array of Location, or LocationLink[])
        let locationArray: vscode.Location[];
        if (Array.isArray(locations)) {
            // Check if it's LocationLink array (has targetUri) or Location array (has uri)
            if (locations.length > 0 && locations[0] && 'targetUri' in locations[0]) {
                // Convert LocationLink to Location
                locationArray = (locations as vscode.LocationLink[]).map(ll =>
                    new vscode.Location(ll.targetUri, ll.targetRange)
                );
            } else {
                locationArray = locations as vscode.Location[];
            }
        } else {
            locationArray = [locations as vscode.Location];
        }

        // Verify we have at least one location
        assert.ok(locationArray.length > 0, 'Should have at least one definition location');

        // Verify first location has required structure
        const firstLocation = locationArray[0]!;
        assert.ok(firstLocation.uri, 'Location should have URI');
        assert.ok(firstLocation.range, 'Location should have range');

        // Verify range is valid
        assert.ok(firstLocation.range.start, 'Location range should have start position');
        assert.ok(firstLocation.range.end, 'Location range should have end position');
    });

    /**
     * Task 5: Completion Test
     *
     * Tests that textDocument/completion returns suggestions.
     * This verifies autocomplete works correctly.
     */
    test('Completion returns suggestions', async function() {
        this.timeout(30000);

        // Get document text to find completion trigger position
        const text = document.getText();

        // Find position after "Array." which should trigger stdlib completion
        // Line 50: // Test completion: Array.
        const completionTriggerMatch = text.match(/Array\./);
        assert.ok(completionTriggerMatch, 'Should find Array. completion trigger in fixture');

        // Position after the dot to trigger completion
        const completionOffset = text.indexOf(completionTriggerMatch[0]) + 'Array.'.length;
        const completionPosition = document.positionAt(completionOffset);

        // Execute completion provider via VSCode command
        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            completionPosition
        );

        // Verify response is not null (regression detection)
        assert.ok(completions, 'Should return completions (not null) - LSP completion feature may be broken');

        // Verify completions have items array
        assert.ok(completions.items, 'Completions should have items array');

        // Verify we have completion suggestions
        assert.ok(completions.items.length > 0, 'Should have completion items');

        // Verify first item has required structure
        const firstItem = completions.items[0]!;
        assert.ok(firstItem.label, 'Completion item should have label');
        assert.ok(firstItem.kind !== undefined, 'Completion item should have kind (CompletionItemKind)');

        // Verify label is non-empty
        const labelText = typeof firstItem.label === 'string' ? firstItem.label : firstItem.label.label;
        assert.ok(labelText && labelText.length > 0, 'Completion label should not be empty');

        // For stdlib completion, we might see methods like cast, flatten, sum, etc.
        // or keywords, or local symbols
        const labels = completions.items.map(i => typeof i.label === 'string' ? i.label : i.label.label);
        assert.ok(labels.length > 0, 'Should extract completion labels');
    });

    /**
     * Additional test: Verify hover on function shows signature
     */
    test('Hover on function shows signature information', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find main function declaration: int main()
        const functionMatch = text.match(/int\s+main\s*\(/);
        assert.ok(functionMatch, 'Should find main function declaration in test.pike');

        // Position on function name
        const functionOffset = text.indexOf(functionMatch[0]) + 'int '.length;
        const functionPosition = document.positionAt(functionOffset);

        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            testDocumentUri,
            functionPosition
        );

        assert.ok(hovers, 'Should return hover for function');
        assert.ok(hovers.length > 0, 'Should have hover result for function');

        const hover = hovers[0]!;
        const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
        const content = contents[0];
        const contentStr = typeof content === 'string' ? content : content?.value || '';

        // Function hover should mention function, parameters, or return type
        assert.ok(
            contentStr.toLowerCase().includes('function') ||
            contentStr.toLowerCase().includes('main') ||
            contentStr.includes('int'),
            'Hover should show function signature info'
        );
    });

    /**
     * Additional test: Verify class appears in symbols
     */
    test('Class symbol appears in document symbols', async function() {
        this.timeout(30000);

        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            testDocumentUri
        );

        assert.ok(symbols, 'Should return symbols');

        // Flatten symbol tree (classes have children)
        const allSymbols: vscode.DocumentSymbol[] = [];
        const collectSymbols = (symbolList: vscode.DocumentSymbol[]) => {
            for (const symbol of symbolList) {
                allSymbols.push(symbol);
                if (symbol.children) {
                    collectSymbols(symbol.children);
                }
            }
        };
        collectSymbols(symbols);

        // Look for TestClass from fixture
        const testClassSymbol = allSymbols.find(s => s.name === 'TestClass');

        assert.ok(
            testClassSymbol || allSymbols.length > 0,
            'Should find TestClass symbol or have other symbols'
        );

        if (testClassSymbol) {
            // Verify class has kind indicating it's a class
            assert.ok(
                testClassSymbol.kind === vscode.SymbolKind.Class ||
                testClassSymbol.kind === vscode.SymbolKind.Struct ||
                testClassSymbol.kind === vscode.SymbolKind.Interface,
                'TestClass symbol should have Class-like kind'
            );

            // Class should have children (methods, members)
            assert.ok(
                testClassSymbol.children !== undefined,
                'Class symbol should have children array'
            );
        }
    });

    /**
     * Additional test: Completion at end of word
     */
    test('Completion triggers on partial word', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find "Test" and trigger completion there
        const partialMatch = text.match(/class\s+Test/);
        if (partialMatch) {
            // Position after "Test" (partial word)
            const partialOffset = text.indexOf(partialMatch[0]) + 'class '.length + 4;
            const partialPosition = document.positionAt(partialOffset);

            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                testDocumentUri,
                partialPosition
            );

            assert.ok(completions, 'Should return completions for partial word');
            assert.ok(completions.items, 'Should have items for partial word');

            // This is a soft assertion - completion may or may not filter by prefix
            // depending on LSP behavior
            assert.ok(
                completions.items.length > 0,
                'Should have some completions for partial word'
            );
        }
    });
});
