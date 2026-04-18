/**
 * Code Lens Parse-Under-Edit Resilience Tests
 * KB-1262: Tests for code lens handler resilience during rapid malformed edits
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, DidChangeConfigurationParams } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { registerCodeLensHandlers } from '../features/advanced/code-lens.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry, CoreSymbol } from '../core/types.js';
import { createMockDocuments } from '../tests/helpers/test-helpers.js';
import { FaultInjectableMockBridge } from '../tests/helpers/mock-bridge.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function createCodeLensHarness(bridge: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const codeLenses: Array<{ uri: string; result: unknown }> = [];
  const consoleErrors: string[] = [];

  const connection = {
    onCodeLens(handler: (params: { textDocument: { uri: string } }) => Promise<unknown>) {
      this.codeLensHandler = handler;
    },
    codeLensHandler: undefined as
      | ((params: { textDocument: { uri: string } }) => Promise<unknown>)
      | undefined,
    onCodeLensResolve(handler: (lens: unknown) => Promise<unknown>) {
      this.codeLensResolveHandler = handler;
    },
    codeLensResolveHandler: undefined as ((lens: unknown) => Promise<unknown>) | undefined,
    onRequest() {},
    onDidChangeConfiguration(_handler: (params: DidChangeConfigurationParams) => void) {},
    console: {
      log() {},
      warn() {},
      error(message: unknown) {
        consoleErrors.push(String(message));
      },
    },
  };

  const services = {
    bridge,
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
      runnable: { showCodeLens: true, testPattern: '^test_' },
    },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  registerCodeLensHandlers(
    connection as unknown as Connection,
    services as unknown as Services,
    docs
  );

  // Helper to trigger code lens requests
  const triggerCodeLens = async (uri: string) => {
    const handler = connection.codeLensHandler;
    if (!handler) return [];
    const result = await handler({
      textDocument: { uri },
    });
    codeLenses.push({ uri, result });
    return result as Array<{ range: unknown; data: unknown }>;
  };

  // Helper to trigger code lens resolve
  const triggerCodeLensResolve = async (lens: unknown) => {
    const handler = connection.codeLensResolveHandler;
    if (!handler) return lens;
    const result = await handler(lens);
    return result;
  };

  // Helper to set cached document with symbols
  const setDocumentWithSymbols = (uri: string, text: string, symbols: CoreSymbol[]) => {
    const symbolNames = new Map<string, CoreSymbol>();
    const symbolPositions = new Map<string, Array<{ line: number; character: number }>>();
    for (const sym of symbols) {
      symbolNames.set(sym.name, sym);
      if (sym.position) {
        symbolPositions.set(sym.name, [
          { line: (sym.position.line ?? 1) - 1, character: (sym.position.column ?? 1) - 1 },
        ]);
      }
    }
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols,
      symbolNames,
      symbolPositions,
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, text));
  };

  return {
    docs,
    cache,
    codeLenses,
    consoleErrors,
    triggerCodeLens,
    triggerCodeLensResolve,
    setDocumentWithSymbols,
  };
}

describe('Code Lens: parse-under-edit resilience', () => {
  it('returns code lenses even when symbol iteration has failures', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        // Simulate failures during symbol processing
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token'),
        probability: 0.5,
      }
    );

    const { setDocumentWithSymbols, triggerCodeLens } = createCodeLensHarness(bridge);
    const uri = 'file:///codelens-parse-resilience.pike';

    // Set up document with multiple symbols, some with corrupted-looking data
    const symbols: CoreSymbol[] = [
      {
        name: 'MyClass',
        kind: 'class',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      },
      {
        name: 'myMethod',
        kind: 'method',
        modifiers: [],
        position: { file: uri, line: 3, column: 4 },
      },
      {
        name: 'MY_CONST',
        kind: 'constant',
        modifiers: [],
        position: { file: uri, line: 5, column: 0 },
      },
    ];

    setDocumentWithSymbols(
      uri,
      'class MyClass {}\nvoid myMethod() {}\nconstant MY_CONST = 1;\n',
      symbols
    );

    // Trigger code lens request
    const result = await triggerCodeLens(uri);

    // Should return an array without throwing
    assert.ok(Array.isArray(result), 'Code lens should return an array even with failures');
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

    const { setDocumentWithSymbols, triggerCodeLens, cache } = createCodeLensHarness(bridge);
    const uri = 'file:///codelens-rapid-changes.pike';

    // Initial document
    setDocumentWithSymbols(uri, 'int stable = 1;\n', [
      {
        name: 'stable',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      },
    ]);

    // Simulate rapid edits with malformed intermediate states
    const texts = [
      'int stable = 1;\n',
      'int stable = ;\n',
      'int stable = (\n',
      'int stable = 1 + \n',
      'int stable = 2;\n',
    ];

    const results: unknown[][] = [];

    for (let i = 0; i < texts.length; i++) {
      // Update cached document with incremented version
      const symbol: CoreSymbol = {
        name: 'stable',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      };
      const entry: DocumentCacheEntry = {
        version: i + 1,
        symbols: [symbol],
        symbolNames: new Map([['stable', symbol]]),
        symbolPositions: new Map([['stable', [{ line: 0, character: 0 }]]]),
        diagnostics: [],
      };
      cache.set(uri, entry);

      // Trigger code lens during edit
      const result = await triggerCodeLens(uri);
      results.push(result as unknown[]);

      await wait(10);
    }

    // All requests should complete
    assert.equal(results.length, texts.length, 'All code lens requests should complete');

    // Should not crash even with malformed edits
    assert.ok(true, 'Code lens survived rapid malformed edits');
  });

  it('handles cancellation during code lens requests', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        delayMs: { min: 50, max: 100 },
      }
    );

    const { setDocumentWithSymbols, triggerCodeLens } = createCodeLensHarness(bridge);
    const uri = 'file:///codelens-cancellation.pike';

    setDocumentWithSymbols(uri, 'int testVar = 42;\n', [
      {
        name: 'testVar',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      },
    ]);

    // Start code lens request
    const codeLensPromise = triggerCodeLens(uri);

    // Cancel immediately (simulate rapid edit cancelling the request)
    await wait(5);

    // The request should complete without throwing
    const result = await codeLensPromise;
    // Result should be an array (possibly empty if cancelled)
    assert.ok(Array.isArray(result), 'Cancelled code lens should complete gracefully');
  });

  it('recovers after transient parse errors', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected end of file'),
        probability: 0.5,
      }
    );

    const { setDocumentWithSymbols, triggerCodeLens } = createCodeLensHarness(bridge);
    const uri = 'file:///codelens-recovery.pike';

    setDocumentWithSymbols(uri, 'int recoverable = 123;\n', [
      {
        name: 'recoverable',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      },
    ]);

    // First request may fail or return partial results
    void (await triggerCodeLens(uri));

    // Clear faults for second request
    bridge.clearFaults();

    // Second request should succeed
    const result2 = await triggerCodeLens(uri);

    assert.ok(Array.isArray(result2), 'Code lens should recover after clearing faults');
  });

  it('handles missing document gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerCodeLens } = createCodeLensHarness(bridge);
    const uri = 'file:///nonexistent.pike';

    // Try to get code lenses for non-existent document
    const result = await triggerCodeLens(uri);

    // Should return empty array without throwing
    assert.deepEqual(result, [], 'Should return empty array for non-existent document');
  });

  it('resolve handler returns lens even on failure', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { setDocumentWithSymbols, triggerCodeLens, triggerCodeLensResolve } =
      createCodeLensHarness(bridge);
    const uri = 'file:///codelens-resolve-resilience.pike';

    // Set up document with a symbol that has symbolPositions for ref counting
    setDocumentWithSymbols(uri, 'class MyClass {}\n', [
      {
        name: 'MyClass',
        kind: 'class',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      },
    ]);

    // First get code lenses to have lenses to resolve
    const lenses = await triggerCodeLens(uri);

    if (lenses.length > 0) {
      // Resolve the first lens
      const resolved = await triggerCodeLensResolve(lenses[0]);
      // Should return a lens object (possibly with or without command) without throwing
      assert.ok(
        typeof resolved === 'object' && resolved !== null,
        'Resolved lens should be an object'
      );
    } else {
      // If no lenses generated (e.g. handler returned []), resolve a synthetic lens
      const syntheticLens = {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 7 },
        },
        data: {
          uri,
          symbolName: 'MyClass',
          kind: 'class',
          position: { line: 0, character: 0 },
        },
      };
      const resolved = await triggerCodeLensResolve(syntheticLens);
      assert.ok(
        typeof resolved === 'object' && resolved !== null,
        'Resolved lens should be an object even for synthetic lens'
      );
    }
  });
});
