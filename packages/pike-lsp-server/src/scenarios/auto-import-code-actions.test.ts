import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeActionKind, type CodeAction, type Diagnostic } from 'vscode-languageserver/node.js';
import { registerCodeActionsHandler } from '../features/advanced/code-actions.js';

type CodeActionHandler = (params: {
  textDocument: { uri: string };
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  context: { diagnostics: Diagnostic[]; only?: string[] };
}) => CodeAction[] | Promise<CodeAction[]>;

function createConnection() {
  let handler: CodeActionHandler | null = null;
  return {
    onCodeAction(next: CodeActionHandler) {
      handler = next;
    },
    async getCodeActions(params: Parameters<CodeActionHandler>[0]) {
      if (!handler) {
        throw new Error('Code action handler not registered');
      }
      return handler(params);
    },
  };
}

function createDocuments(doc: TextDocument) {
  return {
    get(uri: string) {
      return uri === doc.uri ? doc : undefined;
    },
  };
}

function unresolvedDiagnostic(
  symbol: string,
  line = 1,
  character = 7,
  candidates: Array<{ modulePath: string; importKind: 'import' | 'inherit'; score: number }> = [
    { modulePath: 'Parser.Pike', importKind: 'import', score: 100 },
  ]
): Diagnostic {
  return {
    range: {
      start: { line, character },
      end: { line, character: character + symbol.length },
    },
    severity: 2,
    source: 'pike-semantic',
    code: 'undefined-symbol.unresolved-import',
    message: `Undefined symbol: '${symbol}'`,
    data: {
      symbol,
      kind: 'unresolved-symbol',
      importCandidates: candidates,
    },
  };
}

function setup(code: string) {
  const uri = 'file:///auto-import-code-actions.pike';
  const document = TextDocument.create(uri, 'pike', 1, code);
  const connection = createConnection();

  const services = {
    documentCache: {
      get(requestUri: string) {
        if (requestUri !== uri) return undefined;
        return {
          version: 1,
          symbols: [],
          diagnostics: [],
          symbolPositions: new Map(),
          symbolNames: new Map(),
        };
      },
    },
    globalSettings: {
      pikePath: 'pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 0,
      organizeImports: { removeUnused: true },
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    pikeIntrospection: {
      async searchImportableSymbols() {
        return [];
      },
    },
  };

  registerCodeActionsHandler(
    connection as never,
    services as never,
    createDocuments(document) as never
  );

  return {
    uri,
    codeActions: async (diagnostics: Diagnostic[], only?: string[]) => {
      const context: { diagnostics: Diagnostic[]; only?: string[] } = { diagnostics };
      if (only) {
        context.only = only;
      }

      return connection.getCodeActions({
        textDocument: { uri },
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 0 },
        },
        context,
      });
    },
  };
}

describe('Scenario: Auto-import code actions for unresolved symbols', () => {
  it('offers Add import quick fix for a single import candidate', async () => {
    const test = setup('int main() { return tokenize("a"); }\n');
    const actions = await test.codeActions([unresolvedDiagnostic('tokenize')]);

    assert.ok(actions.some(action => action.title === 'Add import for tokenize from Parser.Pike'));
  });

  it('offers Add inherit quick fix when candidate requires inherit', async () => {
    const test = setup('class Child { int main() { return base_call(); } }\n');
    const actions = await test.codeActions([
      unresolvedDiagnostic('base_call', 0, 34, [
        { modulePath: 'BaseClass', importKind: 'inherit', score: 90 },
      ]),
    ]);

    assert.ok(actions.some(action => action.title === 'Add inherit for base_call from BaseClass'));
  });

  it('sorts ambiguous import candidates deterministically by score then module path', async () => {
    const test = setup('int main() { return parse(); }\n');
    const actions = await test.codeActions([
      unresolvedDiagnostic('parse', 0, 20, [
        { modulePath: 'Parser.XML', importKind: 'import', score: 80 },
        { modulePath: 'Parser.Pike', importKind: 'import', score: 80 },
        { modulePath: 'Parser', importKind: 'import', score: 95 },
      ]),
    ]);

    const addImportTitles = actions
      .filter(
        action => action.kind === CodeActionKind.QuickFix && action.title.startsWith('Add import')
      )
      .map(action => action.title);

    assert.deepStrictEqual(addImportTitles, [
      'Add import for parse from Parser',
      'Add import for parse from Parser.Pike',
      'Add import for parse from Parser.XML',
    ]);
  });

  it('respects context.only quickfix filter', async () => {
    const test = setup('int main() { return tokenize("a"); }\n');
    const actions = await test.codeActions(
      [unresolvedDiagnostic('tokenize')],
      [CodeActionKind.QuickFix]
    );
    assert.ok(actions.length > 0);
    assert.ok(actions.every(action => action.kind === CodeActionKind.QuickFix));
  });

  it('does not offer import action for unrelated diagnostics', async () => {
    const test = setup('int main() { return 1 }\n');
    const actions = await test.codeActions([
      {
        range: {
          start: { line: 0, character: 20 },
          end: { line: 0, character: 21 },
        },
        severity: 1,
        source: 'pike',
        code: 'syntax-error',
        message: 'expected ;',
      },
    ]);

    assert.ok(!actions.some(action => action.title.startsWith('Add import for')));
  });

  it('does not suggest duplicate import when module already imported', async () => {
    const test = setup('import Parser.Pike;\nint main() { return tokenize("a"); }\n');
    const actions = await test.codeActions([unresolvedDiagnostic('tokenize')]);

    assert.ok(!actions.some(action => action.title.includes('Parser.Pike')));
  });

  it('inserts import after existing import block', async () => {
    const test = setup('import Stdio;\nimport String;\nint main() { return tokenize("a"); }\n');
    const actions = await test.codeActions([unresolvedDiagnostic('tokenize')]);
    const target = actions.find(action => action.title.includes('Parser.Pike'));

    assert.ok(target?.edit?.changes);
    const edits = target?.edit?.changes?.[test.uri] ?? [];
    assert.ok(edits.length > 0);
    assert.strictEqual(edits[0]?.range.start.line, 2);
  });

  it('supports metadata-driven unresolved symbol diagnostics without message parsing', async () => {
    const test = setup('int main() { return parse(); }\n');
    const actions = await test.codeActions([
      {
        range: {
          start: { line: 0, character: 20 },
          end: { line: 0, character: 25 },
        },
        severity: 2,
        source: 'pike-semantic',
        code: 'undefined-symbol.unresolved-import',
        message: 'semantic unresolved symbol',
        data: {
          symbol: 'parse',
          kind: 'unresolved-symbol',
          importCandidates: [{ modulePath: 'Parser', importKind: 'import', score: 100 }],
        },
      },
    ]);

    assert.ok(actions.some(action => action.title === 'Add import for parse from Parser'));
  });
});
