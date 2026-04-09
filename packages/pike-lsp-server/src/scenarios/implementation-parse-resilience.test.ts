/**
 * Implementation Parse-Under-Edit Resilience Tests
 * KB-1248: Tests for implementation handler resilience during rapid malformed edits
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerImplementationHandler } from '../features/navigation/implementation.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry, CoreSymbol } from '../core/types.js';
import { createMockDocuments } from '../tests/helpers/test-helpers.js';
import { FaultInjectableMockBridge } from '../tests/helpers/mock-bridge.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function createImplementationHarness(bridge: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const results: Array<{ uri: string; result: unknown }> = [];
  const consoleErrors: string[] = [];

  const connection = {
    onImplementation(
      handler: (params: {
        textDocument: { uri: string };
        position: { line: number; character: number };
      }, cancellationToken?: { isCancellationRequested: boolean }) => Promise<unknown>
    ) {
      this.implHandler = handler;
    },
    implHandler: undefined as
      | ((params: {
          textDocument: { uri: string };
          position: { line: number; character: number };
        }, cancellationToken?: { isCancellationRequested: boolean }) => Promise<unknown>)
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
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 5 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    pikeIntrospection: {
      async getInherits(uri: string) {
        const entry = cache.get(uri);
        if (!entry) return [];

        // Build inheritance relations from cached symbols
        const relations: Array<{
          uri: string;
          ownerClass: string;
          ownerLine: number;
          inheritedName: string;
          inheritedPath?: string;
        }> = [];

        const classSymbols = entry.symbols.filter(s => s.kind === 'class');
        const inheritSymbols = entry.symbols.filter(
          s => s.kind === 'inherit' || s.name === 'inherit'
        );

        for (const inherit of inheritSymbols) {
          // Find owning class by position
          const ownerClass = classSymbols.find(cls => {
            const clsLine = (cls.position?.line ?? 1) - 1;
            const inhLine = (inherit.position?.line ?? 1) - 1;
            return clsLine <= inhLine;
          });

          if (ownerClass) {
            relations.push({
              uri,
              ownerClass: ownerClass.name,
              ownerLine: (ownerClass.position?.line ?? 1) - 1,
              inheritedName: inherit.classname ?? inherit.name,
            });
          }
        }

        return relations;
      },
      async searchImportableSymbols() {
        return [];
      },
    },
  };

  registerImplementationHandler(
    connection as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  // Helper to trigger implementation requests with optional cancellation token
  const triggerImplementation = async (
    uri: string,
    line: number,
    character: number,
    cancellationToken?: { isCancellationRequested: boolean }
  ) => {
    const handler = connection.implHandler;
    if (!handler) return [];
    const result = await handler({
      textDocument: { uri },
      position: { line, character },
    }, cancellationToken);
    results.push({ uri, result });
    return result;
  };

  // Helper to set cached document with class symbol
  const setDocumentWithClass = (
    uri: string,
    text: string,
    className: string,
    inherits: Array<{ name: string; classname?: string; line?: number }> = []
  ) => {
    const classSymbol: CoreSymbol = {
      name: className,
      kind: 'class',
      modifiers: [],
      position: { file: uri, line: 1, column: 0 },
    };

    const inheritSymbols: CoreSymbol[] = inherits.map(inh => ({
      name: inh.name,
      kind: 'inherit' as const,
      classname: inh.classname ?? inh.name,
      modifiers: [],
      position: { file: uri, line: (inh.line ?? 2) as number, column: 0 },
    }));

    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [classSymbol, ...inheritSymbols],
      symbolNames: new Map([[className, classSymbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, text));
  };

  return {
    docs,
    cache,
    results,
    consoleErrors,
    triggerImplementation,
    setDocumentWithClass,
  };
}

describe('Implementation: parse-under-edit resilience', () => {
  it('returns implementations even when introspection fails during malformed edits', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token during introspection'),
        probability: 0.5,
      }
    );

    const { setDocumentWithClass, triggerImplementation } = createImplementationHarness(bridge);
    const baseUri = 'file:///impl-parse-resilience-base.pike';
    const implUri = 'file:///impl-parse-resilience-impl.pike';

    // Set up base class
    setDocumentWithClass(baseUri, 'class BaseClass { }\n', 'BaseClass');

    // Set up implementation
    setDocumentWithClass(implUri, 'class ImplClass { inherit BaseClass; }\n', 'ImplClass', [
      { name: 'BaseClass', classname: 'BaseClass', line: 1 },
    ]);

    // Trigger implementation on base class
    const result = await triggerImplementation(baseUri, 0, 6);

    // Should return array (possibly partial) without throwing
    assert.ok(Array.isArray(result), 'Implementation should return an array even with failures');
  });

  it('handles rapid document changes without crashing', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: incomplete class definition'),
        probability: 0.3,
      }
    );

    const { setDocumentWithClass, triggerImplementation, cache } =
      createImplementationHarness(bridge);
    const baseUri = 'file:///impl-rapid-changes-base.pike';
    const implUri = 'file:///impl-rapid-changes-impl.pike';

    // Initial setup
    setDocumentWithClass(baseUri, 'class Base { }\n', 'Base');
    setDocumentWithClass(implUri, 'class ImplA { inherit Base; }\n', 'ImplA', [
      { name: 'Base', line: 1 },
    ]);

    // Simulate rapid edits with malformed intermediate states
    const texts = [
      'class Base { }\n', // Valid
      'class Base { \n', // Malformed: unclosed brace
      'class Base\n', // Malformed: missing body
      'class Base { inherit\n', // Malformed: incomplete inherit
      'class Base { }\n', // Fixed
    ];

    const testResults: (unknown | null)[] = [];

    for (let i = 0; i < texts.length; i++) {
      // Update cached document
      const symbol: CoreSymbol = {
        name: 'Base',
        kind: 'class',
        modifiers: [],
        position: { file: baseUri, line: 1, column: 0 },
      };
      const entry: DocumentCacheEntry = {
        version: i + 1,
        symbols: [symbol],
        symbolNames: new Map([['Base', symbol]]),
        symbolPositions: new Map(),
        diagnostics: [],
      };
      cache.set(baseUri, entry);

      // Trigger implementation during edit
      const result = await triggerImplementation(baseUri, 0, 6);
      testResults.push(result);

      await wait(10);
    }

    // All requests should complete
    assert.equal(testResults.length, texts.length, 'All implementation requests should complete');

    // Should not crash even with malformed edits
    assert.ok(true, 'Implementation survived rapid malformed edits');
  });

  it('handles cancellation during implementation lookup', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        delayMs: { min: 50, max: 100 },
      }
    );

    const { setDocumentWithClass, triggerImplementation } = createImplementationHarness(bridge);
    const uri = 'file:///impl-cancellation.pike';

    setDocumentWithClass(uri, 'class CancelClass { }\n', 'CancelClass');

    // Trigger implementation with already-cancelled token
    const result = await triggerImplementation(uri, 0, 6, { isCancellationRequested: true });

    // Early cancellation returns empty array
    assert.ok(
      result === null || Array.isArray(result),
      'Cancelled implementation should complete gracefully'
    );
  });

  it('recovers after transient introspection errors', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('introspection failed: parse error'),
        probability: 0.5,
      }
    );

    const { setDocumentWithClass, triggerImplementation } = createImplementationHarness(bridge);
    const baseUri = 'file:///impl-recovery-base.pike';
    const implUri = 'file:///impl-recovery-impl.pike';

    setDocumentWithClass(baseUri, 'class Recoverable { }\n', 'Recoverable');
    setDocumentWithClass(implUri, 'class Recovered { inherit Recoverable; }\n', 'Recovered', [
      { name: 'Recoverable', line: 1 },
    ]);

    // First request may fail
    void (await triggerImplementation(baseUri, 0, 6));

    // Clear faults for second request
    bridge.clearFaults();

    // Second request should succeed
    const result2 = await triggerImplementation(baseUri, 0, 6);

    assert.ok(Array.isArray(result2), 'Implementation should recover after clearing faults');
  });

  it('handles missing document gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerImplementation } = createImplementationHarness(bridge);

    // Try implementation for non-existent document
    const result = await triggerImplementation('file:///nonexistent.pike', 0, 0);

    // Should return empty array without throwing
    assert.deepEqual(result, [], 'Should return empty array for non-existent document');
  });

  it('handles symbol lookup failure gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerImplementation, cache, docs } = createImplementationHarness(bridge);
    const uri = 'file:///impl-symbol-lookup.pike';

    // Set up document with empty symbols array
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [],
      symbolNames: new Map(),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'class Unknown { }\n'));

    // Trigger implementation at a position — no symbol at position
    const result = await triggerImplementation(uri, 0, 6);

    // No symbol found at position, should return empty array
    assert.ok(Array.isArray(result), 'Should return array');
    assert.equal(result.length, 0, 'Should return empty array when no symbol at position');
  });
});
