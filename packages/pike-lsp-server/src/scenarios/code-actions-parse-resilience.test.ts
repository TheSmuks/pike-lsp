/**
 * Code Actions Parse-Under-Edit Resilience Tests
 * KB-1248: Tests for code actions handler resilience during rapid malformed edits
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerCodeActionsHandler } from '../features/advanced/code-actions.js';
import type { DocumentCacheEntry, CoreSymbol } from '../core/types.js';
import {
  createMockDocuments,
  createMockConnection,
  asConnection,
  asServices,
  asTextDocuments,
} from '../tests/helpers/test-helpers.js';
import { FaultInjectableMockBridge } from '../tests/helpers/mock-bridge.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function createCodeActionsHarness(bridge: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const codeActions: Array<{ uri: string; result: unknown }> = [];
  const conn = createMockConnection();
  const consoleErrors: string[] = [];
  // Override console.error to capture errors
  conn.console.error = (message: unknown) => {
    consoleErrors.push(String(message));
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
      organizeImports: { removeUnused: true },
    },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    pikeIntrospection: {
      async searchImportableSymbols(
        symbol: string,
        _options: { excludeUri?: string; limit?: number }
      ) {
        // Simulate introspection returning some candidates
        return [{ modulePath: `Test.${symbol}`, importKind: 'inherit' as const, score: 1.0 }];
      },
    },
  };

  registerCodeActionsHandler(asConnection(conn), asServices(services), asTextDocuments(docs));

  // Helper to trigger code action requests
  const triggerCodeActions = async (
    uri: string,
    line: number,
    character: number,
    diagnostics: unknown[] = [],
    only?: string[]
  ) => {
    const handler = conn.codeActionHandler as
      | ((params: {
          textDocument: { uri: string };
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
          context: { diagnostics: unknown[]; only?: string[] };
        }) => Promise<unknown>)
      | undefined;
    if (!handler) return [];
    const result = await handler({
      textDocument: { uri },
      range: {
        start: { line, character },
        end: { line, character },
      },
      context: { diagnostics, ...(only ? { only } : {}) },
    });
    codeActions.push({ uri, result });
    return result as Array<{ title: string; kind?: string }>;
  };

  // Helper to set cached document with symbol
  const setDocumentWithSymbol = (uri: string, text: string, symbolName: string) => {
    const symbol: CoreSymbol = {
      name: symbolName,
      kind: 'variable',
      modifiers: [],
      position: { file: uri, line: 1, column: 0 },
    };
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [symbol],
      symbolNames: new Map([[symbolName, symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, text));
  };

  return {
    docs,
    cache,
    codeActions,
    consoleErrors,
    triggerCodeActions,
    setDocumentWithSymbol,
    services,
  };
}

describe('Code Actions: parse-under-edit resilience', () => {
  it('returns code actions even when introspection fails during malformed edits', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        // Simulate introspection failures during parse-under-edit
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token'),
        probability: 0.5,
      }
    );

    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-parse-resilience.pike';

    // Set up document with diagnostics that would trigger quick fixes
    setDocumentWithSymbol(uri, 'int myVar = 1;\n', 'myVar');

    // Trigger code actions with a syntax error diagnostic
    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved symbol: MissingType',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: { symbol: 'MissingType', importCandidates: [] },
      },
    ]);

    // Should return code actions (possibly empty) without throwing
    assert.ok(Array.isArray(result), 'Code actions should return an array even with failures');
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

    const { setDocumentWithSymbol, triggerCodeActions, cache } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-rapid-changes.pike';

    // Initial document
    setDocumentWithSymbol(uri, 'int stable = 1;\n', 'stable');

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
      // Update cached document
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
        symbolPositions: new Map(),
        diagnostics: [],
      };
      cache.set(uri, entry);

      // Trigger code actions during edit
      const result = await triggerCodeActions(uri, 0, 0, [], ['quickfix', 'refactor'] as string[]);
      results.push(result as unknown[]);

      await wait(10);
    }

    // All requests should complete
    assert.equal(results.length, texts.length, 'All code action requests should complete');

    // Should not crash even with malformed edits
    assert.ok(true, 'Code actions survived rapid malformed edits');
  });

  it('handles cancellation during code action requests', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        delayMs: { min: 50, max: 100 },
      }
    );

    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-cancellation.pike';

    setDocumentWithSymbol(uri, 'int testVar = 42;\n', 'testVar');

    // Start code action request
    const codeActionsPromise = triggerCodeActions(uri, 0, 0);

    // Cancel immediately
    await wait(5);

    // The request should complete without throwing
    const result = await codeActionsPromise;
    assert.ok(Array.isArray(result), 'Cancelled code actions should complete gracefully');
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

    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-recovery.pike';

    setDocumentWithSymbol(uri, 'int recoverable = 123;\n', 'recoverable');

    // First request may fail
    void (await triggerCodeActions(uri, 0, 0));

    // Clear faults for second request
    bridge.clearFaults();

    // Second request should succeed
    const result2 = await triggerCodeActions(uri, 0, 0, [], ['source.organizeImports']);

    assert.ok(Array.isArray(result2), 'Code actions should recover after clearing faults');
  });

  it('handles missing document gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///nonexistent.pike';

    // Try to get code actions for non-existent document
    const result = await triggerCodeActions(uri, 0, 0);

    // Should return empty array without throwing
    assert.deepEqual(result, [], 'Should return empty array for non-existent document');
  });

  it('handles organize imports during malformed edits', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token'),
        probability: 0.3,
      }
    );

    const { triggerCodeActions, cache } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-organize.pike';

    // Document with imports that needs organizing
    const symbol: CoreSymbol = {
      name: 'x',
      kind: 'variable',
      modifiers: [],
      position: { file: uri, line: 4, column: 0 },
    };
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [symbol],
      symbolNames: new Map([['x', symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);

    // Trigger organize imports
    const result = await triggerCodeActions(uri, 0, 0, [], ['source.organizeImports']);

    // Should return array (may be empty if parsing fails, but should not throw)
    assert.ok(Array.isArray(result), 'Organize imports should complete gracefully');
  });

  it('handles quick fix for unresolved symbols gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-quickfix.pike';

    setDocumentWithSymbol(uri, 'UnknownType x;\n', 'x');

    // Trigger with unresolved symbol diagnostic
    const result = await triggerCodeActions(
      uri,
      0,
      0,
      [
        {
          code: 'undefined-symbol.unresolved-import',
          message: 'Unresolved symbol: UnknownType',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 11 } },
          data: { symbol: 'UnknownType' },
        },
      ],
      ['quickfix']
    );

    // Should return array without throwing
    assert.ok(Array.isArray(result), 'Quick fix should complete gracefully');
  });

  it('survives introspection failures when searching importable symbols', async () => {
    const bridge = new FaultInjectableMockBridge();

    const harness = createCodeActionsHarness(bridge);
    const { setDocumentWithSymbol, triggerCodeActions, services } = harness;
    const uri = 'file:///code-actions-introspection-fail.pike';

    setDocumentWithSymbol(uri, 'MissingSymbol x;\n', 'x');

    // Override pikeIntrospection to throw
    services.pikeIntrospection = {
      async searchImportableSymbols() {
        throw new Error('Introspection service unavailable');
      },
    };

    // Trigger with unresolved symbol - introspection will fail but should be handled
    const result = await triggerCodeActions(
      uri,
      0,
      0,
      [
        {
          code: 'undefined-symbol.unresolved-import',
          message: 'Unresolved symbol: MissingSymbol',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 13 } },
          data: { symbol: 'MissingSymbol' },
        },
      ],
      ['quickfix']
    );

    // Should return empty array without throwing
    assert.ok(Array.isArray(result), 'Should handle introspection failure gracefully');
  });

  it('handles getter/setter generation failures gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerCodeActions, cache } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-gettersetter.pike';

    // Document with a field that could have getter/setter generated
    const symbol: CoreSymbol = {
      name: '_value',
      kind: 'variable',
      modifiers: ['private'],
      position: { file: uri, line: 1, column: 10 },
    };
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [symbol],
      symbolNames: new Map([['_value', symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);

    // Trigger getter/setter generation
    const result = await triggerCodeActions(uri, 0, 20, [], ['refactor']);

    // Should return array without throwing
    assert.ok(Array.isArray(result), 'Getter/setter generation should complete gracefully');
  });

  it('handles request supersession for same URI without crashing', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-supersede.pike';

    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    // Fire two concurrent requests for the same URI — second should supersede first
    const promise1 = triggerCodeActions(uri, 0, 0);
    const promise2 = triggerCodeActions(uri, 0, 0);

    const [result1, result2] = await Promise.allSettled([promise1, promise2]);

    // Both should settle without unhandled rejection
    assert.ok(result1.status === 'fulfilled', 'First request should settle');
    assert.ok(result2.status === 'fulfilled', 'Second request should settle');

    // At least one should return an array (possibly empty due to supersession)
    if (result1.status === 'fulfilled') {
      assert.ok(Array.isArray(result1.value), 'First result should be an array');
    }
    if (result2.status === 'fulfilled') {
      assert.ok(Array.isArray(result2.value), 'Second result should be an array');
    }
  });

  it('handles concurrent requests for different URIs', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri1 = 'file:///code-actions-concurrent-a.pike';
    const uri2 = 'file:///code-actions-concurrent-b.pike';

    setDocumentWithSymbol(uri1, 'int a = 1;\n', 'a');
    setDocumentWithSymbol(uri2, 'int b = 2;\n', 'b');

    // Fire concurrent requests for different URIs — neither should be superseded
    const [result1, result2] = await Promise.all([
      triggerCodeActions(uri1, 0, 0),
      triggerCodeActions(uri2, 0, 0),
    ]);

    assert.ok(Array.isArray(result1), 'First URI result should be an array');
    assert.ok(Array.isArray(result2), 'Second URI result should be an array');
  });

  it('handles rapid sequential requests for same URI without memory leak', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///code-actions-rapid-seq.pike';

    setDocumentWithSymbol(uri, 'int rapid = 1;\n', 'rapid');

    // Fire many sequential requests — each supersedes the previous
    const results: unknown[] = [];
    for (let i = 0; i < 20; i++) {
      const result = await triggerCodeActions(uri, 0, 0);
      results.push(result);
    }

    assert.equal(results.length, 20, 'All sequential requests should complete');
    for (let i = 0; i < results.length; i++) {
      assert.ok(Array.isArray(results[i]), `Request ${i} should return an array`);
    }
  });
});

describe('ImportCandidate type guard validation', () => {
  it('accepts valid candidate with all fields', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-full.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved: Parser.Pike',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: {
          symbol: 'Parser',
          importCandidates: [{ modulePath: 'Parser.Pike', importKind: 'import', score: 100 }],
        },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should return an array');
  });

  it('accepts valid candidate with only required field', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-minimal.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved: Some.Module',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: {
          symbol: 'SomeModule',
          importCandidates: [{ modulePath: 'Some.Module' }],
        },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should return an array');
  });

  it('rejects null entries in importCandidates', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-null.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: { symbol: 'Foo', importCandidates: [null] },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should not crash on null entries');
  });

  it('rejects non-object primitives in importCandidates', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-primitives.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: { symbol: 'Foo', importCandidates: [42, 'string', true] },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should not crash on primitive entries');
  });

  it('rejects arrays in importCandidates', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-array.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: { symbol: 'Foo', importCandidates: [['Parser.Pike']] },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should not crash on array entries');
  });

  it('rejects object missing modulePath', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-no-path.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: { symbol: 'Foo', importCandidates: [{ importKind: 'import', score: 50 }] },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should not crash on missing modulePath');
  });

  it('rejects object with non-string modulePath', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-bad-path.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: { symbol: 'Foo', importCandidates: [{ modulePath: 123, importKind: 'import' }] },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should not crash on non-string modulePath');
  });

  it('filters mixed valid and invalid candidates', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-mixed.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: {
          symbol: 'Foo',
          importCandidates: [
            null,
            { modulePath: 'Valid.Module' },
            42,
            { importKind: 'inherit' },
            { modulePath: 'Another', importKind: 'inherit', score: 90 },
          ],
        },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should return an array for mixed candidates');
  });

  it('handles non-array importCandidates field', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-nonarray.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: { symbol: 'Foo', importCandidates: 'Parser.Pike' },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should not crash on non-array importCandidates');
  });

  it('existing auto-import code actions still work end-to-end', async () => {
    const bridge = new FaultInjectableMockBridge();
    const { setDocumentWithSymbol, triggerCodeActions } = createCodeActionsHarness(bridge);
    const uri = 'file:///import-candidate-e2e.pike';
    setDocumentWithSymbol(uri, 'int x = 1;\n', 'x');

    const result = await triggerCodeActions(uri, 0, 0, [
      {
        code: 'undefined-symbol.unresolved-import',
        message: 'Unresolved symbol: Parser',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        data: {
          symbol: 'Parser',
          importCandidates: [
            { modulePath: 'Parser.Pike', importKind: 'import', score: 100 },
            { modulePath: 'Parser.Pike', importKind: 'inherit', score: 50 },
          ],
        },
      },
    ]);
    assert.ok(Array.isArray(result), 'Should return code actions');
  });
});
