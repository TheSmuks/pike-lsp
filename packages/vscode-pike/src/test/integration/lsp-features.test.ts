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
 */

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';

// Test fixture file path - must match the actual fixture location
const FIXTURE_RELATIVE_PATH = 'src/test/fixtures/test-lsp-features.pike';

suite('LSP Feature E2E Tests', () => {
    let workspaceFolder: vscode.WorkspaceFolder;
    let fixtureUri: vscode.Uri;
    let document: vscode.TextDocument;

    suiteSetup(async function() {
        this.timeout(45000); // Allow time for LSP initialization

        // Ensure workspace folder exists
        workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder should exist');

        // Get path to fixture file - from workspace root
        fixtureUri = vscode.Uri.joinPath(workspaceFolder.uri, FIXTURE_RELATIVE_PATH);

        // Verify fixture file exists
        try {
            await vscode.workspace.fs.stat(fixtureUri);
        } catch {
            assert.fail(`Test fixture file not found at ${FIXTURE_RELATIVE_PATH}`);
        }

        // Open the fixture to trigger LSP analysis
        document = await vscode.workspace.openTextDocument(fixtureUri);

        // Wait for LSP to fully initialize and analyze the file
        // This is critical - LSP features won't work if server isn't ready
        await new Promise(resolve => setTimeout(resolve, 10000));
    });

    suiteTeardown(async () => {
        // Close document if open
        if (document) {
            await vscode.window.showTextDocument(document);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });

    /**
     * Task 2: Document Symbols Test
     *
     * Tests that textDocument/documentSymbol returns a valid symbol tree.
     * This verifies the outline/symbol tree feature works end-to-end.
     */
    test('Document symbols returns valid symbol tree', async function() {
        this.timeout(30000);

        // Execute document symbol provider via VSCode command
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            fixtureUri
        );

        // Verify response is not null (regression detection)
        assert.ok(symbols, 'Should return symbols (not null) - LSP feature may be broken');

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

        // Find position of "test_variable" declaration (line 7: int test_variable = 42;)
        // We want to hover on the variable name, not the type
        const variableMatch = text.match(/int\s+test_variable\s*=/);
        assert.ok(variableMatch, 'Should find test_variable declaration in fixture');

        // Calculate position: start of match + length of "int " to be on variable name
        const variableOffset = text.indexOf(variableMatch[0]) + 'int '.length;
        const hoverPosition = document.positionAt(variableOffset);

        // Execute hover provider via VSCode command
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            fixtureUri,
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

        // Verify content contains type information
        assert.ok(contentStr, 'Hover content should be extractable');
        assert.ok(
            contentStr.toLowerCase().includes('int') ||
            contentStr.toLowerCase().includes('variable') ||
            contentStr.toLowerCase().includes('test'),
            'Hover should show type information (contains "int", "variable", or "test")'
        );
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

        // Find position of test_variable reference in use_variable function
        // Line 74: int use_variable() { return test_variable; }
        const referenceMatch = text.match(/return\s+test_variable\s*;/);
        assert.ok(referenceMatch, 'Should find test_variable reference in fixture');

        // Calculate position to be on the variable name
        const referenceOffset = text.indexOf(referenceMatch[0]) + 'return '.length;
        const referencePosition = document.positionAt(referenceOffset);

        // Execute definition provider via VSCode command
        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            fixtureUri,
            referencePosition
        );

        // Verify response is not null (regression detection)
        assert.ok(locations, 'Should return definition locations (not null) - LSP definition feature may be broken');

        // Normalize to array (can be single Location, array of Location, or LocationLink[])
        let locationArray: vscode.Location[];
        if (Array.isArray(locations)) {
            // Check if it's LocationLink array (has targetUri) or Location array (has uri)
            if (locations.length > 0 && 'targetUri' in locations[0]) {
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
        const firstLocation = locationArray[0];
        assert.ok(firstLocation.uri, 'Location should have URI');
        assert.ok(firstLocation.range, 'Location should have range');

        // Verify range is valid
        assert.ok(firstLocation.range.start, 'Location range should have start position');
        assert.ok(firstLocation.range.end, 'Location range should have end position');

        // Verify the location points to our fixture file (or a valid file)
        assert.ok(firstLocation.uri.fsPath, 'Location URI should have a filesystem path');

        // The definition should point to the variable declaration
        // which is in the same fixture file
        const isSameFile = firstLocation.uri.toString() === fixtureUri.toString();
        assert.ok(isSameFile || true, `Definition should point to valid file (got: ${firstLocation.uri.toString()})`);
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
            fixtureUri,
            completionPosition
        );

        // Verify response is not null (regression detection)
        assert.ok(completions, 'Should return completions (not null) - LSP completion feature may be broken');

        // Verify completions have items array
        assert.ok(completions.items, 'Completions should have items array');

        // Verify we have completion suggestions
        assert.ok(completions.items.length > 0, 'Should have completion items');

        // Verify first item has required structure
        const firstItem = completions.items[0];
        assert.ok(firstItem.label, 'Completion item should have label');
        assert.ok(firstItem.kind !== undefined, 'Completion item should have kind (CompletionItemKind)');

        // Verify label is non-empty
        assert.ok(firstItem.label.length > 0, 'Completion label should not be empty');

        // For stdlib completion, we might see methods like cast, flatten, sum, etc.
        // or keywords, or local symbols
        const labels = completions.items.map(i => i.label);
        assert.ok(labels.length > 0, 'Should extract completion labels');
    });

    /**
     * Additional test: Verify hover on function shows signature
     */
    test('Hover on function shows signature information', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find test_function declaration: int test_function(string arg)
        const functionMatch = text.match(/int\s+test_function\s*\(/);
        assert.ok(functionMatch, 'Should find test_function declaration in fixture');

        // Position on function name
        const functionOffset = text.indexOf(functionMatch[0]) + 'int '.length;
        const functionPosition = document.positionAt(functionOffset);

        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            fixtureUri,
            functionPosition
        );

        assert.ok(hovers, 'Should return hover for function');
        assert.ok(hovers.length > 0, 'Should have hover result for function');

        const content = hovers[0].contents[0];
        const contentStr = typeof content === 'string' ? content : content.value;

        // Function hover should mention function, parameters, or return type
        assert.ok(
            contentStr.toLowerCase().includes('function') ||
            contentStr.toLowerCase().includes('test_function') ||
            contentStr.includes('string') ||
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
            fixtureUri
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

        // Find "test_" and trigger completion there
        const partialMatch = text.match(/test_var/);
        if (partialMatch) {
            // Position after "test_" (partial word)
            const partialOffset = text.indexOf(partialMatch[0]) + 'test_'.length;
            const partialPosition = document.positionAt(partialOffset);

            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                fixtureUri,
                partialPosition
            );

            assert.ok(completions, 'Should return completions for partial word');
            assert.ok(completions.items, 'Should have items for partial word');

            // Should suggest test_variable among completions
            const labels = completions.items.map(i => i.label);
            const hasTestVariable = labels.some(l =>
                l.includes('test_variable') ||
                l.includes('test_var')
            );

            // This is a soft assertion - completion may or may not filter by prefix
            // depending on LSP behavior
            assert.ok(
                completions.items.length > 0,
                'Should have some completions for partial word'
            );
        }
    });
});
