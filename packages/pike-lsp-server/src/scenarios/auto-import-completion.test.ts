import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { type CompletionItem, type CompletionList } from 'vscode-languageserver/node.js';
import { registerCompletionHandlers } from '../features/editing/completion.js';

type CompletionHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
  context?: { triggerKind: number; triggerCharacter?: string };
}) => Promise<CompletionList>;

type ResolveHandler = (item: CompletionItem) => Promise<CompletionItem>;

function createConnection() {
  let completionHandler: CompletionHandler | null = null;
  let resolveHandler: ResolveHandler | null = null;

  return {
    onCompletion(handler: CompletionHandler) {
      completionHandler = handler;
    },
    onCompletionResolve(handler: ResolveHandler) {
      resolveHandler = handler;
    },
    async complete(params: Parameters<CompletionHandler>[0]) {
      if (!completionHandler) {
        throw new Error('completion handler not registered');
      }
      return completionHandler(params);
    },
    async resolve(item: CompletionItem) {
      if (!resolveHandler) {
        throw new Error('completion resolve handler not registered');
      }
      return resolveHandler(item);
    },
  };
}

function createSearchResult(
  symbol: string,
  modulePath: string,
  importKind: 'import' | 'inherit',
  score: number
) {
  return {
    symbol,
    modulePath,
    importKind,
    score,
    source: 'workspace-index',
  };
}

function setup(code: string, searchResults: ReturnType<typeof createSearchResult>[] = []) {
  const uri = 'file:///auto-import-completion.pike';
  const document = TextDocument.create(uri, 'pike', 1, code);
  const connection = createConnection();

  const services = {
    bridge: {
      isRunning: () => true,
      engineQuery: async () => ({ result: { result: { status: 'stub' } } }),
      getCompletionContext: async () => ({
        context: 'identifier',
        objectName: '',
        prefix: '',
        operator: '',
      }),
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    documentCache: {
      get(requestUri: string) {
        if (requestUri !== uri) return undefined;
        return {
          version: 1,
          symbols: [],
          diagnostics: [],
          symbolPositions: new Map(),
          symbolNames: new Map(),
          dependencies: { includes: [], imports: [] },
        };
      },
      entries() {
        return [] as Array<
          [string, { symbols: Array<{ name: string; kind: string; modifiers: string[] }> }]
        >;
      },
    },
    stdlibIndex: {
      async getModule() {
        return null;
      },
    },
    includeResolver: null,
    moduleContext: null,
    typeDatabase: {},
    workspaceIndex: {},
    workspaceScanner: {
      isReady: () => true,
      getAllFiles: () => [],
      getUncachedFiles: () => [],
      getFile: () => undefined,
      updateFileData() {},
      invalidateFile() {},
      upsertFile() {},
      removeFile() {},
      getStats: () => ({ fileCount: 0, rootCount: 0, cachedFiles: 0 }),
    },
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 0 },
    includePaths: [],
    pikeIntrospection: {
      async searchImportableSymbols(symbol: string) {
        return searchResults.filter(result =>
          result.symbol.toLowerCase().startsWith(symbol.toLowerCase())
        );
      },
    },
  };

  const documents = {
    get(requestUri: string) {
      return requestUri === uri ? document : undefined;
    },
  };

  registerCompletionHandlers(connection as never, services as never, documents as never);

  return {
    uri,
    async complete(line: number, character: number) {
      return connection.complete({ textDocument: { uri }, position: { line, character } });
    },
    async resolve(item: CompletionItem) {
      return connection.resolve(item);
    },
  };
}

function findItem(items: CompletionItem[], label: string): CompletionItem {
  const found = items.find(item => item.label === label);
  if (!found) {
    throw new Error(`Missing completion item: ${label}`);
  }
  return found;
}

describe('Scenario: Auto-import completions', () => {
  it('adds unresolved symbol auto-import candidate to completion list', async () => {
    const test = setup('int main() { tok\n', [
      createSearchResult('tokenize', 'Parser.Pike', 'import', 100),
    ]);
    const result = await test.complete(0, 16);

    assert.ok(result.items.some((item: CompletionItem) => item.label === 'tokenize'));
  });

  it('marks auto-import completion with detail and origin metadata', async () => {
    const test = setup('int main() { par\n', [
      createSearchResult('parse', 'Parser', 'import', 100),
    ]);
    const result = await test.complete(0, 16);
    const item = findItem(result.items, 'parse');

    assert.ok(item.detail?.includes('Auto-import'));
    assert.ok(item.data);
  });

  it('orders ambiguous auto-import completions deterministically', async () => {
    const test = setup('int main() { par\n', [
      createSearchResult('parse', 'Parser.XML', 'import', 90),
      createSearchResult('parse', 'Parser.Pike', 'import', 90),
      createSearchResult('parse', 'Parser', 'import', 95),
    ]);
    const result = await test.complete(0, 16);

    const parseItems = result.items
      .filter(
        (item: CompletionItem) => item.label === 'parse' && item.detail?.includes('Auto-import')
      )
      .map((item: CompletionItem) => item.detail);

    assert.deepStrictEqual(parseItems, [
      'Auto-import from Parser',
      'Auto-import from Parser.Pike',
      'Auto-import from Parser.XML',
    ]);
  });

  it('includes inherit-based candidates for class-style unresolved symbols', async () => {
    const test = setup('class Child { int run() { Bas\n', [
      createSearchResult('BaseClass', 'BaseClass', 'inherit', 100),
    ]);
    const result = await test.complete(0, 28);

    assert.ok(
      result.items.some(
        (item: CompletionItem) => item.label === 'BaseClass' && item.detail?.includes('inherit')
      )
    );
  });

  it('filters auto-import candidates by typed prefix', async () => {
    const test = setup('int main() { to\n', [
      createSearchResult('tokenize', 'Parser.Pike', 'import', 100),
      createSearchResult('parse', 'Parser', 'import', 100),
    ]);
    const result = await test.complete(0, 15);

    assert.ok(result.items.some((item: CompletionItem) => item.label === 'tokenize'));
    assert.ok(
      !result.items.some(
        (item: CompletionItem) => item.label === 'parse' && item.detail?.includes('Auto-import')
      )
    );
  });

  it('does not surface duplicate auto-import candidate for already imported module', async () => {
    const test = setup('import Parser.Pike;\nint main() { tok\n', [
      createSearchResult('tokenize', 'Parser.Pike', 'import', 100),
    ]);
    const result = await test.complete(1, 16);

    assert.ok(
      !result.items.some(
        (item: CompletionItem) => item.label === 'tokenize' && item.detail?.includes('Auto-import')
      )
    );
  });

  it('resolves auto-import completion with additionalTextEdits', async () => {
    const test = setup('int main() { tok\n', [
      createSearchResult('tokenize', 'Parser.Pike', 'import', 100),
    ]);
    const result = await test.complete(0, 16);
    const item = findItem(result.items, 'tokenize');
    const resolved = await test.resolve(item);

    assert.ok((resolved.additionalTextEdits?.length ?? 0) > 0);
    assert.ok(resolved.additionalTextEdits?.[0]?.newText.includes('import Parser.Pike;'));
  });

  it('resolve uses inherit insertion when candidate import kind is inherit', async () => {
    const test = setup('class Child { int run() { Bas\n', [
      createSearchResult('BaseClass', 'BaseClass', 'inherit', 100),
    ]);
    const result = await test.complete(0, 28);
    const item = findItem(result.items, 'BaseClass');
    const resolved = await test.resolve(item);

    assert.ok(resolved.additionalTextEdits?.[0]?.newText.includes('inherit BaseClass;'));
  });
});
