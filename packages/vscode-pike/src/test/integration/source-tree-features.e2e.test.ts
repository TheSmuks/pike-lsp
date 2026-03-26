// @ts-nocheck

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { suite, test } from 'mocha';
import { positionForRegex, waitFor, withTimeout } from './helpers';

let vscode: any;
let vscodeAvailable = true;
try {
// eslint-disable-next-line @typescript-eslint/no-var-requires -- VS Code integration tests use CommonJS require for the vscode runtime module
  vscode = require('vscode');
} catch {
  vscodeAvailable = false;
}

const FEATURE_PROBE = `

// --- pike-lsp e2e probe block ---
int __e2e_feature_symbol(int value) {
  return value;
}

int __e2e_feature_caller() {
  return __e2e_feature_symbol(1);
}

class __E2EFeatureBase {
  int id;
}

class __E2EFeatureChild {
  inherit __E2EFeatureBase;
}

void __e2e_signature_probe() {
  __e2e_feature_symbol(1);
  int __e2e_completion_probe = __e2e_feature_sym;
}
`;

function splitPath(value: string): string[] {
  return value
    .split(path.delimiter)
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

function dedupeExisting(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const normalized = path.resolve(p);
    if (!fs.existsSync(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function inferPikeRoot(input: string): string {
  const normalized = path.resolve(input);
  if (normalized.endsWith(path.join('lib', 'modules'))) {
    return path.resolve(normalized, '..', '..');
  }
  if (fs.existsSync(path.join(normalized, 'lib', 'modules'))) {
    return normalized;
  }
  return normalized;
}

function findFirstSourceFile(root: string): string {
  const stack = [root];
  const skip = new Set(['.git', '.omc', 'build', 'node_modules']);

  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (skip.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && (entry.name.endsWith('.pike') || entry.name.endsWith('.pmod'))) {
        return full;
      }
    }
  }

  throw new Error(`No Pike source files found under ${root}`);
}

suite('Source Tree VSCode E2E Feature Matrix', () => {
  let workspaceFolder: any;
  let pikeDocUri: any;
  let roxenDocUri: any;
  let pikeDoc: any;
  let roxenDoc: any;
  let previousModulePaths: string[] | undefined;
  let previousIncludePaths: string[] | undefined;
  let previousProgramPaths: string[] | undefined;
  let didOverrideConfig = false;

  suiteSetup(async function () {
    if (!vscodeAvailable) {
      this.skip();
      return;
    }

    const PIKE_SRC = process.env.PIKE_SRC;
    const ROXEN_SRC = process.env.ROXEN_SRC;
    if (!PIKE_SRC || !ROXEN_SRC) {
      this.skip();
      return;
    }

    this.timeout(120000);

    workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'Workspace folder should exist');

    const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
    assert.ok(extension, 'Extension should be found');
    if (!extension.isActive) {
      await extension.activate();
    }

    const pikeRoot = inferPikeRoot(PIKE_SRC);
    const modulePaths = dedupeExisting([
      ...splitPath(process.env.PIKE_MODULE_PATH || ''),
      path.join(pikeRoot, 'lib', 'modules'),
      path.join(ROXEN_SRC, 'server', 'etc', 'modules'),
      path.join(ROXEN_SRC, 'server', 'modules'),
      path.join(ROXEN_SRC, 'server', 'more_modules'),
    ]);
    const includePaths = dedupeExisting([
      ...splitPath(process.env.PIKE_INCLUDE_PATH || ''),
      path.join(pikeRoot, 'lib', 'include'),
      path.join(ROXEN_SRC, 'server', 'etc', 'include'),
    ]);
    const programPaths = dedupeExisting([
      ...splitPath(process.env.PIKE_PROGRAM_PATH || ''),
      path.join(pikeRoot, 'lib'),
      path.join(ROXEN_SRC, 'server'),
      path.join(ROXEN_SRC, 'server', 'base_server'),
    ]);

    const config = vscode.workspace.getConfiguration('pike');
    previousModulePaths = config.get('pikeModulePath');
    previousIncludePaths = config.get('pikeIncludePath');
    previousProgramPaths = config.get('pikeProgramPath');
    await config.update('pikeModulePath', modulePaths, vscode.ConfigurationTarget.Workspace);
    await config.update('pikeIncludePath', includePaths, vscode.ConfigurationTarget.Workspace);
    await config.update('pikeProgramPath', programPaths, vscode.ConfigurationTarget.Workspace);
    didOverrideConfig = true;

    await vscode.commands.executeCommand('pike.lsp.restartServer');

    const pikeSource = findFirstSourceFile(path.resolve(PIKE_SRC));
    const roxenSource = findFirstSourceFile(path.join(path.resolve(ROXEN_SRC), 'server'));
    const pikeContent = fs.readFileSync(pikeSource, 'utf-8') + FEATURE_PROBE;
    const roxenContent = fs.readFileSync(roxenSource, 'utf-8') + FEATURE_PROBE;

    pikeDocUri = vscode.Uri.joinPath(workspaceFolder.uri, '__e2e_real_pike_source.pike');
    roxenDocUri = vscode.Uri.joinPath(workspaceFolder.uri, '__e2e_real_roxen_source.pike');
    await vscode.workspace.fs.writeFile(pikeDocUri, new TextEncoder().encode(pikeContent));
    await vscode.workspace.fs.writeFile(roxenDocUri, new TextEncoder().encode(roxenContent));

    pikeDoc = await vscode.workspace.openTextDocument(pikeDocUri);
    roxenDoc = await vscode.workspace.openTextDocument(roxenDocUri);

    await vscode.window.showTextDocument(pikeDoc);
    await waitFor(
      'source tree pike symbols',
      () => vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', pikeDocUri),
      (symbols: any) => Array.isArray(symbols)
    );
    await vscode.window.showTextDocument(roxenDoc);
    await waitFor(
      'source tree roxen symbols',
      () => vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', roxenDocUri),
      (symbols: any) => Array.isArray(symbols)
    );
  });

  suiteTeardown(async () => {
    if (!vscodeAvailable) {
      return;
    }
    try {
      if (pikeDoc) {
        await vscode.window.showTextDocument(pikeDoc);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
      if (roxenDoc) {
        await vscode.window.showTextDocument(roxenDoc);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
    } finally {
      if (pikeDocUri) {
        try {
          await vscode.workspace.fs.delete(pikeDocUri);
        } catch {}
      }
      if (roxenDocUri) {
        try {
          await vscode.workspace.fs.delete(roxenDocUri);
        } catch {}
      }

      if (didOverrideConfig) {
        const config = vscode.workspace.getConfiguration('pike');
        await config.update(
          'pikeModulePath',
          previousModulePaths,
          vscode.ConfigurationTarget.Workspace
        );
        await config.update(
          'pikeIncludePath',
          previousIncludePaths,
          vscode.ConfigurationTarget.Workspace
        );
        await config.update(
          'pikeProgramPath',
          previousProgramPaths,
          vscode.ConfigurationTarget.Workspace
        );
        await vscode.commands.executeCommand('pike.lsp.restartServer');
      }
    }
  });

  async function runFeatureMatrix(doc: any, uri: any): Promise<void> {
    const symbolCallPos = positionForRegex(
      doc,
      /return __e2e_feature_symbol\(1\)/,
      'return '.length
    );
    const symbolDeclPos = positionForRegex(doc, /^int __e2e_feature_symbol\(/m, 'int '.length);
    const classPos = positionForRegex(doc, /^class __E2EFeatureBase/m, 'class '.length);
    const completionPos = positionForRegex(doc, /__e2e_feature_sym;/, '__e2e_feature_sym'.length);

    const symbols = await vscode.commands.executeCommand(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
    assert.ok(Array.isArray(symbols), 'Document symbols should return an array');

    const hover = await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      uri,
      symbolCallPos
    );
    assert.ok(Array.isArray(hover), 'Hover should return an array');

    const definition = await vscode.commands.executeCommand(
      'vscode.executeDefinitionProvider',
      uri,
      symbolCallPos
    );
    const normalizedDefinition = Array.isArray(definition)
      ? definition
      : definition
        ? [definition]
        : [];
    assert.ok(normalizedDefinition.length > 0, 'Definition should resolve probe symbol');

    const declaration = await vscode.commands.executeCommand(
      'vscode.executeDeclarationProvider',
      uri,
      symbolCallPos
    );
    assert.ok(
      declaration === null || declaration === undefined || Array.isArray(declaration),
      'Declaration provider should return null/undefined/array'
    );

    const typeDefinition = await vscode.commands.executeCommand(
      'vscode.executeTypeDefinitionProvider',
      uri,
      symbolCallPos
    );
    assert.ok(
      typeDefinition === null || typeDefinition === undefined || Array.isArray(typeDefinition),
      'Type definition provider should return null/undefined/array'
    );

    const completion = await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      uri,
      completionPos
    );
    assert.ok(completion && Array.isArray(completion.items), 'Completion should return item list');

    const references = await vscode.commands.executeCommand(
      'vscode.executeReferenceProvider',
      uri,
      symbolDeclPos
    );
    assert.ok(Array.isArray(references), 'References should return an array');
    assert.ok(references.length >= 2, 'References should include declaration and caller usage');

    const highlights = await vscode.commands.executeCommand(
      'vscode.executeDocumentHighlights',
      uri,
      symbolCallPos
    );
    assert.ok(Array.isArray(highlights), 'Document highlights should return an array');

    const implementations = await vscode.commands.executeCommand(
      'vscode.executeImplementationProvider',
      uri,
      symbolCallPos
    );
    assert.ok(Array.isArray(implementations), 'Implementation provider should return an array');

    const callItems = await vscode.commands.executeCommand(
      'vscode.prepareCallHierarchy',
      uri,
      symbolDeclPos
    );
    assert.ok(Array.isArray(callItems), 'Call hierarchy prepare should return an array');
    if (callItems.length > 0) {
      const incoming = await vscode.commands.executeCommand(
        'vscode.provideIncomingCalls',
        callItems[0]
      );
      const outgoing = await vscode.commands.executeCommand(
        'vscode.provideOutgoingCalls',
        callItems[0]
      );
      assert.ok(Array.isArray(incoming), 'Incoming call hierarchy should return an array');
      assert.ok(Array.isArray(outgoing), 'Outgoing call hierarchy should return an array');
    }

    const typeItems = await vscode.commands.executeCommand(
      'vscode.prepareTypeHierarchy',
      uri,
      classPos
    );
    assert.ok(Array.isArray(typeItems), 'Type hierarchy prepare should return an array');
    if (typeItems.length > 0) {
      const supertypes = await vscode.commands.executeCommand(
        'vscode.provideSupertypes',
        typeItems[0]
      );
      const subtypes = await vscode.commands.executeCommand('vscode.provideSubtypes', typeItems[0]);
      assert.ok(Array.isArray(supertypes), 'Type hierarchy supertypes should return an array');
      assert.ok(Array.isArray(subtypes), 'Type hierarchy subtypes should return an array');
    }

    const signature = await vscode.commands.executeCommand(
      'vscode.executeSignatureHelpProvider',
      uri,
      positionForRegex(doc, /__e2e_feature_symbol\(1\)/, '__e2e_feature_symbol('.length),
      '('
    );
    assert.ok(
      signature === null || signature.signatures,
      'Signature help should return null or signatures'
    );

    const lineRange = new vscode.Range(
      new vscode.Position(Math.max(0, symbolDeclPos.line - 1), 0),
      new vscode.Position(symbolDeclPos.line + 4, 0)
    );
    const actions = await vscode.commands.executeCommand(
      'vscode.executeCodeActionProvider',
      uri,
      lineRange
    );
    assert.ok(Array.isArray(actions), 'Code actions should return an array');

    const docFormatting = await vscode.commands.executeCommand(
      'vscode.executeFormatDocumentProvider',
      uri
    );
    assert.ok(
      docFormatting === undefined || docFormatting === null || Array.isArray(docFormatting),
      'Document formatting should return null/undefined or an array'
    );

    const rangeFormatting = await vscode.commands.executeCommand(
      'vscode.executeFormatRangeProvider',
      uri,
      lineRange
    );
    assert.ok(
      rangeFormatting === undefined || rangeFormatting === null || Array.isArray(rangeFormatting),
      'Range formatting should return null/undefined or an array'
    );

    const semanticTokens = await vscode.commands.executeCommand(
      'vscode.provideDocumentSemanticTokens',
      uri
    );
    assert.ok(
      semanticTokens === null || semanticTokens === undefined || semanticTokens.data !== undefined,
      'Semantic tokens should return null/undefined or token payload'
    );

    const inlayHints = await vscode.commands.executeCommand(
      'vscode.executeInlayHintProvider',
      uri,
      lineRange
    );
    assert.ok(Array.isArray(inlayHints), 'Inlay hints should return an array');

    const folds = await vscode.commands.executeCommand('vscode.executeFoldingRangeProvider', uri);
    assert.ok(Array.isArray(folds), 'Folding ranges should return an array');

    const links = await vscode.commands.executeCommand('vscode.executeLinkProvider', uri);
    assert.ok(Array.isArray(links), 'Document links should return an array');

    const codeLenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri);
    assert.ok(Array.isArray(codeLenses), 'Code lens should return an array');

    const selectionRanges = await withTimeout(
      vscode.commands.executeCommand('vscode.executeSelectionRangeProvider', uri, [symbolCallPos]),
      5000,
      []
    );
    assert.ok(Array.isArray(selectionRanges), 'Selection range should return an array');

    const availableCommands = await vscode.commands.getCommands(true);
    if (availableCommands.includes('vscode.executeLinkedEditingProvider')) {
      const linkedEditing = await vscode.commands.executeCommand(
        'vscode.executeLinkedEditingProvider',
        uri,
        symbolCallPos
      );
      assert.ok(
        linkedEditing === null || linkedEditing === undefined || linkedEditing.ranges,
        'Linked editing should return null/undefined or ranges'
      );
    }

    const rename = await vscode.commands.executeCommand(
      'vscode.executeDocumentRenameProvider',
      uri,
      symbolDeclPos,
      '__e2e_feature_symbol_renamed'
    );
    assert.ok(
      rename === null || rename === undefined || rename.entries,
      'Rename should return edit/null'
    );

    const workspaceSymbols = await vscode.commands.executeCommand(
      'vscode.executeWorkspaceSymbolProvider',
      '__e2e_feature_symbol'
    );
    assert.ok(Array.isArray(workspaceSymbols), 'Workspace symbols should return an array');
  }

  test('real Pike source file supports full VSCode feature matrix', async function () {
    this.timeout(120000);
    await vscode.window.showTextDocument(pikeDoc);
    await runFeatureMatrix(pikeDoc, pikeDocUri);
  });

  test('real Roxen source file supports full VSCode feature matrix', async function () {
    this.timeout(120000);
    await vscode.window.showTextDocument(roxenDoc);
    await runFeatureMatrix(roxenDoc, roxenDocUri);
  });
});
