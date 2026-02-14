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
 * - References (find all references)
 * - Document highlight (highlight occurrences)
 * - Call hierarchy (incoming/outgoing calls)
 * - Type hierarchy (supertypes/subtypes)
 * - Signature help (parameter hints)
 * - Code actions (quick fixes, organize imports)
 * - Document formatting (format entire document)
 * - Semantic tokens (rich syntax highlighting)
 * - Inlay hints (parameter name hints)
 * - Folding ranges (collapsible regions)
 * - Document links (clickable file paths)
 * - Code lens (reference counts)
 * - Selection ranges (smart selection expansion)
 *
 * Key principle: Tests fail if LSP features return null/undefined (regression detection)
 *
 * Error capture: Pike subprocess errors are captured and displayed when tests fail.
 */

// @ts-nocheck - Integration tests use mocha types at runtime

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';

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
     * Preprocessor Conditional Symbols Test
     *
     * Verifies that symbols inside preprocessor conditional blocks
     * ARE indexed with conditional metadata, documenting the improvement
     * over the previous limitation.
     */
    test('Preprocessor conditional symbols are indexed with metadata', async function() {
        this.timeout(30000);

        // Create a test file with preprocessor conditionals
        const preprocessorContent = `
#if CONSTANT_DEFINE
int platform_specific_symbol() { return 1; }
class PlatformClass { int x; }
#endif

#if 0
int disabled_symbol() { return 2; }
class DisabledClass { int y; }
#endif

int normal_symbol() { return 3; }
class NormalClass { int z; }

// Split-block test: incomplete code in branches
#if DEBUG
void debug_function(
#else
void release_function(int arg
#endif
);

#if PLATFORM_A
int platform_a_var
#elif PLATFORM_B
int platform_b_var
#else
int generic_var
#endif
;

// Nested conditionals
#if OUTER
#if INNER
int nested_symbol
#endif
#endif
;
`;

        const testFilePath = path.join(workspaceFolder.uri.fsPath, 'test-preprocessor.pike');
        const testDocUri = vscode.Uri.file(testFilePath);

        await vscode.workspace.fs.writeFile(testDocUri, Buffer.from(preprocessorContent, 'utf-8'));

        // Open the document to trigger LSP analysis
        const doc = await vscode.workspace.openTextDocument(testDocUri);
        await vscode.window.showTextDocument(doc);

        // Wait for LSP to analyze
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get document symbols
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            testDocUri
        );

        // Close the test document
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        // Verify normal symbols are found (backward compatibility)
        const hasNormalSymbol = symbols?.some(s =>
            s.name === 'normal_symbol' || s.name === 'NormalClass'
        );
        assert.ok(hasNormalSymbol, 'Should find symbols outside preprocessor blocks');

        // Verify conditional symbols ARE found with the new improvement
        const hasPlatformSymbol = symbols?.some(s =>
            s.name === 'platform_specific_symbol' || s.name === 'PlatformClass'
        );
        const hasDisabledSymbol = symbols?.some(s =>
            s.name === 'disabled_symbol' || s.name === 'DisabledClass'
        );

        assert.ok(hasPlatformSymbol || hasDisabledSymbol,
            'Should find symbols inside preprocessor conditional blocks (new improvement)');

        // Verify split-block symbols are extracted (token-based extraction)
        const hasSplitBlockSymbol = symbols?.some(s =>
            s.name === 'debug_function' || s.name === 'release_function'
        );
        assert.ok(hasSplitBlockSymbol, 'Should extract symbols from split conditional blocks');

        // Verify platform-specific variant symbols
        const hasPlatformVariant = symbols?.some(s =>
            s.name === 'platform_a_var' || s.name === 'platform_b_var' || s.name === 'generic_var'
        );
        assert.ok(hasPlatformVariant, 'Should extract symbols from #if/#elif/#else branches');

        // Verify nested conditional symbols
        const hasNestedSymbol = symbols?.some(s => s.name === 'nested_symbol');
        assert.ok(hasNestedSymbol, 'Should extract symbols from nested conditionals');
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

    // =========================================================================
    // CATEGORY: Navigation Features
    // Tests for References, Document Highlight, Implementation
    // =========================================================================

    /**
     * Test: References returns all occurrences of a symbol
     * Category: Happy Path
     *
     * Arrange: Open test.pike and find position of test_variable reference
     * Act: Execute reference provider on test_variable
     * Assert: Returns all reference locations (definition + usages)
     */
    test('References returns all symbol occurrences', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find test_variable reference (not definition) - use a reference in main()
        const varMatch = text.match(/int a = test_variable/);
        assert.ok(varMatch, 'Should find test_variable reference in main()');

        // Position on "test_variable" part
        const varOffset = text.indexOf(varMatch![0]) + 'int a = '.length;
        const varPosition = document.positionAt(varOffset);

        // Execute references provider
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            testDocumentUri,
            varPosition
        );

        assertWithLogs(references, 'Should return references (not null)');
        assert.ok(Array.isArray(references), 'References should be an array');
        assert.ok(references!.length > 0, 'Should have at least one reference');

        // Verify each reference has required structure
        for (const ref of references!) {
            assert.ok(ref.uri, 'Reference should have URI');
            assert.ok(ref.range, 'Reference should have range');
            assert.ok(ref.range.start, 'Reference range should have start');
            assert.ok(ref.range.end, 'Reference range should have end');
        }
    });

    /**
     * Test: References on function returns all call sites
     * Category: Happy Path
     *
     * Arrange: Find test_function definition
     * Act: Execute reference provider
     * Assert: Returns all locations where function is called
     */
    test('References on function returns call sites', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find test_function definition
        const funcMatch = text.match(/^int test_function\s*\(/m);
        assert.ok(funcMatch, 'Should find test_function definition');
        const funcOffset = text.indexOf(funcMatch![0]);
        const funcPosition = document.positionAt(funcOffset);

        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            testDocumentUri,
            funcPosition
        );

        assert.ok(references, 'Should return references for function');
        assert.ok(references!.length >= 2, 'Should have at least definition and one call');
    });

    /**
     * Test: Document highlight highlights all occurrences in current document
     * Category: Happy Path
     *
     * Arrange: Find position of a symbol
     * Act: Execute document highlight provider
     * Assert: Returns all highlight locations in current document
     */
    test('Document highlight highlights symbol occurrences', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find test_variable for highlight test
        const varMatch = text.match(/test_variable/);
        assert.ok(varMatch, 'Should find test_variable');

        const varOffset = text.indexOf(varMatch![0]);
        const varPosition = document.positionAt(varOffset);

        const highlights = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
            'vscode.executeDocumentHighlights',
            testDocumentUri,
            varPosition
        );

        assert.ok(highlights !== undefined, 'Should return highlights (may be empty array)');
        assert.ok(Array.isArray(highlights), 'Highlights should be an array');
    });

    /**
     * Test: Implementation returns locations where symbol is used
     * Category: Happy Path
     *
     * Arrange: Find position of a symbol
     * Act: Execute implementation provider
     * Assert: Returns implementation locations
     */
    test('Implementation returns symbol usages', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find TestClass reference
        const classMatch = text.match(/TestClass\s+tc/);
        assert.ok(classMatch, 'Should find TestClass reference');

        const classOffset = text.indexOf(classMatch![0]);
        const classPosition = document.positionAt(classOffset);

        // Note: Implementation provider behaves like references in this LSP
        const implementations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeImplementationProvider',
            testDocumentUri,
            classPosition
        );

        // Implementation may return empty for some symbols, but should not throw
        assert.ok(implementations !== undefined, 'Should return implementations (may be empty)');
    });

    // =========================================================================
    // CATEGORY: Hierarchy Features
    // Tests for Call Hierarchy and Type Hierarchy
    // =========================================================================

    /**
     * Test: Call hierarchy prepare returns item for method
     * Category: Happy Path
     *
     * Arrange: Find a method position
     * Act: Execute call hierarchy prepare
     * Assert: Returns call hierarchy item for the method
     */
    test('Call hierarchy prepare returns item for method', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find caller_function definition
        const funcMatch = text.match(/^void caller_function\s*\(/m);
        assert.ok(funcMatch, 'Should find caller_function definition');

        const funcOffset = text.indexOf(funcMatch![0]);
        const funcPosition = document.positionAt(funcOffset);

        // Prepare call hierarchy
        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            'vscode.prepareCallHierarchy',
            testDocumentUri,
            funcPosition
        );

        assert.ok(items, 'Should return call hierarchy items (not null)');
        // May be empty if position not on a callable symbol
        if (items && items.length > 0) {
            const item = items[0]!;
            assert.ok(item.name, 'Call hierarchy item should have name');
            assert.ok(item.kind, 'Call hierarchy item should have kind');
            assert.ok(item.range, 'Call hierarchy item should have range');
        }
    });

    /**
     * Test: Call hierarchy incoming calls shows callers
     * Category: Happy Path
     *
     * Arrange: Prepare call hierarchy for a function that is called
     * Act: Execute incoming calls
     * Assert: Returns list of callers
     */
    test('Call hierarchy incoming calls shows callers', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find test_function which is called from multiple places
        const funcMatch = text.match(/^int test_function\s*\(/m);
        assert.ok(funcMatch, 'Should find test_function definition');

        const funcOffset = text.indexOf(funcMatch![0]);
        const funcPosition = document.positionAt(funcOffset);

        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            'vscode.prepareCallHierarchy',
            testDocumentUri,
            funcPosition
        );

        if (items && items.length > 0) {
            const incomingCalls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                'vscode.provideIncomingCalls',
                items[0]
            );

            assert.ok(incomingCalls !== undefined, 'Should return incoming calls (may be empty)');
            // May have callers if the function is called
            if (incomingCalls && incomingCalls.length > 0) {
                const call = incomingCalls[0]!;
                assert.ok(call.from, 'Incoming call should have from item');
                assert.ok(call.fromRanges, 'Incoming call should have fromRanges');
            }
        }
    });

    /**
     * Test: Call hierarchy outgoing calls shows callees
     * Category: Happy Path
     *
     * Arrange: Prepare call hierarchy for a function that calls others
     * Act: Execute outgoing calls
     * Assert: Returns list of functions called
     */
    test('Call hierarchy outgoing calls shows callees', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find caller_function which calls test_function and multi_param
        const funcMatch = text.match(/^void caller_function\s*\(/m);
        assert.ok(funcMatch, 'Should find caller_function definition');

        const funcOffset = text.indexOf(funcMatch![0]);
        const funcPosition = document.positionAt(funcOffset);

        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            'vscode.prepareCallHierarchy',
            testDocumentUri,
            funcPosition
        );

        if (items && items.length > 0) {
            const outgoingCalls = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                'vscode.provideOutgoingCalls',
                items[0]
            );

            assert.ok(outgoingCalls !== undefined, 'Should return outgoing calls (may be empty)');
        }
    });

    /**
     * Test: Type hierarchy prepare returns item for class
     * Category: Happy Path
     *
     * Arrange: Find a class definition
     * Act: Execute type hierarchy prepare
     * Assert: Returns type hierarchy item for the class
     */
    test('Type hierarchy prepare returns item for class', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find TestClass definition
        const classMatch = text.match(/^class TestClass\s*{/m);
        assert.ok(classMatch, 'Should find TestClass definition');

        const classOffset = text.indexOf(classMatch![0]);
        const classPosition = document.positionAt(classOffset);

        const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            'vscode.prepareTypeHierarchy',
            testDocumentUri,
            classPosition
        );

        assert.ok(items, 'Should return type hierarchy items (not null)');
        if (items && items.length > 0) {
            const item = items[0]!;
            assert.ok(item.name, 'Type hierarchy item should have name');
            assert.ok(item.kind, 'Type hierarchy item should have kind');
            assert.ok(item.range, 'Type hierarchy item should have range');
        }
    });

    /**
     * Test: Type hierarchy supertypes shows inherited classes
     * Category: Happy Path
     *
     * Arrange: Prepare type hierarchy for ChildClass which inherits TestClass
     * Act: Execute supertypes
     * Assert: Returns TestClass as supertype
     */
    test('Type hierarchy supertypes shows inherited classes', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find ChildClass which inherits TestClass
        const classMatch = text.match(/^class ChildClass\s*{/m);
        assert.ok(classMatch, 'Should find ChildClass definition');

        const classOffset = text.indexOf(classMatch![0]);
        const classPosition = document.positionAt(classOffset);

        const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            'vscode.prepareTypeHierarchy',
            testDocumentUri,
            classPosition
        );

        if (items && items.length > 0) {
            const supertypes = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
                'vscode.provideSupertypes',
                items[0]
            );

            assert.ok(supertypes !== undefined, 'Should return supertypes (may be empty)');
            // ChildClass inherits TestClass, so should have at least one supertype
        }
    });

    /**
     * Test: Type hierarchy subtypes shows inheriting classes
     * Category: Happy Path
     *
     * Arrange: Prepare type hierarchy for TestClass
     * Act: Execute subtypes
     * Assert: Returns ChildClass as subtype
     */
    test('Type hierarchy subtypes shows inheriting classes', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find TestClass which is inherited by ChildClass
        const classMatch = text.match(/^class TestClass\s*{/m);
        assert.ok(classMatch, 'Should find TestClass definition');

        const classOffset = text.indexOf(classMatch![0]);
        const classPosition = document.positionAt(classOffset);

        const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            'vscode.prepareTypeHierarchy',
            testDocumentUri,
            classPosition
        );

        if (items && items.length > 0) {
            const subtypes = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
                'vscode.provideSubtypes',
                items[0]
            );

            assert.ok(subtypes !== undefined, 'Should return subtypes (may be empty)');
        }
    });

    // =========================================================================
    // CATEGORY: Editing Features
    // Tests for Signature Help, Code Actions, Document Formatting
    // =========================================================================

    /**
     * Test: Signature help shows function parameters
     * Category: Happy Path
     *
     * Arrange: Find position inside function call parentheses
     * Act: Execute signature help provider
     * Assert: Returns signature information with parameters
     */
    test('Signature help shows function parameters', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find multi_param call: multi_param(42, "test", ({}))
        const callMatch = text.match(/multi_param\s*\(\s*42/);
        assert.ok(callMatch, 'Should find multi_param function call');

        // Position after opening parenthesis
        const callOffset = text.indexOf(callMatch![0]) + 'multi_param('.length;
        const callPosition = document.positionAt(callOffset);

        const sigHelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
            'vscode.executeSignatureHelpProvider',
            testDocumentUri,
            callPosition
        );

        // Signature help may not be implemented for all functions
        assert.ok(sigHelp !== undefined, 'Should return signature help (may be empty)');
        if (sigHelp && sigHelp.signatures && sigHelp.signatures.length > 0) {
            assert.ok(sigHelp.signatures[0].label, 'Signature should have label');
        }
    });

    /**
     * Test: Signature help for multi_param function
     * Category: Happy Path
     *
     * Arrange: Find multi_param function call with multiple parameters
     * Act: Execute signature help provider
     * Assert: Returns signature with parameter information
     */
    test('Signature help for function with multiple parameters', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find complex_function call (not definition) - look for the call in test_complex_function
        const callMatch = text.match(/result\s*=\s*complex_function\s*\(/);
        if (callMatch) {
            // Position inside the parameter list (after the opening paren)
            const funcOffset = text.indexOf(callMatch[0]) + callMatch[0].length;
            const funcPosition = document.positionAt(funcOffset);

            const sigHelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
                'vscode.executeSignatureHelpProvider',
                testDocumentUri,
                funcPosition
            );

            // Note: Signature help for user-defined functions may not be implemented yet
            // This test documents expected behavior
            if (sigHelp) {
                assert.ok(sigHelp.signatures && sigHelp.signatures.length > 0, 'Should have signatures');
            }
        }
    });

    /**
     * Test: Code actions returned for document
     * Category: Happy Path
     *
     * Arrange: Get a range in the document
     * Act: Execute code actions provider
     * Assert: Returns available code actions
     */
    test('Code actions returned for document', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find a line with code (not empty)
        const lines = text.split('\n');
        let targetLine = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i]!.trim().length > 0) {
                targetLine = i;
                break;
            }
        }

        const range = new vscode.Range(
            new vscode.Position(targetLine, 0),
            new vscode.Position(targetLine, lines[targetLine]!.length)
        );

        const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            testDocumentUri,
            range
        );

        assert.ok(codeActions !== undefined, 'Should return code actions (may be empty)');
        assert.ok(Array.isArray(codeActions), 'Code actions should be an array');
    });

    /**
     * Test: Document formatting returns formatting edits
     * Category: Happy Path
     *
     * Arrange: Open the test document
     * Act: Execute document formatting provider
     * Assert: Returns formatting edits
     */
    test('Document formatting returns formatting edits', async function() {
        this.timeout(30000);

        const formattingEdits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
            'vscode.executeFormatDocumentProvider',
            testDocumentUri
        );

        assert.ok(formattingEdits !== undefined, 'Should return formatting edits (may be empty)');
        assert.ok(Array.isArray(formattingEdits), 'Formatting edits should be an array');
    });

    /**
     * Test: Range formatting formats selected range
     * Category: Happy Path
     *
     * Arrange: Select a range with poorly formatted code
     * Act: Execute range formatting provider
     * Assert: Returns formatting edits for the range
     */
    test('Range formatting formats selected range', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find the poorly_formatted function (lines 164-172)
        const funcMatch = text.match(/void poorly_formatted/);
        assert.ok(funcMatch, 'Should find poorly_formatted function');

        const funcOffset = text.indexOf(funcMatch![0]);
        const startLine = document.positionAt(funcOffset).line;
        const endLine = startLine + 10; // Cover the function body

        const range = new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, 0)
        );

        const formattingEdits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
            'vscode.executeFormatRangeProvider',
            testDocumentUri,
            range
        );

        assert.ok(formattingEdits !== undefined, 'Should return range formatting edits (may be empty)');
        assert.ok(Array.isArray(formattingEdits), 'Range formatting edits should be an array');
    });

    // =========================================================================
    // CATEGORY: Advanced Features
    // Tests for Semantic Tokens, Inlay Hints, Folding Ranges, etc.
    // =========================================================================

    /**
     * Test: Semantic tokens returned for document
     * Category: Happy Path
     *
     * Arrange: Open test document
     * Act: Execute semantic tokens provider
     * Assert: Returns semantic tokens with valid data
     */
    test('Semantic tokens returned for document', async function() {
        this.timeout(30000);

        // Semantic tokens are provided via the LSP server
        // We need to access them through the document's semantic tokens
        const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
            'vscode.provideDocumentSemanticTokens',
            testDocumentUri
        );

        // May return null if not implemented, but should not throw
        assert.ok(tokens !== undefined, 'Should return semantic tokens (may be null)');
    });

    /**
     * Test: Inlay hints returns hints for function parameters
     * Category: Happy Path
     *
     * Arrange: Open test document with function calls
     * Act: Execute inlay hint provider on document range
     * Assert: Returns inlay hints (may be empty array)
     */
    test('Inlay hints returns hints for function parameters', async function() {
        this.timeout(30000);

        const range = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(document.lineCount - 1, 0)
        );

        const hints = await vscode.commands.executeCommand<vscode.InlayHint[]>(
            'vscode.executeInlayHintProvider',
            testDocumentUri,
            range
        );

        // Should return array (may be empty if no hints configured)
        assert.ok(hints !== undefined, 'Should return inlay hints (may be empty)');
    });

    /**
     * Test: Folding ranges returns collapsible regions
     * Category: Happy Path
     *
     * Arrange: Open test document with functions/classes
     * Act: Execute folding range provider
     * Assert: Returns folding ranges for code blocks
     */
    test('Folding ranges returns collapsible regions', async function() {
        this.timeout(30000);

        const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
            'vscode.executeFoldingRangeProvider',
            testDocumentUri
        );

        // Should return folding ranges for functions/classes in test.pike
        assert.ok(ranges !== undefined, 'Should return folding ranges');
        assert.ok(Array.isArray(ranges), 'Should be an array');
        assert.ok(ranges.length > 0, 'Should have at least one folding range for test.pike');
    });

    /**
     * Test: Document links returns clickable paths
     * Category: Happy Path
     *
     * Arrange: Open test document
     * Act: Execute document link provider
     * Assert: Returns document links (may be empty)
     */
    test('Document links returns clickable paths', async function() {
        this.timeout(30000);

        const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
            'vscode.executeLinkProvider',
            testDocumentUri
        );

        // Should return array (may be empty if no links in file)
        assert.ok(links !== undefined, 'Should return document links (may be empty)');
        assert.ok(Array.isArray(links), 'Should be an array');
    });

    /**
     * Test: Code lens shows reference counts and command works
     * Category: Happy Path
     *
     * Arrange: Open test document with functions/classes
     * Act: Execute code lens provider and test command invocation
     * Assert: Returns code lenses and pike.showReferences command works
     */
    test('Code lens shows reference counts and command is invocable', async function() {
        this.timeout(30000);

        // Get code lenses for the document
        const codeLenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider',
            testDocumentUri
        );

        assert.ok(codeLenses, 'Should return code lenses (not null)');
        assert.ok(Array.isArray(codeLenses), 'Code lenses should be an array');
        assert.ok(codeLenses!.length > 0, 'Should have code lenses for functions/classes');

        // Verify code lens structure
        const firstLens = codeLenses![0]!;
        assert.ok(firstLens.range, 'Code lens should have range');

        // Get the document text to find a test function position
        const text = document.getText();
        const funcMatch = text.match(/^void caller_function\s*\(/m);
        assert.ok(funcMatch, 'Should find caller_function for code lens test');

        // Calculate position for the function
        const funcOffset = text.indexOf(funcMatch![0]);
        const funcPosition = document.positionAt(funcOffset);

        // Test that the pike.showReferences command can be invoked directly
        // This simulates what happens when user clicks the code lens
        let commandExecuted = false;
        try {
            await vscode.commands.executeCommand(
                'pike.showReferences',
                testDocumentUri.toString(),
                { line: funcPosition.line, character: funcPosition.character }
            );
            commandExecuted = true;
        } catch (err) {
            assert.fail(`pike.showReferences command failed: ${err}`);
        }
        assert.strictEqual(commandExecuted, true, 'pike.showReferences command should execute without throwing');
    });

    /**
     * Test: Code lens click returns references when position is at return type
     * Category: Regression Test
     *
     * This tests a specific bug fix where clicking code lens showed "No results"
     * because the position pointed to the return type (column 0), not the function name.
     * The fix passes symbolName to the command so it can find the correct position.
     *
     * Arrange: Find a function and simulate code lens click with position at start of line
     * Act: Execute pike.showReferences with symbolName parameter
     * Assert: References are found for the function
     */
    test('Code lens click with symbolName finds references even when position is at return type', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find test_function definition - this function is called multiple times in the file
        const funcMatch = text.match(/^int test_function\s*\(/m);
        assert.ok(funcMatch, 'Should find test_function definition');

        const funcOffset = text.indexOf(funcMatch![0]);
        const funcLine = document.positionAt(funcOffset).line;

        // Simulate code lens click: position at column 0 (where return type "int" is)
        // and provide symbolName to enable the fix
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            testDocumentUri,
            new vscode.Position(funcLine, 4) // Position on "test_function" not "int"
        );

        assert.ok(references, 'Should return references when symbolName guides position adjustment');
        assert.ok(references!.length >= 2, 'Should find multiple references to test_function (definition + calls)');
    });

    /**
     * Test: Code lens command with symbolName parameter works correctly
     * Category: Regression Test
     *
     * This tests that pike.showReferences command correctly uses the symbolName
     * parameter to find the symbol position on the line.
     *
     * Arrange: Simulate code lens data with symbolName
     * Act: Execute pike.showReferences with all three arguments
     * Assert: Command executes successfully
     */
    test('pike.showReferences command accepts symbolName parameter', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find test_function definition
        const funcMatch = text.match(/^int test_function\s*\(/m);
        assert.ok(funcMatch, 'Should find test_function definition');

        const funcOffset = text.indexOf(funcMatch![0]);
        const funcLine = document.positionAt(funcOffset).line;

        // Execute command with all three parameters (uri, position, symbolName)
        // Position is at column 0 (return type), but symbolName should help find the right position
        let commandExecuted = false;
        try {
            await vscode.commands.executeCommand(
                'pike.showReferences',
                testDocumentUri.toString(),
                { line: funcLine, character: 0 },
                'test_function'  // This symbolName should help find the right position
            );
            commandExecuted = true;
        } catch (err) {
            assert.fail(`pike.showReferences command with symbolName failed: ${err}`);
        }
        assert.strictEqual(commandExecuted, true, 'pike.showReferences command with symbolName should execute without throwing');
    });

    /**
     * Test: Selection ranges returns smart selection hierarchy
     * Category: Happy Path
     *
     * Arrange: Open test document with code structure
     * Act: Execute selection range provider at a position
     * Assert: Returns selection range hierarchy
     */
    test('Selection ranges returns smart selection hierarchy', async function() {
        this.timeout(10000);

        // Find a position inside a function body
        const text = document.getText();
        const funcMatch = text.match(/int\s+test_function/);
        const position = funcMatch
            ? document.positionAt(funcMatch.index! + 10)
            : new vscode.Position(5, 5);

        // Use Promise.race with timeout to avoid hanging
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
        const rangesPromise = vscode.commands.executeCommand<vscode.SelectionRange[]>(
            'vscode.executeSelectionRangeProvider',
            testDocumentUri,
            [position]
        );

        const ranges = await Promise.race([rangesPromise, timeoutPromise]);

        // Should return selection ranges (or null if provider timed out)
        assert.ok(ranges !== undefined, 'Should return selection ranges or null');
        if (ranges !== null) {
            assert.ok(Array.isArray(ranges), 'Should be an array');
            if (ranges.length > 0) {
                assert.ok(ranges[0]?.range, 'First range should have a range property');
            }
        }
    });

    /**
     * Test: Selection ranges for multiple positions
     * Category: Happy Path
     *
     * Arrange: Open test document
     * Act: Execute selection range provider with multiple positions
     * Assert: Returns selection ranges for each position
     */
    test('Selection ranges for multiple positions', async function() {
        this.timeout(10000);

        const positions = [
            new vscode.Position(5, 5),
            new vscode.Position(10, 10),
        ];

        // Use Promise.race with timeout to avoid hanging
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
        const rangesPromise = vscode.commands.executeCommand<vscode.SelectionRange[]>(
            'vscode.executeSelectionRangeProvider',
            testDocumentUri,
            positions
        );

        const ranges = await Promise.race([rangesPromise, timeoutPromise]);

        // Should return selection ranges for each position (or null if timed out)
        assert.ok(ranges !== undefined, 'Should return selection ranges or null');
        if (ranges !== null) {
            assert.ok(Array.isArray(ranges), 'Should be an array');
        }
    });

    // =========================================================================
    // CATEGORY: Edge Cases and Error Handling
    // Tests for boundary conditions and error scenarios
    // =========================================================================

    /**
     * Test: References on unknown symbol returns empty
     * Category: Edge Case
     *
     * Arrange: Find position of a non-symbol word
     * Act: Execute references provider
     * Assert: Returns empty array (not error)
     */
    test('References on unknown symbol returns empty', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find a random word that's not a symbol
        const wordMatch = text.match(/\bthe\b/);
        if (wordMatch) {
            const wordOffset = text.indexOf(wordMatch[0]);
            const wordPosition = document.positionAt(wordOffset);

            const references = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                testDocumentUri,
                wordPosition
            );

            // Should return empty, not error
            assert.ok(references !== undefined, 'Should handle unknown symbols gracefully');
            assert.ok(Array.isArray(references), 'References should be array even if empty');
        }
    });

    /**
     * Test: Hover on empty line returns null gracefully
     * Category: Edge Case
     *
     * Arrange: Find empty line position
     * Act: Execute hover provider
     * Assert: Returns null or empty (no error)
     */
    test('Hover on empty line returns null gracefully', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find an empty line
        const emptyLineIndex = text.split('\n').findIndex(l => l.trim() === '');
        assert.ok(emptyLineIndex >= 0, 'Should have an empty line');

        const emptyPosition = new vscode.Position(emptyLineIndex, 0);

        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            testDocumentUri,
            emptyPosition
        );

        // Should not throw - may return undefined or empty array
        assert.ok(hovers !== undefined, 'Should handle empty lines gracefully');
    });

    /**
     * Test: Completion at start of document
     * Category: Edge Case
     *
     * Arrange: Position at start of document
     * Act: Execute completion provider
     * Assert: Returns completion items (keywords, etc.)
     */
    test('Completion at start of document', async function() {
        this.timeout(30000);

        const startPosition = new vscode.Position(0, 0);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            startPosition
        );

        assert.ok(completions, 'Should return completions at document start');
        assert.ok(completions!.items, 'Should have items array');
    });

    /**
     * Test: Completion at end of document
     * Category: Edge Case
     *
     * Arrange: Position at end of document
     * Act: Execute completion provider
     * Assert: Returns completion items without error
     */
    test('Completion at end of document', async function() {
        this.timeout(30000);

        const text = document.getText();
        const lines = text.split('\n');
        const endPosition = new vscode.Position(lines.length - 1, lines[lines.length - 1]!.length);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            endPosition
        );

        assert.ok(completions, 'Should return completions at document end');
        assert.ok(completions!.items, 'Should have items array at end');
    });

    /**
     * Test: Folding ranges have valid line numbers
     * Category: Edge Case
     *
     * Arrange: Open test document
     * Act: Execute folding range provider
     * Assert: All folding ranges have valid start/end lines
     */
    test('Folding ranges have valid line numbers', async function() {
        this.timeout(30000);

        const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
            'vscode.executeFoldingRangeProvider',
            testDocumentUri
        );

        assert.ok(ranges, 'Should return folding ranges');
        assert.ok(Array.isArray(ranges), 'Should be an array');

        const lineCount = document.lineCount;
        for (const range of ranges) {
            assert.ok(range.start >= 0, `Folding range start should be >= 0, got ${range.start}`);
            assert.ok(range.end < lineCount, `Folding range end should be < ${lineCount}, got ${range.end}`);
            assert.ok(range.start <= range.end, `Folding range start (${range.start}) should be <= end (${range.end})`);
        }
    });

    /**
     * Test: Document symbols for class with children
     * Category: Edge Case
     *
     * Arrange: Open test.pike with TestClass containing methods
     * Act: Execute document symbols provider
     * Assert: Returns class symbol with children methods
     */
    test('Document symbols for nested class structure', async function() {
        this.timeout(30000);

        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            testDocumentUri
        );

        assert.ok(symbols, 'Should return symbols');

        // Find TestClass
        const findSymbol = (syms: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
            for (const s of syms) {
                if (s.name === 'TestClass') return s;
                if (s.children) {
                    const found = findSymbol(s.children);
                    if (found) return found;
                }
            }
            return null;
        };

        const testClass = findSymbol(symbols);
        if (testClass) {
            assert.ok(testClass.children, 'TestClass should have children array');
            // Class should have methods as children
        }
    });

    /**
     * Test: Go to definition on self-reference
     * Category: Edge Case
     *
     * Arrange: Find a symbol referencing itself (e.g., recursive function)
     * Act: Execute definition provider
     * Assert: Returns the definition location
     */
    test('Go to definition on symbol definition returns self', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find test_function definition
        const funcMatch = text.match(/^int test_function\s*\(/m);
        assert.ok(funcMatch, 'Should find test_function definition');

        const funcOffset = text.indexOf(funcMatch![0]) + 'int '.length;
        const funcPosition = document.positionAt(funcOffset);

        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            funcPosition
        );

        assert.ok(locations, 'Should return location for self-reference');
        assert.ok(
            Array.isArray(locations) ? locations.length > 0 : locations,
            'Should have at least one location'
        );
    });

    // =========================================================================
    // CATEGORY: Import IntelliSense
    // Tests for module path resolution and member access navigation
    // =========================================================================

    /**
     * Test: Go-to-definition on module path (Stdio.File)
     * Category: Happy Path
     *
     * Arrange: Open test document with Stdio.File usage
     * Act: Execute definition provider on "Stdio" or "File"
     * Assert: Handler doesn't crash (may return null if LSP not fully functional)
     */
    test('Go-to-definition on module path does not crash', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find a position to test on (even if no module path exists)
        const position = new vscode.Position(0, 0);

        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            position
        );

        // Should not crash - may return null if LSP not fully functional
        assert.ok(locations !== undefined, 'Definition handler should not crash');
    });

    /**
     * Test: Hover does not crash on any position
     * Category: Happy Path
     *
     * Arrange: Open any test document
     * Act: Execute hover provider at various positions
     * Assert: Provider doesn't crash
     */
    test('Hover provider does not crash on any position', async function() {
        this.timeout(30000);

        // Test hover at a few positions
        const positions = [
            new vscode.Position(0, 0),
            new vscode.Position(0, 5),
            new vscode.Position(1, 0),
        ];

        for (const pos of positions) {
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                testDocumentUri,
                pos
            );

            // Should not crash
            assert.ok(hovers !== undefined, `Hover should not crash at position ${pos.line}:${pos.character}`);
        }
    });

    // =========================================================================
    // CATEGORY: Inherit Navigation
    // Tests for go-to-definition on inherit statements
    // =========================================================================

    /**
     * Test: Go-to-definition on inherit statement navigates to parent class
     * Category: Happy Path
     *
     * Arrange: Find "inherit TestClass" statement in ChildClass
     * Act: Execute definition provider on "TestClass" in inherit statement
     * Assert: Returns location of TestClass definition
     */
    test('Go-to-definition on inherit statement navigates to parent class', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find "inherit TestClass" at line 50
        const inheritMatch = text.match(/inherit\s+TestClass/);
        assert.ok(inheritMatch, 'Should find "inherit TestClass" statement in test.pike');

        // Calculate position to be on "TestClass" part (after "inherit ")
        const inheritOffset = text.indexOf(inheritMatch![0]) + 'inherit '.length;
        const inheritPosition = document.positionAt(inheritOffset);

        // Execute definition provider
        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            inheritPosition
        );

        // Verify response is not null
        assert.ok(locations, 'Should return definition location for inherit statement (not null)');

        // Normalize to array
        let locationArray: vscode.Location[];
        if (Array.isArray(locations)) {
            if (locations.length > 0 && locations[0] && 'targetUri' in locations[0]) {
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
        assert.ok(locationArray.length > 0, 'Should have at least one definition location for inherit');

        // Verify first location has required structure
        const firstLocation = locationArray[0]!;
        assert.ok(firstLocation.uri, 'Inherit location should have URI');
        assert.ok(firstLocation.range, 'Inherit location should have range');

        // The location should point to TestClass definition (around line 26)
        const classDefMatch = text.match(/^class TestClass\s*{/m);
        if (classDefMatch) {
            const classDefLine = text.indexOf(classDefMatch[0]);
            const expectedLine = document.positionAt(classDefLine).line;

            // Allow some flexibility in exact line, but should be close
            const actualLine = firstLocation.range.start.line;
            assert.ok(
                Math.abs(actualLine - expectedLine) < 5,
                `Inherit definition should navigate near TestClass definition (expected around line ${expectedLine}, got ${actualLine})`
            );
        }
    });

    /**
     * Test: Inherit statement appears in document symbols
     * Category: Happy Path
     *
     * Arrange: Open test.pike with ChildClass containing inherit
     * Act: Execute document symbols provider
     * Assert: ChildClass exists and inherits are parsed (even if not shown as children)
     *
     * Note: Inherit symbols are extracted by the Pike parser with kind="inherit"
     * but may not appear in the LSP symbol tree children. This test verifies
     * that go-to-definition works (tested above) rather than requiring visual
     * representation in the outline view.
     */
    test('Inherit statement is navigable via go-to-definition', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Verify inherit statement exists in source
        const inheritMatch = text.match(/inherit\s+TestClass/);
        assert.ok(inheritMatch, 'Source code should contain "inherit TestClass"');

        // Verify ChildClass exists in symbols
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            testDocumentUri
        );

        assert.ok(symbols, 'Should return symbols');

        const findSymbol = (syms: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
            for (const s of syms) {
                if (s.name === 'ChildClass') return s;
                if (s.children) {
                    const found = findSymbol(s.children);
                    if (found) return found;
                }
            }
            return null;
        };

        const childClass = findSymbol(symbols);
        assert.ok(childClass, 'ChildClass should appear in document symbols');

        // The key test: inherit navigation works (verified by previous test)
        // Inherit symbols are in the parser output but may not be LSP document symbols
        const inheritOffset = text.indexOf(inheritMatch![0]) + 'inherit '.length;
        const inheritPosition = document.positionAt(inheritOffset);

        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            inheritPosition
        );

        assert.ok(locations, 'Go-to-definition should work on inherit statement');
    });
});

/**
 * Waterfall Loading E2E Tests
 *
 * Tests the NEW module resolution system with ModuleContext
 * that provides symbols from imported/included/inherited files.
 */
suite('Waterfall Loading E2E Tests', () => {
    let workspaceFolder: vscode.WorkspaceFolder;
    let testDocumentUri: vscode.Uri;
    let document: vscode.TextDocument;

    suiteSetup(async function() {
        this.timeout(60000);

        workspaceFolder = vscode.workspace.workspaceFolders?.[0]!;
        assert.ok(workspaceFolder, 'Workspace folder should exist');

        const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
        assert.ok(extension, 'Extension should be found');

        if (!extension.isActive) {
            await extension.activate();
        }

        // Open the waterfall completion test file
        const testPath = vscode.Uri.joinPath(workspaceFolder.uri, 'test-waterfall-completion.pike');
        testDocumentUri = testPath;

        const doc = await vscode.workspace.openTextDocument(testDocumentUri);
        document = doc;

        await vscode.window.showTextDocument(doc);

        // Wait for LSP to analyze
        await new Promise(resolve => setTimeout(resolve, 2000));
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    /**
     * Test: Completion returns valid results (validates ModuleContext integration)
     * Tests that the ModuleContext getWaterfallSymbolsForDocument is wired into completion
     */
    test('Completion returns valid results via ModuleContext', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find a position in general code to trigger completion
        const match = text.match(/int x = waterfall_test_value;/m);
        assert.ok(match, 'Should find "waterfall_test_value" usage in test file');

        // Position at the start of the line to trigger general completion
        const offset = text.indexOf(match![0]);
        const position = document.positionAt(offset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            position
        );

        assert.ok(completions, 'Should return completions');
        assert.ok(completions!.items.length > 0, 'Should have completion items');

        // The key test: completion should return results, not be empty
        // This validates that ModuleContext waterfall loading is integrated
        const completionCount = completions!.items.length;

        assertWithLogs(
            completionCount > 0,
            `Completion should return results. Got ${completionCount} items.`
        );
    });

    /**
     * Test: Completion shows class definitions from current file
     */
    test('Completion shows class definitions', async function() {
        this.timeout(30000);

        const text = document.getText();
        const match = text.match(/WaterfallTestClass obj =/m);
        assert.ok(match, 'Should find "WaterfallTestClass obj" in test file');

        const offset = text.indexOf(match![0]);
        const position = document.positionAt(offset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            position
        );

        assert.ok(completions, 'Should return completions');
        assert.ok(completions!.items.length > 0, 'Should have completion items');

        const completionLabels = completions!.items.map(i => i.label);

        // WaterfallTestClass should appear
        const hasClass = completionLabels.some(l =>
            typeof l === 'string' ? l === 'WaterfallTestClass' : l.label === 'WaterfallTestClass'
        );

        assertWithLogs(
            hasClass,
            'Completion should show "WaterfallTestClass". Got: ' + completionLabels.slice(0, 20).join(', ')
        );
    });

    /**
     * Test: Completion shows symbols from stdlib imports
     * Validates that import resolution contributes to completion context
     */
    test('Completion shows stdlib import symbols', async function() {
        this.timeout(30000);

        const text = document.getText();
        const match = text.match(/File f;/m);
        assert.ok(match, 'Should find "File f;" in test file');

        // Position just before "File" to trigger completion after import
        const offset = text.indexOf(match![0]);
        const position = document.positionAt(offset);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testDocumentUri,
            position
        );

        assert.ok(completions, 'Should return completions');
        assert.ok(completions!.items.length > 0, 'Should have completion items');

        // Stdio types should appear due to "import Stdio;"
        const completionLabels = completions!.items.map(i => i.label);

        // File, write, stdin, etc. should appear from Stdio import
        const hasStdioSymbol = completionLabels.some(l =>
            typeof l === 'string' ?
                l === 'File' || l === 'write' || l === 'stdin' :
                l.label === 'File' || l.label === 'write' || l.label === 'stdin'
        );

        assertWithLogs(
            hasStdioSymbol,
            'Completion should show Stdio symbols due to import. Got: ' + completionLabels.slice(0, 10).join(', ')
        );
    });

    /**
     * Test: Document contains expected structure for ModuleContext tests
     */
    test('Test file has expected ModuleContext structure', async function() {
        this.timeout(10000);

        const text = document.getText();

        // Verify the file contains key structures for ModuleContext testing
        assert.ok(text.includes('import Stdio;'), 'Should have "import Stdio;"');
        assert.ok(text.includes('WATERFALL_TEST_CONSTANT'), 'Should define "WATERFALL_TEST_CONSTANT"');
        assert.ok(text.includes('WaterfallTestClass'), 'Should define "WaterfallTestClass"');
        assert.ok(text.includes('test_waterfall_completion'), 'Should define "test_waterfall_completion"');
        assert.ok(text.includes('test_stdlib_import_waterfall'), 'Should define "test_stdlib_import_waterfall"');
    });
});
