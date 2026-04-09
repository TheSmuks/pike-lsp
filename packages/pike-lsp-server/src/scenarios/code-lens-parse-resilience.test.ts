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

/**
 * Creates a mock CancellationToken that can be cancelled on demand.
 */
function createCancellationToken() {
  let cancelled = false;
  return {
    get isCancellationRequested() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    },
  };
}

function createCodeLensHarness() {
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

  const services: Services = {
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
    version: number,
    symbols: CoreSymbol[],
    symbolPositions?: Map<string, Array<{ line: number; character: number }>>
  ) => {
    const symbolNames = new Map<string, CoreSymbol>();
    for (const sym of symbols) {
      symbolNames.set(sym.name, sym);
    }
    const entry: DocumentCacheEntry = {
      version,
      symbols,
      symbolNames,
      symbolPositions: symbolPositions ?? new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
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
  it('returns empty array when document cache is empty', () => {
    const { triggerCodeLens } = createCodeLensHarness();
    const uri = 'file:///nonexistent.pike';
    const result = triggerCodeLens(uri);
    assert.ok(Array.isArray(result), 'Should return an array');
    assert.equal(result.length, 0, 'Should be empty for unknown document');
  });

  it('generates lenses from cached symbols without crashing', () => {
    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness();
    const uri = 'file:///codelens-basic.pike';

    setDocumentWithSymbols(uri, 1, [
      makeSymbol('MyClass', 'class', 1, 1),
      makeSymbol('doStuff', 'method', 5, 1),
      makeSymbol('count', 'variable', 10, 1),
    ]);

    const result = triggerCodeLens(uri);
    assert.ok(Array.isArray(result), 'Should return an array');
    // class + method + variable = 3 reference count lenses
    assert.ok(result.length >= 3, 'Should have lenses for class, method, and variable');
  });

  it('survives symbols with missing position data', () => {
    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness();
    const uri = 'file:///codelens-missing-pos.pike';

    const symbols: CoreSymbol[] = [
      makeSymbol('ValidClass', 'class', 1, 1),
      {
        name: 'NoPosClass',
        kind: 'class',
        modifiers: [],
        // position deliberately omitted
      } as CoreSymbol,
      makeSymbol('AnotherValid', 'method', 10, 1),
    ];

    setDocumentWithSymbols(uri, 1, symbols);
    const result = triggerCodeLens(uri);
    assert.ok(Array.isArray(result), 'Should not crash on missing positions');
    // Should still have lenses for the valid symbols
    assert.ok(result.length >= 1, 'Should have lenses for valid symbols');
  });

  it('survives rapid document version changes', () => {
    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness();
    const uri = 'file:///codelens-rapid.pike';

    // Simulate rapid edits where version increments but symbols change
    const versions = [
      [makeSymbol('A', 'class', 1, 1)],
      [makeSymbol('A', 'class', 1, 1), makeSymbol('B', 'method', 5, 1)],
      [
        makeSymbol('A', 'class', 1, 1),
        makeSymbol('B', 'method', 5, 1),
        makeSymbol('C', 'variable', 10, 1),
      ],
      [makeSymbol('A', 'class', 1, 1)], // Reverted
    ];

    const results: unknown[][] = [];
    for (let i = 0; i < versions.length; i++) {
      setDocumentWithSymbols(uri, i + 1, versions[i]!);
      const result = triggerCodeLens(uri);
      results.push(result);
    }

    assert.equal(results.length, versions.length, 'All requests should complete');
    for (let i = 0; i < results.length; i++) {
      assert.ok(Array.isArray(results[i]), `Version ${i + 1} should return an array`);
    }
  });

  it('returns empty array when cancellation is requested', () => {
    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness();
    const uri = 'file:///codelens-cancel.pike';
    const token = createCancellationToken();

    setDocumentWithSymbols(uri, 1, [makeSymbol('A', 'class', 1, 1)]);

    // Cancel before request
    token.cancel();
    const result = triggerCodeLens(uri, token);
    assert.ok(Array.isArray(result), 'Should return array even when cancelled');
    assert.equal(result.length, 0, 'Should return empty array on cancellation');
  });

  it('handles resolve with missing cache gracefully', () => {
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
        end: { line: 0, character: 10 },
      },
    };

    const result = triggerCodeLensResolve(lens);
    assert.ok(result, 'Should return a lens object, not throw');
  });

  it('handles resolve when cache.entries() throws', () => {
    const { triggerCodeLensResolve, setDocumentWithSymbols, services } = createCodeLensHarness();
    const uri = 'file:///codelens-resolve-err.pike';

    setDocumentWithSymbols(uri, 1, [makeSymbol('Test', 'class', 1, 1)]);

    // Sabotage entries() to throw
    const origEntries = services.documentCache.entries.bind(services.documentCache);
    (
      services.documentCache as unknown as {
        entries: () => IterableIterator<[string, DocumentCacheEntry]>;
      }
    ).entries = function* () {
      throw new Error('simulated cache corruption');
    };

    const lens = {
      data: {
        uri,
        symbolName: 'Test',
        kind: 'class',
        position: { line: 0, character: 0 },
      },
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    };

    // Should not throw, should return the lens
    const result = triggerCodeLensResolve(lens);
    assert.ok(result, 'Should return lens without throwing on cache error');

    // Restore
    (
      services.documentCache as unknown as {
        entries: () => IterableIterator<[string, DocumentCacheEntry]>;
      }
    ).entries = origEntries;
  });

  it('handles resolve cancellation gracefully', () => {
    const { triggerCodeLensResolve, setDocumentWithSymbols } = createCodeLensHarness();
    const uri = 'file:///codelens-resolve-cancel.pike';
    const token = createCancellationToken();

    setDocumentWithSymbols(uri, 1, [makeSymbol('Test', 'class', 1, 1)]);
    token.cancel();

    const lens = {
      data: {
        uri,
        symbolName: 'Test',
        kind: 'class',
        position: { line: 0, character: 0 },
      },
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    };

    const result = triggerCodeLensResolve(lens, token);
    assert.ok(result, 'Should return lens on cancellation without throwing');
  });

  it('resolves run-file and run-test lens types without cache access', () => {
    const { triggerCodeLensResolve } = createCodeLensHarness();

    const runFileLens = {
      data: {
        uri: 'file:///test.pike',
        symbolName: 'main',
        kind: 'method',
        position: { line: 0, character: 0 },
        lensType: 'run-file',
      },
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
    };

    const result = triggerCodeLensResolve(runFileLens);
    assert.ok(result, 'Should resolve run-file lens without throwing');
    const resolved = result as { command?: unknown };
    assert.ok(resolved.command, 'Should have a command for run-file lens');
  });

  it('computes ref counts across multiple cached documents', () => {
    const { triggerCodeLensResolve, setDocumentWithSymbols } = createCodeLensHarness();
    const uri1 = 'file:///doc1.pike';
    const uri2 = 'file:///doc2.pike';

    // doc1 has the symbol at line 1, doc2 references it
    const positions = new Map<string, Array<{ line: number; character: number }>>();
    positions.set('SharedClass', [
      { line: 1, character: 0 },
      { line: 5, character: 0 },
    ]);

    setDocumentWithSymbols(uri1, 1, [makeSymbol('SharedClass', 'class', 1, 1)], positions);

    const positions2 = new Map<string, Array<{ line: number; character: number }>>();
    positions2.set('SharedClass', [{ line: 3, character: 0 }]);
    setDocumentWithSymbols(uri2, 1, [makeSymbol('OtherClass', 'class', 1, 1)], positions2);

    const lens = {
      data: {
        uri: uri1,
        symbolName: 'SharedClass',
        kind: 'class',
        position: { line: 0, character: 0 },
      },
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
      },
    };

    const result = triggerCodeLensResolve(lens) as { command?: { title?: string } };
    assert.ok(result, 'Should resolve cross-document ref counts');
    assert.ok(result.command, 'Should have a command with ref count');
    // 2 from doc1 + 1 from doc2 = 3 references
    assert.ok(
      result.command?.title?.includes('3'),
      `Expected "3" in command title, got: ${result.command?.title}`
    );
  });

  it('survives symbols with null names in the loop', () => {
    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness();
    const uri = 'file:///codelens-null-name.pike';

    const symbols: CoreSymbol[] = [
      makeSymbol('ValidClass', 'class', 1, 1),
      {
        name: '',
        kind: 'method',
        modifiers: [],
        position: { file: '', line: 5, column: 1 },
      } as CoreSymbol,
      makeSymbol('AnotherValid', 'method', 10, 1),
    ];

    setDocumentWithSymbols(uri, 1, symbols);
    const result = triggerCodeLens(uri);
    assert.ok(Array.isArray(result), 'Should not crash on empty-name symbols');
  });

  it('survives malformed symbol position data', () => {
    const { triggerCodeLens, setDocumentWithSymbols } = createCodeLensHarness();
    const uri = 'file:///codelens-bad-pos.pike';

    const symbols: CoreSymbol[] = [
      {
        name: 'BadLineClass',
        kind: 'class',
        modifiers: [],
        position: { file: '', line: -5, column: -1 },
      } as CoreSymbol,
      makeSymbol('ValidAfterBad', 'method', 10, 1),
    ];

    setDocumentWithSymbols(uri, 1, symbols);
    const result = triggerCodeLens(uri);
    assert.ok(Array.isArray(result), 'Should not crash on negative positions');
    // The bad position gets Math.max(0, ...) so it still produces a lens at line 0
    assert.ok(result.length >= 1, 'Should still have lenses despite bad positions');
  });
});
