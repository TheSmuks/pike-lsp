import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CodeActionKind,
  type CompletionItem,
  type CompletionList,
} from 'vscode-languageserver/node.js';
import { analyzeSemantics } from '../features/diagnostics/semantic-analyzer.js';
import { WorkspaceIndex, type ImportableSymbolCandidate } from '../workspace-index.js';
import { registerCodeActionsHandler } from '../features/advanced/code-actions.js';
import { registerCompletionHandlers } from '../features/editing/completion.js';

function createDocument(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, 'pike', 1, text);
}

function createWorkspaceIndexWithEntries(
  entries: Array<{ name: string; kind: string; uri: string }>
) {
  const index = new WorkspaceIndex();
  const state = index as unknown as {
    symbolLookup: Map<
      string,
      Map<string, { name: string; kind: string; uri: string; line: number; maxLine?: number }>
    >;
  };

  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    let perUri = state.symbolLookup.get(key);
    if (!perUri) {
      perUri = new Map();
      state.symbolLookup.set(key, perUri);
    }
    perUri.set(entry.uri, {
      name: entry.name,
      kind: entry.kind,
      uri: entry.uri,
      line: 1,
    });
  }

  return index;
}

function createCodeActionHarness(options: {
  text: string;
  candidates: ImportableSymbolCandidate[];
  uri?: string;
}) {
  const uri = options.uri ?? 'file:///workspace/main.pike';
  const document = createDocument(uri, options.text);
  const cached = { symbols: [] };

  let handler:
    | ((params: {
        textDocument: { uri: string };
        range: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        context: {
          diagnostics: Array<{
            message: string;
            range: {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
            data?: unknown;
          }>;
          only?: string[];
        };
      }) => unknown)
    | null = null;

  const connection = {
    onCodeAction(h: typeof handler) {
      handler = h;
    },
  };

  const services = {
    documentCache: {
      get(requestUri: string) {
        return requestUri === uri ? cached : undefined;
      },
    },
    workspaceIndex: {
      searchImportableSymbols(_query: string, _currentUri: string) {
        return options.candidates;
      },
    },
    globalSettings: {
      organizeImports: { removeUnused: true },
    },
  };

  const documents = {
    get(requestUri: string) {
      return requestUri === uri ? document : undefined;
    },
  };

  registerCodeActionsHandler(connection as never, services as never, documents as never);

  return {
    run(diagnostics: Array<{ message: string; data?: unknown }>, only?: string[]) {
      if (!handler) {
        throw new Error('CodeAction handler not registered');
      }
      return handler({
        textDocument: { uri },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        context: {
          diagnostics: diagnostics.map(d => ({
            message: d.message,
            data: d.data,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
          })),
          ...(only ? { only } : {}),
        },
      }) as Array<{
        title: string;
        edit?: { changes?: Record<string, Array<{ newText: string }>> };
      }>;
    },
  };
}

function createCompletionHarness(options: {
  text: string;
  localSymbols?: Array<{ name: string; kind: string; modifiers?: string[] }>;
  candidates: ImportableSymbolCandidate[];
  uri?: string;
}) {
  const uri = options.uri ?? 'file:///workspace/main.pike';
  const document = createDocument(uri, options.text);
  const cacheMap = new Map<
    string,
    {
      symbols: Array<{ name: string; kind: string; modifiers: string[] }>;
      dependencies: { includes: []; imports: [] };
    }
  >();
  cacheMap.set(uri, {
    symbols: (options.localSymbols ?? []).map(symbol => ({
      name: symbol.name,
      kind: symbol.kind,
      modifiers: symbol.modifiers ?? [],
    })),
    dependencies: { includes: [], imports: [] },
  });

  let completionHandler:
    | ((
        params: {
          textDocument: { uri: string };
          position: { line: number; character: number };
        },
        cancellationToken: {
          isCancellationRequested: boolean;
          onCancellationRequested(handler: () => void): { dispose(): void };
        }
      ) => Promise<CompletionList>)
    | null = null;

  let resolveHandler: ((item: CompletionItem) => Promise<CompletionItem>) | null = null;

  const connection = {
    onCompletion(handler: typeof completionHandler) {
      completionHandler = handler;
    },
    onCompletionResolve(handler: typeof resolveHandler) {
      resolveHandler = handler;
    },
  };

  const services = {
    bridge: null,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    documentCache: {
      get(requestUri: string) {
        return cacheMap.get(requestUri);
      },
      entries() {
        return cacheMap.entries();
      },
    },
    moduleContext: null,
    typeDatabase: {},
    workspaceIndex: {
      searchImportableSymbols(_query: string, _currentUri: string) {
        return options.candidates;
      },
    },
    stdlibIndex: null,
    includeResolver: null,
    workspaceScanner: {
      isReady: () => true,
      getAllFiles: () => [],
      getUncachedFiles: () => [],
      getFile: () => undefined,
      updateFileData: () => {},
      invalidateFile: () => {},
      upsertFile: () => {},
      removeFile: () => {},
      getStats: () => ({ fileCount: 0, rootCount: 0, cachedFiles: 0 }),
    },
    globalSettings: {
      pikePath: 'pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 100,
    },
    includePaths: [],
    documentSnapshots: new Map<string, string>(),
  };

  const documents = {
    get(requestUri: string) {
      return requestUri === uri ? document : undefined;
    },
  };

  registerCompletionHandlers(connection as never, services as never, documents as never);

  return {
    async complete(position: { line: number; character: number }) {
      if (!completionHandler) {
        throw new Error('Completion handler not registered');
      }
      return completionHandler(
        {
          textDocument: { uri },
          position,
        },
        {
          isCancellationRequested: false,
          onCancellationRequested() {
            return { dispose() {} };
          },
        }
      );
    },
    async resolve(item: CompletionItem) {
      if (!resolveHandler) {
        throw new Error('Resolve handler not registered');
      }
      return resolveHandler(item);
    },
  };
}

describe('Auto-import unresolved symbol diagnostics', () => {
  it('tags undefined symbol diagnostics with structured metadata', () => {
    const doc = createDocument('file:///main.pike', 'int main(){ return MissingSymbol; }');
    const result = analyzeSemantics(
      doc,
      [{ name: 'main', kind: 'method', modifiers: [] }],
      undefined,
      [{ text: 'MissingSymbol', line: 1, character: 20, file: 0 }],
      {
        maxProblems: 20,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    assert.strictEqual(result.diagnostics.length, 1);
    assert.strictEqual(result.diagnostics[0]!.code, 'undefined-symbol');
    assert.deepStrictEqual(result.diagnostics[0]!.data, {
      kind: 'unresolved-symbol',
      symbolName: 'MissingSymbol',
    });
  });

  it('keeps undefined symbol message format stable', () => {
    const doc = createDocument('file:///main.pike', 'int main(){ return MissingSymbol; }');
    const result = analyzeSemantics(
      doc,
      [{ name: 'main', kind: 'method', modifiers: [] }],
      undefined,
      [{ text: 'MissingSymbol', line: 1, character: 20, file: 0 }],
      {
        maxProblems: 20,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    assert.ok(result.diagnostics[0]!.message.includes("Undefined symbol: 'MissingSymbol'"));
  });

  it('does not add unresolved metadata for type mismatch diagnostics', () => {
    const doc = createDocument('file:///main.pike', 'x = "bad";');
    const result = analyzeSemantics(
      doc,
      [],
      {
        success: 1,
        symbols: [{ name: 'x', kind: 'variable', type: { kind: 'int' }, modifiers: [] }],
        functions: [],
        variables: [{ name: 'x', kind: 'variable', type: { kind: 'int' }, modifiers: [] }],
        classes: [],
        inherits: [],
        diagnostics: [],
      },
      [],
      {
        maxProblems: 20,
        enableUndefinedDetection: false,
        enableTypeMismatch: true,
        enableMissingCallbacks: false,
      }
    );

    assert.strictEqual(result.diagnostics[0]!.code, 'type-mismatch');
    assert.strictEqual(result.diagnostics[0]!.data, undefined);
  });
});

describe('WorkspaceIndex auto-import candidate search', () => {
  it('returns inherit candidate for class symbols', () => {
    const index = createWorkspaceIndexWithEntries([
      { name: 'Widget', kind: 'class', uri: 'file:///workspace/lib/widget.pike' },
    ]);

    const result = index.searchImportableSymbols('Widget', 'file:///workspace/main.pike');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.importKind, 'inherit');
    assert.ok(result[0]!.statement.startsWith('inherit '));
  });

  it('returns import candidate for non-class symbols', () => {
    const index = createWorkspaceIndexWithEntries([
      { name: 'helper_fn', kind: 'method', uri: 'file:///workspace/lib/helpers.pike' },
    ]);

    const result = index.searchImportableSymbols('helper_fn', 'file:///workspace/main.pike');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.importKind, 'import');
    assert.strictEqual(result[0]!.statement, 'import helper_fn;');
  });

  it('excludes symbols from the current document uri', () => {
    const mainUri = 'file:///workspace/main.pike';
    const index = createWorkspaceIndexWithEntries([
      { name: 'Widget', kind: 'class', uri: mainUri },
      { name: 'Widget', kind: 'class', uri: 'file:///workspace/lib/widget.pike' },
    ]);

    const result = index.searchImportableSymbols('Widget', mainUri);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.uri, 'file:///workspace/lib/widget.pike');
  });

  it('orders ambiguous symbols deterministically by source path', () => {
    const index = createWorkspaceIndexWithEntries([
      { name: 'Thing', kind: 'class', uri: 'file:///workspace/zeta/thing.pike' },
      { name: 'Thing', kind: 'class', uri: 'file:///workspace/alpha/thing.pike' },
    ]);

    const result = index.searchImportableSymbols('Thing', 'file:///workspace/main.pike');
    assert.strictEqual(result.length, 2);
    assert.ok(result[0]!.sourcePath < result[1]!.sourcePath);
  });

  it('supports prefix and substring matching for query', () => {
    const index = createWorkspaceIndexWithEntries([
      { name: 'RenderWidget', kind: 'method', uri: 'file:///workspace/a.pike' },
      { name: 'WidgetFactory', kind: 'class', uri: 'file:///workspace/b.pike' },
    ]);

    const result = index.searchImportableSymbols('Widget', 'file:///workspace/main.pike');
    assert.strictEqual(result.length, 2);
  });
});

describe('Auto-import code actions for unresolved symbols', () => {
  it('offers Add import quick fix from unresolved diagnostic data', () => {
    const harness = createCodeActionHarness({
      text: 'int main() { return helper_fn(); }\n',
      candidates: [
        {
          name: 'helper_fn',
          symbolKind: 'method',
          uri: 'file:///workspace/lib/helpers.pike',
          importKind: 'import',
          statement: 'import helper_fn;',
          sourcePath: './lib/helpers.pike',
        },
      ],
    });

    const actions = harness.run([
      {
        message: "Undefined symbol: 'helper_fn'",
        data: { kind: 'unresolved-symbol', symbolName: 'helper_fn' },
      },
    ]);

    assert.ok(actions.some(action => action.title.includes('Add import for helper_fn')));
  });

  it('offers Add inherit quick fix for class candidates', () => {
    const harness = createCodeActionHarness({
      text: 'int main() { Widget w; return 0; }\n',
      candidates: [
        {
          name: 'Widget',
          symbolKind: 'class',
          uri: 'file:///workspace/lib/widget.pike',
          importKind: 'inherit',
          statement: 'inherit "./lib/widget.pike";',
          sourcePath: './lib/widget.pike',
        },
      ],
    });

    const actions = harness.run([{ message: "Undefined symbol: 'Widget'" }]);
    assert.ok(actions.some(action => action.title.includes('Add inherit for Widget')));
  });

  it('creates one quick fix per ambiguous import candidate in deterministic order', () => {
    const harness = createCodeActionHarness({
      text: 'int main() { Widget w; return 0; }\n',
      candidates: [
        {
          name: 'Widget',
          symbolKind: 'class',
          uri: 'file:///workspace/beta/widget.pike',
          importKind: 'inherit',
          statement: 'inherit "./beta/widget.pike";',
          sourcePath: './beta/widget.pike',
        },
        {
          name: 'Widget',
          symbolKind: 'class',
          uri: 'file:///workspace/alpha/widget.pike',
          importKind: 'inherit',
          statement: 'inherit "./alpha/widget.pike";',
          sourcePath: './alpha/widget.pike',
        },
      ],
    });

    const actions = harness.run([{ message: "Undefined symbol: 'Widget'" }]);
    const widgetActions = actions.filter(action => action.title.includes('Widget'));
    assert.strictEqual(widgetActions.length, 2);
    assert.ok(widgetActions[0]!.title < widgetActions[1]!.title);
  });

  it('respects quickfix kind filtering', () => {
    const harness = createCodeActionHarness({
      text: 'int main() { return helper_fn(); }\n',
      candidates: [
        {
          name: 'helper_fn',
          symbolKind: 'method',
          uri: 'file:///workspace/lib/helpers.pike',
          importKind: 'import',
          statement: 'import helper_fn;',
          sourcePath: './lib/helpers.pike',
        },
      ],
    });

    const actions = harness.run(
      [{ message: "Undefined symbol: 'helper_fn'" }],
      [CodeActionKind.Refactor]
    );
    assert.strictEqual(actions.length, 0);
  });

  it('does not emit add-import fix when statement already exists', () => {
    const harness = createCodeActionHarness({
      text: 'import helper_fn;\nint main() { return helper_fn(); }\n',
      candidates: [
        {
          name: 'helper_fn',
          symbolKind: 'method',
          uri: 'file:///workspace/lib/helpers.pike',
          importKind: 'import',
          statement: 'import helper_fn;',
          sourcePath: './lib/helpers.pike',
        },
      ],
    });

    const actions = harness.run([{ message: "Undefined symbol: 'helper_fn'" }]);
    assert.ok(!actions.some(action => action.title.includes('Add import for helper_fn')));
  });
});

describe('Auto-import completion candidates', () => {
  it('includes auto-import candidates with additionalTextEdits', async () => {
    const harness = createCompletionHarness({
      text: 'hel',
      candidates: [
        {
          name: 'helper_fn',
          symbolKind: 'method',
          uri: 'file:///workspace/lib/helpers.pike',
          importKind: 'import',
          statement: 'import helper_fn;',
          sourcePath: './lib/helpers.pike',
        },
      ],
    });

    const result = await harness.complete({ line: 0, character: 3 });
    const item = result.items.find(entry => entry.label === 'helper_fn');
    assert.ok(item);
    assert.ok(item!.additionalTextEdits && item!.additionalTextEdits.length > 0);
    assert.ok(item!.additionalTextEdits![0]!.newText.includes('import helper_fn;'));
  });

  it('adds import edit after existing include/import block', async () => {
    const harness = createCompletionHarness({
      text: '#include <x.h>\nimport Existing;\nhel',
      candidates: [
        {
          name: 'helper_fn',
          symbolKind: 'method',
          uri: 'file:///workspace/lib/helpers.pike',
          importKind: 'import',
          statement: 'import helper_fn;',
          sourcePath: './lib/helpers.pike',
        },
      ],
    });

    const result = await harness.complete({ line: 2, character: 3 });
    const item = result.items.find(entry => entry.label === 'helper_fn');
    assert.ok(item);
    assert.strictEqual(item!.additionalTextEdits![0]!.range.start.line, 2);
  });

  it('adds inherit edit after existing inherit block', async () => {
    const harness = createCompletionHarness({
      text: 'inherit "./base.pike";\nWid',
      candidates: [
        {
          name: 'Widget',
          symbolKind: 'class',
          uri: 'file:///workspace/lib/widget.pike',
          importKind: 'inherit',
          statement: 'inherit "./lib/widget.pike";',
          sourcePath: './lib/widget.pike',
        },
      ],
    });

    const result = await harness.complete({ line: 1, character: 3 });
    const item = result.items.find(entry => entry.label === 'Widget');
    assert.ok(item);
    assert.ok(item!.additionalTextEdits![0]!.newText.startsWith('inherit '));
  });

  it('keeps ambiguous completion candidates in deterministic order', async () => {
    const harness = createCompletionHarness({
      text: 'Wid',
      candidates: [
        {
          name: 'Widget',
          symbolKind: 'class',
          uri: 'file:///workspace/beta/widget.pike',
          importKind: 'inherit',
          statement: 'inherit "./beta/widget.pike";',
          sourcePath: './beta/widget.pike',
        },
        {
          name: 'Widget',
          symbolKind: 'class',
          uri: 'file:///workspace/alpha/widget.pike',
          importKind: 'inherit',
          statement: 'inherit "./alpha/widget.pike";',
          sourcePath: './alpha/widget.pike',
        },
      ],
    });

    const result = await harness.complete({ line: 0, character: 3 });
    const widgetItems = result.items.filter(entry => entry.label === 'Widget');
    assert.strictEqual(widgetItems.length, 2);
    assert.ok((widgetItems[0]!.detail ?? '') < (widgetItems[1]!.detail ?? ''));
  });

  it('does not override local symbol completion with auto-import candidate', async () => {
    const harness = createCompletionHarness({
      text: 'hel',
      localSymbols: [{ name: 'helper_fn', kind: 'method' }],
      candidates: [
        {
          name: 'helper_fn',
          symbolKind: 'method',
          uri: 'file:///workspace/lib/helpers.pike',
          importKind: 'import',
          statement: 'import helper_fn;',
          sourcePath: './lib/helpers.pike',
        },
      ],
    });

    const result = await harness.complete({ line: 0, character: 3 });
    const helperItems = result.items.filter(entry => entry.label === 'helper_fn');
    assert.strictEqual(helperItems.length, 1);
    assert.ok(!helperItems[0]!.additionalTextEdits);
  });
});
