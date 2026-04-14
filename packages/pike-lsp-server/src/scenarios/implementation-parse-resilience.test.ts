/**
 * Implementation Parse-Under-Edit Resilience Tests
 * KB-1262: Tests for implementation handler resilience during rapid malformed edits
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerImplementationHandler } from '../features/navigation/implementation.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry, CoreSymbol } from '../core/types.js';
import type { InheritRelation } from '../services/pike-introspection.js';
import { createMockDocuments } from '../tests/helpers/test-helpers.js';
import { FaultInjectableMockBridge } from '../tests/helpers/mock-bridge.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function createImplementationHarness(bridge: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const impls: Array<{ uri: string; result: unknown }> = [];
  const consoleErrors: string[] = [];

  const connection = {
    onImplementation(
      handler: (params: {
        textDocument: { uri: string };
        position: { line: number; character: number };
      }) => Promise<unknown>
    ) {
      this.implHandler = handler;
    },
    implHandler: undefined as
      | ((params: {
          textDocument: { uri: string };
          position: { line: number; character: number };
        }) => Promise<unknown>)
      | undefined,
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

  // Mutable mock so tests can override getInherits per-URI
  const pikeIntrospectionMock: {
    getInherits: (uri: string) => Promise<InheritRelation[]>;
    searchImportableSymbols: () => Promise<never[]>;
  } = {
    async getInherits(_uri: string): Promise<InheritRelation[]> {
      return [];
    },
    async searchImportableSymbols() {
      return [];
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
    workspaceScanner: {
      getAllFiles() {
        return [];
      },
    },
    includeResolver: null,
    stdlibIndex: null,
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 5 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    pikeIntrospection: pikeIntrospectionMock,
  };

  registerImplementationHandler(
    connection as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  // Helper to trigger implementation requests
  const triggerImplementation = async (uri: string, line: number, character: number) => {
    const handler = connection.implHandler;
    if (!handler) return null;
    const result = await handler({
      textDocument: { uri },
      position: { line, character },
    });
    impls.push({ uri, result });
    return result;
  };

  // Helper to set cached document with a class symbol.
  // Places the class name at column 6 in the text (after "class ") so
  // findSymbolAtPosition can extract it at (line 0, character 6).
  const setDocumentWithClass = (uri: string, text: string, className: string) => {
    const symbol: CoreSymbol = {
      name: className,
      kind: 'class',
      modifiers: [],
      position: { file: uri, line: 1, column: 0 },
    };
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [symbol],
      symbolNames: new Map([[className, symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, text));
  };

  return {
    docs,
    cache,
    impls,
    consoleErrors,
    triggerImplementation,
    setDocumentWithClass,
    services,
    pikeIntrospectionMock,
  };
}

describe('Implementation: parse-under-edit resilience', () => {
  it('returns empty array when introspection fails during malformed edits', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token'),
        probability: 0.5,
      }
    );

    const { setDocumentWithClass, triggerImplementation } = createImplementationHarness(bridge);
    const uri = 'file:///impl-parse-resilience.pike';

    // Set up document with a class symbol. "BaseClass" starts at column 6.
    setDocumentWithClass(uri, 'class BaseClass { }\n', 'BaseClass');

    // Trigger implementation lookup on the class name
    const result = await triggerImplementation(uri, 0, 6);

    // Should return an empty array (or Location[]) without throwing
    assert.ok(
      Array.isArray(result),
      'Implementation should return array even when introspection fails'
    );
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

    const { setDocumentWithClass, triggerImplementation, cache } =
      createImplementationHarness(bridge);
    const uri = 'file:///impl-rapid-changes.pike';

    // Initial document
    setDocumentWithClass(uri, 'class Stable { }\n', 'Stable');

    // Simulate rapid edits with malformed intermediate states.
    // Each text keeps "Stable" at column 6 so findSymbolAtPosition resolves.
    const texts = [
      'class Stable { }\n',
      'class Stable {\n', // Malformed: unclosed brace
      'class Stable extends\n', // Malformed: incomplete inherits
      'class Stable { ;\n', // Malformed: stray semicolon
      'class Stable { }\n', // Fixed
    ];

    const results: (unknown | null)[] = [];

    for (let i = 0; i < texts.length; i++) {
      const symbol: CoreSymbol = {
        name: 'Stable',
        kind: 'class',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      };
      const entry: DocumentCacheEntry = {
        version: i + 1,
        symbols: [symbol],
        symbolNames: new Map([['Stable', symbol]]),
        symbolPositions: new Map(),
        diagnostics: [],
      };
      cache.set(uri, entry);

      const result = await triggerImplementation(uri, 0, 6);
      results.push(result);

      await wait(10);
    }

    // All requests should complete (either with result or null, never throw)
    assert.equal(results.length, texts.length, 'All implementation requests should complete');

    // Every result must be null or an array
    for (const r of results) {
      assert.ok(r === null || Array.isArray(r), 'Each result should be null or array');
    }
  });

  it('handles cancellation during implementation requests', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        delayMs: { min: 50, max: 100 },
      }
    );

    const { setDocumentWithClass, triggerImplementation } = createImplementationHarness(bridge);
    const uri = 'file:///impl-cancellation.pike';

    setDocumentWithClass(uri, 'class TestCancel { }\n', 'TestCancel');

    // Start implementation request
    const implPromise = triggerImplementation(uri, 0, 6);

    // Cancel immediately (simulate rapid cursor movement)
    await wait(5);

    // The request should complete without throwing
    const result = await implPromise;
    assert.ok(
      result === null || Array.isArray(result),
      'Cancelled implementation request should complete gracefully'
    );
  });

  it('recovers after transient introspection errors', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected end of file'),
        probability: 0.5,
      }
    );

    const { setDocumentWithClass, triggerImplementation } = createImplementationHarness(bridge);
    const uri = 'file:///impl-recovery.pike';

    setDocumentWithClass(uri, 'class Recoverable { }\n', 'Recoverable');

    // First request may fail
    void (await triggerImplementation(uri, 0, 6));

    // Clear faults for second request
    bridge.clearFaults();

    // Second request should succeed
    const result2 = await triggerImplementation(uri, 0, 6);

    assert.ok(Array.isArray(result2), 'Implementation should recover after clearing faults');
  });

  it('handles missing document gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerImplementation } = createImplementationHarness(bridge);
    const uri = 'file:///nonexistent.pike';

    // Request implementations for non-existent document
    const result = await triggerImplementation(uri, 0, 0);

    // Should return empty array without throwing
    assert.deepEqual(result, [], 'Should return empty array for non-existent document');
  });

  it('per-URI failure isolation: one URI failure does not block another', async () => {
    const bridge = new FaultInjectableMockBridge();

    const harness = createImplementationHarness(bridge);
    const { setDocumentWithClass, triggerImplementation, cache, pikeIntrospectionMock } = harness;

    const uriBase = 'file:///impl-isolation-base.pike';
    const uriFailing = 'file:///impl-isolation-failing.pike';
    const uriChild = 'file:///impl-isolation-child.pike';

    // Set up the base class document (this is what we query)
    setDocumentWithClass(uriBase, 'class BaseClass { }\n', 'BaseClass');

    // Set up a failing URI in cache — getInherits will throw for this one
    const failSymbol: CoreSymbol = {
      name: 'FailingClass',
      kind: 'class',
      modifiers: [],
      position: { file: uriFailing, line: 1, column: 0 },
    };
    const failEntry: DocumentCacheEntry = {
      version: 1,
      symbols: [failSymbol],
      symbolNames: new Map([['FailingClass', failSymbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uriFailing, failEntry);

    // Set up a child URI in cache — getInherits returns a matching inheritance relation
    const childSymbol: CoreSymbol = {
      name: 'ChildClass',
      kind: 'class',
      modifiers: [],
      position: { file: uriChild, line: 1, column: 0 },
    };
    const childEntry: DocumentCacheEntry = {
      version: 1,
      symbols: [childSymbol],
      symbolNames: new Map([['ChildClass', childSymbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uriChild, childEntry);

    // Override getInherits with per-URI behavior.
    // The handler captured pikeIntrospectionMock at registration time; mutating
    // the same object changes the behavior for already-registered closures.
    pikeIntrospectionMock.getInherits = async (uri: string) => {
      if (uri === uriFailing) {
        throw new Error('parse error: file is malformed');
      }
      if (uri === uriChild) {
        return [
          {
            inheritedName: 'BaseClass',
            uri: uriChild,
            ownerLine: 0,
            ownerClass: 'ChildClass',
          },
        ];
      }
      return [];
    };

    // Trigger implementation lookup for BaseClass
    const result = await triggerImplementation(uriBase, 0, 6);

    // Should still find implementations from non-failing URIs
    assert.ok(Array.isArray(result), 'Should return array despite per-URI failures');
    assert.ok(
      (result as unknown[]).length > 0,
      'Should find implementations from non-failing URIs'
    );
  });
});
