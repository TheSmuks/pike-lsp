// @ts-nocheck - Integration tests use mocha types at runtime

import * as assert from 'assert';
import { suite, test } from 'mocha';
import { labelOf, normalizeLocations, positionForRegex, waitFor } from './helpers';

let vscode: any;
let vscodeAvailable = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- VS Code integration tests use CommonJS require for the vscode runtime module
  vscode = require('vscode');
} catch {
  vscodeAvailable = false;
}

suite('E2E Workflow Tests', () => {
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
      'initial document symbols',
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

  test('46.1 Open Pike file and verify language features activate', async function () {
    this.timeout(30000);

    assert.strictEqual(document.languageId, 'pike', 'Document should have Pike language ID');
    const symbols = await vscode.commands.executeCommand<any[]>(
      'vscode.executeDocumentSymbolProvider',
      testDocumentUri
    );
    assert.ok(Array.isArray(symbols) && symbols.length > 0, 'Document symbols should be returned');
    assert.ok(
      symbols.some(s => s.name === 'test_function'),
      'Fixture symbol test_function should exist'
    );
  });

  test('46.2 Code completion workflow triggers and inserts suggestion', async function () {
    this.timeout(30000);

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
      labels.includes('sum'),
      `Expected Array completion to include sum. Got: ${labels.slice(0, 20).join(', ')}`
    );
  });

  test('46.3 Go-to-definition workflow navigates to symbol definition', async function () {
    this.timeout(30000);

    const callPosition = positionForRegex(
      document,
      /return test_function\("test"\)/,
      'return '.length
    );
    const rawLocations = await vscode.commands.executeCommand<any>(
      'vscode.executeDefinitionProvider',
      testDocumentUri,
      callPosition
    );
    const locations = normalizeLocations(rawLocations);

    assert.ok(locations.length > 0, 'Definition should return at least one location');
    assert.strictEqual(
      locations[0].uri.toString(),
      testDocumentUri.toString(),
      'Definition should resolve in fixture file'
    );
    const definitionLine = document.lineAt(locations[0].range.start.line).text;
    assert.ok(
      definitionLine.includes('int test_function'),
      `Definition line mismatch: ${definitionLine}`
    );
  });

  test('46.4 Find references workflow shows all symbol usages', async function () {
    this.timeout(30000);

    const varPosition = positionForRegex(document, /int a = test_variable/, 'int a = '.length);
    const references = await vscode.commands.executeCommand<any[]>(
      'vscode.executeReferenceProvider',
      testDocumentUri,
      varPosition
    );

    assert.ok(Array.isArray(references), 'References should be an array');
    assert.ok(
      references.length >= 3,
      `Expected multiple references to test_variable. Got: ${references.length}`
    );
  });

  test('46.5 Rename symbol workflow updates all occurrences', async function () {
    this.timeout(30000);

    const funcPosition = positionForRegex(document, /^int test_function\s*\(/m, 'int '.length);
    const edit = await vscode.commands.executeCommand<any>(
      'vscode.executeDocumentRenameProvider',
      testDocumentUri,
      funcPosition,
      'workflow_renamed_function'
    );

    assert.ok(edit, 'Rename should return a workspace edit');
    const entries = edit.entries();
    assert.ok(entries.length > 0, 'Rename workspace edit should contain file edits');
    const thisFileEdit = entries.find(
      ([uri]: any[]) => uri.toString() === testDocumentUri.toString()
    );
    assert.ok(thisFileEdit, 'Rename should include edits in the fixture file');
    const newTexts = thisFileEdit[1].map((e: any) => e.newText);
    assert.ok(
      newTexts.includes('workflow_renamed_function'),
      'Rename should include replacement text'
    );
  });

  test('46.6 Workspace search workflow finds symbols across files', async function () {
    this.timeout(30000);

    const symbols = await vscode.commands.executeCommand<any[]>(
      'vscode.executeWorkspaceSymbolProvider',
      'test_function'
    );
    assert.ok(
      Array.isArray(symbols) && symbols.length > 0,
      'Workspace symbol search should return results'
    );
    assert.ok(
      symbols.some(s => s.name === 'test_function'),
      'Workspace symbols should include test_function'
    );
  });

  test('46.7 Call hierarchy workflow shows callers/callees', async function () {
    this.timeout(30000);

    const funcPosition = positionForRegex(document, /^void caller_function\s*\(/m, 'void '.length);
    const items = await vscode.commands.executeCommand<any[]>(
      'vscode.prepareCallHierarchy',
      testDocumentUri,
      funcPosition
    );
    assert.ok(Array.isArray(items), 'Call hierarchy prepare should return an array');

    if (items.length > 0) {
      const outgoingCalls = await vscode.commands.executeCommand<any[]>(
        'vscode.provideOutgoingCalls',
        items[0]
      );
      assert.ok(Array.isArray(outgoingCalls), 'Outgoing calls should return an array');
      if (outgoingCalls.length > 0) {
        const targetNames = outgoingCalls.map(c => c.to?.name).filter(Boolean);
        assert.ok(
          targetNames.includes('test_function') || targetNames.includes('multi_param'),
          `Expected outgoing calls to known callees. Got: ${targetNames.join(', ')}`
        );
      }
    }
  });

  test('46.8 Type hierarchy workflow shows inheritance', async function () {
    this.timeout(30000);

    const classPosition = positionForRegex(document, /^class TestClass\s*{/m, 'class '.length);
    const items = await vscode.commands.executeCommand<any[]>(
      'vscode.prepareTypeHierarchy',
      testDocumentUri,
      classPosition
    );
    assert.ok(
      Array.isArray(items) && items.length > 0,
      'Type hierarchy should return item for TestClass'
    );

    const subtypes = await vscode.commands.executeCommand<any[]>(
      'vscode.provideSubtypes',
      items[0]
    );
    assert.ok(Array.isArray(subtypes), 'Type hierarchy subtypes should return an array');
    if (subtypes.length > 0) {
      assert.ok(
        subtypes.some(s => s.name === 'ChildClass'),
        'Subtypes should include ChildClass when available'
      );
    }
  });

  test('46.9 Document formatting workflow applies formatting', async function () {
    this.timeout(30000);

    const start = positionForRegex(document, /^void poorly_formatted\(\)/m);
    const range = new vscode.Range(
      new vscode.Position(start.line, 0),
      new vscode.Position(start.line + 8, 0)
    );
    const formattingEdits = await vscode.commands.executeCommand<any[]>(
      'vscode.executeFormatRangeProvider',
      testDocumentUri,
      range
    );

    assert.ok(Array.isArray(formattingEdits), 'Range formatting should return edits array');
    assert.ok(formattingEdits.length > 0, 'Poorly formatted block should produce formatting edits');
  });

  test('46.10 Configure Pike path in settings', async function () {
    this.timeout(30000);

    const config = vscode.workspace.getConfiguration('pike');
    const currentPath = config.get<string>('pikePath');
    assert.ok(typeof currentPath === 'string', 'pike.pikePath should be readable as a string');
  });

  test('46.11 Add module path configuration', async function () {
    this.timeout(30000);

    const config = vscode.workspace.getConfiguration('pike');
    const modulePaths = config.get<string[]>('pikeModulePath');
    assert.ok(Array.isArray(modulePaths), 'pike.pikeModulePath should be readable as an array');
  });

  test('46.12 Show diagnostics for Pike errors', async function () {
    this.timeout(30000);

    const errorUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-error.pike');
    const errorContent = `int main(\n  return 0;\n}\n`;
    await vscode.workspace.fs.writeFile(errorUri, new TextEncoder().encode(errorContent));

    try {
      const errorDoc = await vscode.workspace.openTextDocument(errorUri);
      await vscode.window.showTextDocument(errorDoc);

      const diagnostics = await waitFor(
        'syntax diagnostics',
        () => vscode.languages.getDiagnostics(errorUri),
        (value: any[]) =>
          Array.isArray(value) && value.some(d => d.severity === vscode.DiagnosticSeverity.Error)
      );

      assert.ok(diagnostics.length > 0, 'Syntax error file should produce diagnostics');
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.workspace.fs.delete(errorUri);
    }
  });

  test('46.13 Moving mapping entries keeps indentation formatted immediately', async function () {
    this.timeout(30000);

    const moveUri = vscode.Uri.joinPath(workspaceFolder.uri, 'move-format-mapping.pike');
    const moveContent = `int main() {
mapping cfg = ([
    "outer": ([
    ]),
    "moved": 1,
]);
return 0;
}
`;
    await vscode.workspace.fs.writeFile(moveUri, new TextEncoder().encode(moveContent));

    try {
      const moveDoc = await vscode.workspace.openTextDocument(moveUri);
      const editor = await vscode.window.showTextDocument(moveDoc);
      const initialVersion = moveDoc.version;
      const targetLine = moveDoc
        .getText()
        .split('\n')
        .findIndex(line => line.includes('"moved": 1,'));

      assert.ok(targetLine >= 0, 'Fixture should contain moved mapping entry');

      const linePos = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(linePos, linePos);
      await vscode.commands.executeCommand('editor.action.moveLinesUpAction');

      await waitFor(
        'line move edit applied',
        () => moveDoc.version,
        version => version > initialVersion
      );

      const movedLineText = moveDoc
        .getText()
        .split('\n')
        .find(line => line.includes('"moved": 1,'));

      assert.ok(movedLineText, 'Moved line should still exist after move operation');
      assert.ok(
        /^\s{8}"moved": 1,$/.test(movedLineText),
        `Moved line should be auto-indented for nested mapping immediately. Got: ${movedLineText}`
      );
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.workspace.fs.delete(moveUri);
    }
  });

  test('46.14 Moving mapping entries keeps tab indentation when tabs are enabled', async function () {
    this.timeout(30000);

    const moveUri = vscode.Uri.joinPath(workspaceFolder.uri, 'move-format-mapping-tabs.pike');
    const moveContent = `int main() {
mapping cfg = ([
	"outer": ([
	]),
	"moved": 1,
]);
return 0;
}
`;

    const editorConfig = vscode.workspace.getConfiguration('editor', moveUri);
    const previousInsertSpaces = editorConfig.get('insertSpaces');
    const previousTabSize = editorConfig.get('tabSize');

    await editorConfig.update('insertSpaces', false, vscode.ConfigurationTarget.Workspace);
    await editorConfig.update('tabSize', 4, vscode.ConfigurationTarget.Workspace);
    await vscode.workspace.fs.writeFile(moveUri, new TextEncoder().encode(moveContent));

    try {
      const moveDoc = await vscode.workspace.openTextDocument(moveUri);
      const editor = await vscode.window.showTextDocument(moveDoc);
      const initialVersion = moveDoc.version;
      const targetLine = moveDoc
        .getText()
        .split('\n')
        .findIndex(line => line.includes('"moved": 1,'));

      assert.ok(targetLine >= 0, 'Fixture should contain moved mapping entry');

      const linePos = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(linePos, linePos);
      await vscode.commands.executeCommand('editor.action.moveLinesUpAction');

      await waitFor(
        'tab-indented line move edit applied',
        () => moveDoc.version,
        version => version > initialVersion
      );

      const movedLineText = moveDoc
        .getText()
        .split('\n')
        .find(line => line.includes('"moved": 1,'));

      assert.ok(movedLineText, 'Moved line should still exist after move operation');
      assert.ok(
        /^\t\t"moved": 1,$/.test(movedLineText),
        `Moved line should be tab-indented for nested mapping immediately. Got: ${movedLineText}`
      );
    } finally {
      await editorConfig.update(
        'insertSpaces',
        previousInsertSpaces,
        vscode.ConfigurationTarget.Workspace
      );
      await editorConfig.update('tabSize', previousTabSize, vscode.ConfigurationTarget.Workspace);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.workspace.fs.delete(moveUri);
    }
  });

  test('46.15 Moving code auto-indents across mappings, arrays, conditionals, loops, and switch blocks', async function () {
    this.timeout(60000);

    async function assertMovedLineIndent(
      fileName: string,
      fileContent: string,
      targetText: string,
      expectedIndentPattern: RegExp,
      movesUp: number = 1
    ): Promise<void> {
      const uri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(fileContent));

      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const initialVersion = doc.version;
        const targetLine = doc
          .getText()
          .split('\n')
          .findIndex(line => line.includes(targetText));

        assert.ok(targetLine >= 0, `Fixture should contain target line: ${targetText}`);

        const linePos = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(linePos, linePos);
        for (let i = 0; i < movesUp; i++) {
          await vscode.commands.executeCommand('editor.action.moveLinesUpAction');
        }

        await waitFor(
          `move applied for ${fileName}`,
          () => doc.version,
          version => version > initialVersion
        );

        const movedLineText = doc
          .getText()
          .split('\n')
          .find(line => line.includes(targetText));

        assert.ok(movedLineText, `Moved line should still exist for ${fileName}`);
        assert.ok(
          expectedIndentPattern.test(movedLineText),
          `Moved line indentation mismatch for ${fileName}. Got: ${movedLineText}`
        );
      } finally {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.workspace.fs.delete(uri);
      }
    }

    await assertMovedLineIndent(
      'move-format-structures-mapping.pike',
      `int main() {
mapping cfg = ([
    "outer": ([
    ]),
    "moved_map": 1,
]);
return 0;
}
`,
      '"moved_map": 1,',
      /^\s{8}"moved_map": 1,$/
    );

    await assertMovedLineIndent(
      'move-format-structures-array.pike',
      `int main() {
array(mixed) arr = ({
    ({
    }),
    "moved_array",
});
return 0;
}
`,
      '"moved_array",',
      /^\s{8}"moved_array",$/
    );

    await assertMovedLineIndent(
      'move-format-structures-if.pike',
      `int main() {
if (1) {
    if (1) {
    }
    int moved_if = 1;
}
return 0;
}
`,
      'int moved_if = 1;',
      /^\s{8}int moved_if = 1;$/
    );

    await assertMovedLineIndent(
      'move-format-structures-loop.pike',
      `int main() {
for (int i = 0; i < 1; i++) {
    if (i) {
    }
    int moved_loop = i;
}
return 0;
}
`,
      'int moved_loop = i;',
      /^\s{8}int moved_loop = i;$/
    );

    await assertMovedLineIndent(
      'move-format-structures-switch.pike',
      `int main(int kind) {
switch (kind) {
case 1:
    if (kind) {
    }
    int moved_switch = kind;
    break;
default:
    break;
}
return 0;
}
`,
      'int moved_switch = kind;',
      /^\s{8}int moved_switch = kind;$/
    );
  });

  test('46.16 Real-source style fixtures (small/medium/big) keep moved-line indentation', async function () {
    this.timeout(90000);

    async function assertMovedLineIndent(
      fileName: string,
      fileContent: string,
      targetText: string,
      expectedIndentPattern: RegExp,
      movesUp: number = 1
    ): Promise<void> {
      const uri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(fileContent));

      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const initialVersion = doc.version;
        const targetLine = doc
          .getText()
          .split('\n')
          .findIndex(line => line.includes(targetText));

        assert.ok(targetLine >= 0, `Fixture should contain target line: ${targetText}`);

        const linePos = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(linePos, linePos);
        for (let i = 0; i < movesUp; i++) {
          await vscode.commands.executeCommand('editor.action.moveLinesUpAction');
        }

        await waitFor(
          `move applied for ${fileName}`,
          () => doc.version,
          version => version > initialVersion
        );

        const movedLineText = doc
          .getText()
          .split('\n')
          .find(line => line.includes(targetText));

        assert.ok(movedLineText, `Moved line should still exist for ${fileName}`);
        assert.ok(
          expectedIndentPattern.test(movedLineText),
          `Moved line indentation mismatch for ${fileName}. Got: ${movedLineText}`
        );
      } finally {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.workspace.fs.delete(uri);
      }
    }

    await assertMovedLineIndent(
      'move-real-small-dumpmaster.pike',
      `string fakeroot(string s)
{
  if(fr) {
  }
  s=fr+combine_path(getcwd(),s);
  return s;
}
`,
      'return s;',
      /^\s{4}return s;$/,
      2
    );

    await assertMovedLineIndent(
      'move-real-medium-changes2xml.pike',
      `void parse_line(string line, string sub)
{
  switch(state) {
  case "INIT":
    if(!text(line))
      continue;
    if(line[0..sizeof(sub)-1] == sub)
    {
    }
    out += make_header(1, tmp);
    continue;
  }
}
`,
      'out += make_header(1, tmp);',
      /^\s{6}out \+= make_header\(1, tmp\);$/
    );

    await assertMovedLineIndent(
      'move-real-big-glut-and-switch.pike',
      `int main()
{
  mapping constants = ([
    "GLUT_RGB": 0,
    "GLUT_RGBA": 0,
    "GLUT_INDEX": 1,
    "GLUT_SINGLE": 0,
    "GLUT_DOUBLE": 2,
    "GLUT_ACCUM": 4,
    "GLUT_ALPHA": 8,
    "GLUT_DEPTH": 16,
    "GLUT_STENCIL": 32,
    "GLUT_MULTISAMPLE": 128,
    "GLUT_STEREO": 256,
    "GLUT_LUMINANCE": 512,
    "GLUT_LEFT_BUTTON": 0,
    "GLUT_MIDDLE_BUTTON": 1,
    "GLUT_RIGHT_BUTTON": 2,
    "GLUT_DOWN": 0,
    "GLUT_UP": 1,
    "GLUT_KEY_F1": 1,
    "GLUT_KEY_F2": 2,
    "GLUT_KEY_F3": 3,
    "GLUT_KEY_F4": 4,
    "GLUT_KEY_F5": 5,
    "GLUT_KEY_F6": 6,
    "GLUT_KEY_F7": 7,
    "GLUT_KEY_F8": 8,
    "GLUT_KEY_F9": 9,
    "GLUT_KEY_F10": 10,
    "GLUT_KEY_F11": 11,
    "GLUT_KEY_F12": 12,
    "GLUT_KEY_LEFT": 100,
    "GLUT_KEY_UP": 101,
    "GLUT_KEY_RIGHT": 102,
    "GLUT_KEY_DOWN": 103,
  ]);

  if (sizeof(constants)) {
    switch (constants["GLUT_RGB"]) {
    case 0:
      if (1) {
      }
      break;
    default:
      break;
    }
  }

  return 0;
}
`,
      'break;',
      /^\s{8}break;$/
    );
  });

  test('46.17 One-line real-style full program stays valid after formatting pass', async function () {
    this.timeout(30000);

    const oneLineUri = vscode.Uri.joinPath(workspaceFolder.uri, 'one-line-real-style-program.pike');
    const oneLineProgram =
      'int main(){mapping constants=(["GLUT_RGB":0,"GLUT_RGBA":0]);array(int) xs=({1,2,3});if(sizeof(xs)){for(int i=0;i<sizeof(xs);i++){switch(xs[i]){case 1:constants["A"]=i;break;default:constants["B"]=i;break;}}}return 0;}';
    await vscode.workspace.fs.writeFile(oneLineUri, new TextEncoder().encode(oneLineProgram));

    try {
      const doc = await vscode.workspace.openTextDocument(oneLineUri);
      await vscode.window.showTextDocument(doc);

      const edits = await vscode.commands.executeCommand<any[]>(
        'vscode.executeFormatDocumentProvider',
        oneLineUri,
        { tabSize: 2, insertSpaces: true }
      );

      if (Array.isArray(edits) && edits.length > 0) {
        const beforeVersion = doc.version;
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(oneLineUri, edits);
        const applied = await vscode.workspace.applyEdit(workspaceEdit);
        assert.ok(applied, 'Formatting edits should apply successfully');
        await waitFor(
          'one-line formatting applied',
          () => doc.version,
          version => version > beforeVersion
        );
      }

      const diagnostics = await waitFor(
        'one-line program diagnostics settle',
        () => vscode.languages.getDiagnostics(oneLineUri),
        (value: any[]) => Array.isArray(value)
      );

      const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
      assert.equal(
        errors.length,
        0,
        `One-line real-style program should remain valid. Errors: ${errors.map(e => e.message).join(' | ')}`
      );
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.workspace.fs.delete(oneLineUri);
    }
  });

  test('Complete edit cycle with symbol lookup', async function () {
    this.timeout(30000);

    const callPosition = positionForRegex(
      document,
      /return test_function\("test"\)/,
      'return '.length
    );
    const definitionLocations = normalizeLocations(
      await vscode.commands.executeCommand<any>(
        'vscode.executeDefinitionProvider',
        testDocumentUri,
        callPosition
      )
    );
    assert.ok(definitionLocations.length > 0, 'Go-to-definition should return a target');

    const definitionPosition = definitionLocations[0].range.start;
    const references = await vscode.commands.executeCommand<any[]>(
      'vscode.executeReferenceProvider',
      testDocumentUri,
      definitionPosition
    );
    assert.ok(
      Array.isArray(references) && references.length >= 3,
      'Edit cycle should surface multiple references'
    );
  });

  test('Multi-file navigation workflow', async function () {
    this.timeout(30000);

    const helperUri = vscode.Uri.joinPath(workspaceFolder.uri, 'workflow-helper.pike');
    const helperContent = 'int helper_call() { return test_function("helper"); }\n';
    await vscode.workspace.fs.writeFile(helperUri, new TextEncoder().encode(helperContent));

    try {
      const helperDoc = await vscode.workspace.openTextDocument(helperUri);
      await vscode.window.showTextDocument(helperDoc);

      const callPos = positionForRegex(helperDoc, /test_function\("helper"\)/);
      const locations = normalizeLocations(
        await vscode.commands.executeCommand<any>(
          'vscode.executeDefinitionProvider',
          helperUri,
          callPos
        )
      );

      assert.ok(locations.length > 0, 'Cross-file definition lookup should return a location');

      const workspaceSymbols = await vscode.commands.executeCommand<any[]>(
        'vscode.executeWorkspaceSymbolProvider',
        'helper_call'
      );
      assert.ok(Array.isArray(workspaceSymbols), 'Workspace symbol search should return an array');
      assert.ok(
        workspaceSymbols.some(s => s.location?.uri?.toString() === helperUri.toString()),
        'Workspace symbol search should include symbol from helper file'
      );
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.workspace.fs.delete(helperUri);
    }
  });

  test('Refactor with confidence workflow', async function () {
    this.timeout(30000);

    const funcPosition = positionForRegex(document, /^int test_function\s*\(/m, 'int '.length);
    const references = await vscode.commands.executeCommand<any[]>(
      'vscode.executeReferenceProvider',
      testDocumentUri,
      funcPosition
    );
    assert.ok(
      Array.isArray(references) && references.length >= 3,
      'Should find references before rename'
    );

    const edit = await vscode.commands.executeCommand<any>(
      'vscode.executeDocumentRenameProvider',
      testDocumentUri,
      funcPosition,
      'renamed_for_workflow'
    );

    assert.ok(edit, 'Rename preparation should return workspace edit');
    const entries = edit.entries();
    const totalEdits = entries.reduce((count: number, [, edits]: any[]) => count + edits.length, 0);
    assert.ok(
      totalEdits >= 2,
      `Rename should affect multiple occurrences. Got edits: ${totalEdits}`
    );
  });
});
