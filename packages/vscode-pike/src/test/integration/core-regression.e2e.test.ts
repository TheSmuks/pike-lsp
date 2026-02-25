// @ts-nocheck - Integration tests use mocha types at runtime

import * as assert from 'assert';
import { suite, test } from 'mocha';
import { hoverText, labelOf, normalizeLocations, positionForRegex, waitFor } from './helpers';

let vscode: any;
let vscodeAvailable = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  vscode = require('vscode');
} catch {
  vscodeAvailable = false;
}

suite('Core Regression E2E Tests', () => {
  let workspaceFolder: any;
  let testDocumentUri: any;
  let document: any;

  suiteSetup(async function () {
    if (!vscodeAvailable) {
      this.skip();
      return;
    }
    this.timeout(60000);

    workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder should exist');

    const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
    assert.ok(extension, 'Extension should be found');
    if (!extension.isActive) {
      await extension.activate();
    }

    testDocumentUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');
    document = await vscode.workspace.openTextDocument(testDocumentUri);
    await vscode.window.showTextDocument(document);

    await waitFor(
      'core regression LSP readiness',
      () => vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', testDocumentUri),
      (symbols: any) => Array.isArray(symbols) && symbols.length > 0,
      20000
    );
  });

  suiteTeardown(async () => {
    if (document) {
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  });

  const providerCases = [
    {
      name: 'document symbols include known fixture symbols',
      run: async () => {
        const symbols = await vscode.commands.executeCommand<any[]>(
          'vscode.executeDocumentSymbolProvider',
          testDocumentUri
        );
        assert.ok(
          Array.isArray(symbols) && symbols.length > 0,
          'Document symbols should be returned'
        );
        const names = symbols.map(s => s.name);
        assert.ok(names.includes('test_function'), 'Symbols should include test_function');
        assert.ok(names.includes('TestClass'), 'Symbols should include TestClass');
      },
    },
    {
      name: 'completion on Array includes known stdlib methods',
      run: async () => {
        const completionPosition = positionForRegex(document, /Array\./, 'Array.'.length);
        const completions = await waitFor(
          'Array completions',
          () =>
            vscode.commands.executeCommand<any>(
              'vscode.executeCompletionItemProvider',
              testDocumentUri,
              completionPosition
            ),
          value => value?.items?.length > 0
        );

        const labels = completions.items.map(labelOf);
        assert.ok(
          labels.includes('sum') || labels.includes('map') || labels.includes('filter'),
          `Expected known Array methods. Got: ${labels.slice(0, 20).join(', ')}`
        );
      },
    },
    {
      name: 'hover on TestClass usage returns class-related info',
      run: async () => {
        const hoverPosition = positionForRegex(document, /TestClass\s+tc\s*=/);
        const hovers = await vscode.commands.executeCommand<any[]>(
          'vscode.executeHoverProvider',
          testDocumentUri,
          hoverPosition
        );

        assert.ok(
          Array.isArray(hovers) && hovers.length > 0,
          'Hover should return at least one result'
        );
        const content = hoverText(hovers[0]);
        assert.ok(
          content.includes('TestClass') || content.toLowerCase().includes('class'),
          `Hover should mention class info. Got: ${content}`
        );
      },
    },
    {
      name: 'go-to-definition resolves test_function call to declaration',
      run: async () => {
        const referencePosition = positionForRegex(
          document,
          /return test_function\("test"\)/,
          'return '.length
        );
        const rawLocations = await vscode.commands.executeCommand<any>(
          'vscode.executeDefinitionProvider',
          testDocumentUri,
          referencePosition
        );
        const locations = normalizeLocations(rawLocations);

        assert.ok(locations.length > 0, 'Definition should return locations');
        const line = document.lineAt(locations[0].range.start.line).text;
        assert.ok(
          line.includes('int test_function'),
          `Definition should resolve to declaration. Got: ${line}`
        );
      },
    },
    {
      name: 'references for test_variable include multiple occurrences',
      run: async () => {
        const varPosition = positionForRegex(document, /int a = test_variable/, 'int a = '.length);
        const references = await vscode.commands.executeCommand<any[]>(
          'vscode.executeReferenceProvider',
          testDocumentUri,
          varPosition
        );

        assert.ok(Array.isArray(references), 'References should return an array');
        assert.ok(
          references.length >= 3,
          `Expected multiple references. Got: ${references.length}`
        );
      },
    },
    {
      name: 'call hierarchy outgoing calls include known callees',
      run: async () => {
        const funcPosition = positionForRegex(
          document,
          /^void caller_function\s*\(/m,
          'void '.length
        );
        const items = await vscode.commands.executeCommand<any[]>(
          'vscode.prepareCallHierarchy',
          testDocumentUri,
          funcPosition
        );

        assert.ok(Array.isArray(items), 'Call hierarchy prepare should return an array');
        if (items.length === 0) {
          return;
        }
        const outgoing = await vscode.commands.executeCommand<any[]>(
          'vscode.provideOutgoingCalls',
          items[0]
        );
        assert.ok(Array.isArray(outgoing), 'Outgoing calls should return an array');
        if (outgoing.length > 0) {
          const targets = outgoing.map(call => call.to?.name).filter(Boolean);
          assert.ok(
            targets.includes('test_function') || targets.includes('multi_param'),
            `Expected known callees. Got: ${targets.join(', ')}`
          );
        }
      },
    },
    {
      name: 'type hierarchy for TestClass returns item and optional ChildClass subtype',
      run: async () => {
        const classPosition = positionForRegex(document, /^class TestClass\s*{/m, 'class '.length);
        const items = await vscode.commands.executeCommand<any[]>(
          'vscode.prepareTypeHierarchy',
          testDocumentUri,
          classPosition
        );

        assert.ok(Array.isArray(items) && items.length > 0, 'Type hierarchy should return item');
        const subtypes = await vscode.commands.executeCommand<any[]>(
          'vscode.provideSubtypes',
          items[0]
        );
        assert.ok(Array.isArray(subtypes), 'Subtypes call should return array');
        if (subtypes.length > 0) {
          assert.ok(
            subtypes.some(s => s.name === 'ChildClass'),
            'Expected ChildClass subtype when subtypes exist'
          );
        }
      },
    },
    {
      name: 'range formatting produces edits for poorly formatted block',
      run: async () => {
        const start = positionForRegex(document, /^void poorly_formatted\(\)/m);
        const range = new vscode.Range(
          new vscode.Position(start.line, 0),
          new vscode.Position(start.line + 8, 0)
        );
        const edits = await vscode.commands.executeCommand<any[]>(
          'vscode.executeFormatRangeProvider',
          testDocumentUri,
          range
        );

        assert.ok(Array.isArray(edits), 'Range formatting should return edits array');
        assert.ok(edits.length > 0, 'Expected formatting edits for poorly formatted block');
      },
    },
  ];

  for (const providerCase of providerCases) {
    test(providerCase.name, async function () {
      this.timeout(30000);
      await providerCase.run();
    });
  }

  test('diagnostics report syntax error in temporary file', async function () {
    this.timeout(30000);

    const errorUri = vscode.Uri.joinPath(workspaceFolder.uri, 'core-regression-error.pike');
    const errorContent = `int main(\n  return 0;\n}\n`;
    await vscode.workspace.fs.writeFile(errorUri, new TextEncoder().encode(errorContent));

    try {
      const errorDoc = await vscode.workspace.openTextDocument(errorUri);
      await vscode.window.showTextDocument(errorDoc);

      const diagnostics = await waitFor(
        'core regression syntax diagnostics',
        () => vscode.languages.getDiagnostics(errorUri),
        (value: any[]) =>
          Array.isArray(value) && value.some(d => d.severity === vscode.DiagnosticSeverity.Error)
      );
      assert.ok(diagnostics.length > 0, 'Syntax error should produce diagnostics');
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.workspace.fs.delete(errorUri);
    }
  });
});
