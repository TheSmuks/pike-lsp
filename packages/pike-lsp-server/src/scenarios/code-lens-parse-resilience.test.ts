/**
 * Code Lens Parse-Under-Edit Resilience Tests
 * KB-1248: Tests for code lens handler resilience during rapid malformed edits.
 *
 * Code lens is LOW risk (uses cached symbol data), but still needs resilience
 * against malformed cache states and concurrent document mutations.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerCodeLensHandlers } from '../features/advanced/code-lens.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry, CoreSymbol } from '../core/types.js';
import type { PikeSymbolKind } from '@pike-lsp/pike-bridge';
import { createMockDocuments } from '../tests/helpers/test-helpers.js';
import { FaultInjectableMockBridge } from '../tests/helpers/mock-bridge.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function createCodeLensHarness(bridge?: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const consoleErrors: string[] = [];

  let _codeLensHandler:
    | ((
        params: { textDocument: { uri: string } },
        token: { isCancellationRequested: boolean }
      ) => unknown[])
    | undefined;
  let _codeLensResolveHandler:
    | ((
        lens: { data?: unknown; range?: unknown },
        token: { isCancellationRequested: boolean }
      ) => unknown)
    | undefined;

  const connection = {
    onCodeLens(
      handler: (
        params: { textDocument: { uri: string } },
        token: { isCancellationRequested: boolean }
      ) => unknown[]
    ) {
      _codeLensHandler = handler;
    },
    onCodeLensResolve(
      handler: (
        lens: { data?: unknown; range?: unknown },
        token: { isCancellationRequested: boolean }
      ) => unknown
    ) {
      _codeLensResolveHandler = handler;
    },
    onRequest() {},
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    console: {
      log() {},
      warn() {},
      error(message: unknown) {
        consoleErrors.push(String(message));
      },
    },
  };

  const services = {
    bridge: bridge ?? new FaultInjectableMockBridge(),
    documentCache: {
      get(uri: string) {
        return cache.get(uri);
      },
      set(uri: string, entry: DocumentCacheEntry) {
        cache.set(uri, entry);
      },
      setPending(_uri: string, promise: Promise<void>) {
        void promise.catch(() => {});
      },
      waitFor: async () => {},
      delete(uri: string) {
        cache.delete(uri);
      },
      keys() {
        return cache.keys();
      },
      entries() {
        return cache.entries();
      },
    },
    typeDatabase: {
      setProgram() {},
      removeProgram() {},
      getMemoryStats() {
        return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
      },
    },
    workspaceIndex: {
      indexDocument() {},
      removeDocument() {},
      getAllDocumentUris() {
        return [...cache.keys()];
      },
    },
    includeResolver: null,
    stdlibIndex: null,
    globalSettings: {
      pikePath: 'pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 5,
      runnable: { showCodeLens: true },
    },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  } as unknown as Services;

  registerCodeLensHandlers(
    connection as unknown as Connection,
    services,
    docs as unknown as TextDocuments<TextDocument>
  );

  const triggerCodeLens = (uri: string, token?: { isCancellationRequested: boolean }) => {
    if (!_codeLensHandler) return [];
    return _codeLensHandler({ textDocument: { uri } }, token ?? { isCancellationRequested: false });
  };

  const triggerCodeLensResolve = (
    lens: { data?: unknown; range?: unknown },
    token?: { isCancellationRequested: boolean }
  ) => {
    if (!_codeLensResolveHandler) return lens;
    return _codeLensResolveHandler(lens, token ?? { isCancellationRequested: false });
  };

  const setDocumentWithSymbols = (
    uri: string,
    text: string,
    symbols: CoreSymbol[],
    symbolPositions?: Map<string, Array<{ line: number; character: number }>>
  ) => {
    const symbolNames = new Map<string, CoreSymbol>();
    for (const sym of symbols) {
      symbolNames.set(sym.name, sym);
    }
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols,
      symbolNames,
      symbolPositions: symbolPositions ?? new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, text));
  };

  return {
    docs,
    cache,
    consoleErrors,
    triggerCodeLens,
    triggerCodeLensResolve,
    setDocumentWithSymbols,
    services,
  };
}

function makeSymbol(name: string, kind: PikeSymbolKind, line: number, column: number): CoreSymbol {
  return {
    name,
    kind,
    modifiers: [],
    position: { file: '', line, column },
  };
}

describe('Code Lens: parse-under-edit resilience', () => {
  it('returns code lenses even when processing encounters errors during malformed edits', () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token'),
        probability: 0.5,
      }
    );

    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness(bridge);
    const uri = 'file:///codelens-malformed.pike';

    setDocumentWithSymbols(
      uri,
      'class MyClass {\n  void doStuff() {}\n}\n',
      [
        makeSymbol('MyClass', 'class', 1, 1),
        makeSymbol('doStuff', 'method', 2, 1),
      ]
    );

    const result = triggerCodeLens(uri);
    assert.ok(Array.isArray(result), 'Should return an array even with fault injection');
  });

  it('handles rapid document changes without crashing', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: incomplete expression'),
        probability: 0.3,
      }
    );

    const { triggerCodeLens, setDocumentWithSymbols, cache } = createCodeLensHarness(bridge);
    const uri = 'file:///codelens-rapid.pike';

    // Initial setup
    setDocumentWithSymbols(uri, 'int x = 1;\n', [makeSymbol('x', 'variable', 1, 1)]);

    const malformedTexts = [
      'int x = ;\n',
      'int x = (\n',
      'int x = 1 + \n',
      'class Foo {}\n',
      'int x = 2;\n',
    ];

    const results: unknown[][] = [];
    for (let i = 0; i < malformedTexts.length; i++) {
      const symbol: CoreSymbol = {
        name: 'x',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      };
      const entry: DocumentCacheEntry = {
        version: i + 2,
        symbols: [symbol],
        symbolNames: new Map([['x', symbol]]),
        symbolPositions: new Map(),
        diagnostics: [],
      };
      cache.set(uri, entry);

      const result = triggerCodeLens(uri);
      results.push(result);

      await wait(10);
    }

    assert.equal(results.length, malformedTexts.length, 'All 5 requests should complete');
    for (let i = 0; i < results.length; i++) {
      assert.ok(Array.isArray(results[i]), `Request ${i + 1} should return an array`);
    }
  });

  it('handles cancellation during code lens generation', () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        delayMs: { min: 50, max: 100 },
      }
    );

    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness(bridge);
    const uri = 'file:///codelens-cancel.pike';

    setDocumentWithSymbols(
      uri,
      'class MyClass {\n  void doStuff() {}\n}\n',
      [
        makeSymbol('MyClass', 'class', 1, 1),
        makeSymbol('doStuff', 'method', 2, 1),
      ]
    );

    // Trigger with already-cancelled token
    const result = triggerCodeLens(uri, { isCancellationRequested: true });
    assert.ok(Array.isArray(result), 'Should return array on cancellation');
    assert.equal(result.length, 0, 'Should return empty array on cancellation');
  });

  it('recovers after transient parse errors', () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected end of file'),
        probability: 0.5,
      }
    );

    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness(bridge);
    const uri = 'file:///codelens-recovery.pike';

    setDocumentWithSymbols(
      uri,
      'class MyClass {\n  void doStuff() {}\n}\n',
      [
        makeSymbol('MyClass', 'class', 1, 1),
        makeSymbol('doStuff', 'method', 2, 1),
      ]
    );

    // First request may fail or succeed due to 50% fault rate
    const result1 = triggerCodeLens(uri);
    assert.ok(Array.isArray(result1), 'First request should return an array');

    // Clear faults for second request
    bridge.clearFaults();

    // Second request should succeed cleanly
    const result2 = triggerCodeLens(uri);
    assert.ok(Array.isArray(result2), 'Second request should return an array after clearing faults');
  });

  it('handles missing document gracefully', () => {
    const { triggerCodeLens } = createCodeLensHarness();
    const uri = 'file:///nonexistent.pike';

    const result = triggerCodeLens(uri);
    assert.ok(Array.isArray(result), 'Should return an array');
    assert.equal(result.length, 0, 'Should return empty for unknown document');
  });

  it('resolve handler returns lens on error', () => {
    const { triggerCodeLensResolve } = createCodeLensHarness();

    const lens = {
      data: {
        uri: 'file:///nonexistent.pike',
        symbolName: 'MissingSymbol',
        kind: 'class',
        position: { line: 0, character: 0 },
      },
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 13 },
      },
    };

    const result = triggerCodeLensResolve(lens);
    assert.ok(result, 'Should return lens object, not throw');
    // With missing document, resolve returns the original lens (no command populated)
    assert.ok(
      'data' in (result as object),
      'Returned lens should preserve original data'
    );
  });

  it('resolve handler computes ref counts from symbol positions', () => {
    const { triggerCodeLensResolve, setDocumentWithSymbols } = createCodeLensHarness();
    const uri = 'file:///codelens-refs.pike';

    const symbolPositions = new Map<string, Array<{ line: number; character: number }>>();
    symbolPositions.set('myMethod', [
      { line: 1, character: 0 },
      { line: 5, character: 2 },
    ]);

    setDocumentWithSymbols(
      uri,
      'void myMethod() {}\n// uses myMethod\n',
      [makeSymbol('myMethod', 'method', 1, 1)],
      symbolPositions
    );

    const lens = {
      data: {
        uri,
        symbolName: 'myMethod',
        kind: 'method',
        position: { line: 0, character: 0 },
      },
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 8 },
      },
    };

    const result = triggerCodeLensResolve(lens) as { command?: { title?: string } };
    assert.ok(result, 'Should return resolved lens');
    assert.ok(result.command, 'Should have a command with ref count');
    // 2 positions for myMethod → "2 references" or similar
    assert.ok(
      result.command?.title?.includes('2'),
      `Expected "2" in command title, got: ${result.command?.title}`
    );
  });
});
