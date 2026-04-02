import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node.js';
import type { PikeSymbol, IntrospectedSymbol } from '@pike-lsp/pike-bridge';
import type { DocumentCacheEntry } from '../../core/types.js';
import { registerCompletionHandlers } from '../../features/editing/completion.js';

/**
 * Ranking Parity Tests for Query Engine Completion
 *
 * Verifies that completion ranking is deterministic and consistent
 * between query-engine and fallback paths.
 */

interface MockConnection {
  onCompletion: (handler: CompletionHandler) => void;
  onCompletionResolve: () => void;
  completionHandler: CompletionHandler;
}

type CompletionHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<{ items: CompletionItem[] }>;

function createMockConnection(): MockConnection {
  let handler: CompletionHandler | null = null;
  return {
    onCompletion(h: CompletionHandler) {
      handler = h;
    },
    onCompletionResolve() {},
    get completionHandler(): CompletionHandler {
      if (!handler) throw new Error('No completion handler registered');
      return handler;
    },
  };
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
};

function makeCacheEntry(
  overrides: Partial<DocumentCacheEntry> & { symbols: PikeSymbol[] }
): DocumentCacheEntry {
  return {
    version: 1,
    diagnostics: [],
    symbolPositions: new Map(),
    ...overrides,
  } as DocumentCacheEntry;
}

function createMockBridge(queryItems: CompletionItem[], isRunning = true) {
  return {
    isRunning: () => isRunning,
    engineQuery: async () => ({
      result: { items: queryItems },
    }),
    engineCancelRequest: async () => ({ accepted: true }),
    getCompletionContext: async () => ({
      context: 'identifier' as const,
      objectName: '',
      prefix: '',
      operator: '',
    }),
  };
}

describe('Completion Ranking Parity', () => {
  it('produces deterministic ordering for repeated identical requests', async () => {
    const connection = createMockConnection();
    const uri = 'file:///test/ranking-parity.pike';
    const document = TextDocument.create(uri, 'pike', 1, 'int x = 1;');
    const documents = new Map([[uri, document]]);

    const queryItems: CompletionItem[] = [
      { label: 'alpha', kind: CompletionItemKind.Variable },
      { label: 'beta', kind: CompletionItemKind.Function },
      { label: 'gamma', kind: CompletionItemKind.Class },
    ];

    const services = {
      logger: silentLogger,
      bridge: createMockBridge(queryItems),
      documentCache: {
        get: () =>
          makeCacheEntry({
            symbols: [{ name: 'x', kind: 'variable', modifiers: [] }],
          }),
        entries: () => [],
      },
      documentSnapshots: {
        get: () => undefined,
      },
    };

    registerCompletionHandlers(
      connection as any,
      services as any,
      {
        get: (u: string) => documents.get(u),
        onDidChangeContent: () => {},
        onDidOpen: () => {},
        onDidClose: () => {},
        onDidSave: () => {},
      } as any
    );

    // Make multiple identical requests
    const results: string[][] = [];
    for (let i = 0; i < 5; i++) {
      const result = await connection.completionHandler({
        textDocument: { uri },
        position: { line: 0, character: 0 },
      });
      results.push(result.items.map(item => item.label));
    }

    // All results should have identical ordering
    const first = results[0];
    for (let i = 1; i < results.length; i++) {
      assert.deepStrictEqual(results[i], first);
    }
  });

  it('ranks query-engine items before fallback items when both available', async () => {
    const connection = createMockConnection();
    const uri = 'file:///test/ranking-order.pike';
    const document = TextDocument.create(uri, 'pike', 1, 'int localVar = 1;');
    const documents = new Map([[uri, document]]);

    const queryItems: CompletionItem[] = [
      { label: 'queryItem1', kind: CompletionItemKind.Variable },
      { label: 'queryItem2', kind: CompletionItemKind.Function },
    ];

    const services = {
      logger: silentLogger,
      bridge: createMockBridge(queryItems),
      documentCache: {
        get: () =>
          makeCacheEntry({
            symbols: [{ name: 'localVar', kind: 'variable', modifiers: [] }],
            dependencies: {
              imports: [
                {
                  modulePath: 'Stdio',
                  isStdlib: true,
                  symbols: [{ name: 'File', kind: 'class', modifiers: ['public'] }],
                },
              ],
              includes: [],
            },
          }),
        entries: () => [],
      },
      documentSnapshots: {
        get: () => undefined,
      },
      stdlibIndex: {
        getModule: async () => ({
          modulePath: 'Stdio',
          symbols: new Map<string, IntrospectedSymbol>([
            [
              'File',
              { name: 'File', kind: 'class', type: { kind: 'program' }, modifiers: ['public'] },
            ],
          ]),
        }),
      },
    };

    registerCompletionHandlers(
      connection as any,
      services as any,
      {
        get: (u: string) => documents.get(u),
        onDidChangeContent: () => {},
        onDidOpen: () => {},
        onDidClose: () => {},
        onDidSave: () => {},
      } as any
    );

    const result = await connection.completionHandler({
      textDocument: { uri },
      position: { line: 0, character: 0 },
    });

    const labels = result.items.map(item => item.label);

    // Query-engine items should appear before fallback items
    const queryItem1Index = labels.indexOf('queryItem1');
    const queryItem2Index = labels.indexOf('queryItem2');
    const fileIndex = labels.indexOf('File');

    assert.ok(queryItem1Index >= 0, 'queryItem1 should be present');
    assert.ok(queryItem2Index >= 0, 'queryItem2 should be present');

    // If File is present, query-engine items should come before it
    if (fileIndex >= 0) {
      assert.ok(
        queryItem1Index < fileIndex,
        'Query-engine items should rank before fallback items'
      );
    }
  });

  it('maintains stable ordering under rapid sequential requests', async () => {
    const connection = createMockConnection();
    const uri = 'file:///test/stable-ranking.pike';
    const document = TextDocument.create(uri, 'pike', 1, 'string test = "";');
    const documents = new Map([[uri, document]]);

    const queryItems: CompletionItem[] = [
      { label: 'strlen', kind: CompletionItemKind.Function },
      { label: 'sizeof', kind: CompletionItemKind.Function },
      { label: 'string', kind: CompletionItemKind.Keyword },
    ];

    const services = {
      logger: silentLogger,
      bridge: createMockBridge(queryItems),
      documentCache: {
        get: () =>
          makeCacheEntry({
            symbols: [{ name: 'test', kind: 'variable', modifiers: [] }],
          }),
        entries: () => [],
      },
      documentSnapshots: {
        get: () => undefined,
      },
    };

    registerCompletionHandlers(
      connection as any,
      services as any,
      {
        get: (u: string) => documents.get(u),
        onDidChangeContent: () => {},
        onDidOpen: () => {},
        onDidClose: () => {},
        onDidSave: () => {},
      } as any
    );

    // Rapid sequential requests
    const results: string[][] = [];
    for (let i = 0; i < 10; i++) {
      const result = await connection.completionHandler({
        textDocument: { uri },
        position: { line: 0, character: 7 },
      });
      results.push(result.items.map(item => item.label));
    }

    // Verify stability - all results should be identical
    const reference = results[0];
    for (let i = 1; i < results.length; i++) {
      assert.deepStrictEqual(results[i], reference, `Request ${i} ordering differs from reference`);
    }
  });
});
