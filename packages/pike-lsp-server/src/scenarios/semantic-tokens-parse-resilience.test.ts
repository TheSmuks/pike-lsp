/**
 * Semantic Tokens Parse-Under-Edit Resilience Tests
 * KB-1248: Tests for semantic tokens handler resilience during rapid malformed edits.
 *
 * Semantic tokens reads from documentCache + documents (no bridge calls),
 * so resilience is tested via cache state mutations, malformed text, and cancellation.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerSemanticTokensHandler } from '../features/advanced/semantic-tokens.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry, CoreSymbol } from '../core/types.js';
import { createMockDocuments } from '../tests/helpers/test-helpers.js';
import { FaultInjectableMockBridge } from '../tests/helpers/mock-bridge.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function createSemanticTokensHarness(bridge: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();

  const connection = {
    languages: {
      semanticTokens: {
        on(
          handler: (
            params: { textDocument: { uri: string } },
            cancellationToken?: { isCancellationRequested: boolean }
          ) => unknown
        ) {
          this.onHandler = handler;
        },
        onDelta(
          handler: (
            params: { textDocument: { uri: string }; previousResultId: string },
            cancellationToken?: { isCancellationRequested: boolean }
          ) => unknown
        ) {
          this.onDeltaHandler = handler;
        },
        onHandler: undefined as Function | undefined,
        onDeltaHandler: undefined as Function | undefined,
      },
    },
    onRequest() {},
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    console: { log() {}, warn() {}, error() {} },
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
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 5 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  registerSemanticTokensHandler(
    connection as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  const triggerFullTokens = async (
    uri: string,
    cancellationToken?: { isCancellationRequested: boolean }
  ) => {
    const handler = connection.languages.semanticTokens.onHandler;
    if (!handler) return null;
    return handler({ textDocument: { uri } }, cancellationToken);
  };

  const triggerDeltaTokens = async (
    uri: string,
    previousResultId = '0',
    cancellationToken?: { isCancellationRequested: boolean }
  ) => {
    const handler = connection.languages.semanticTokens.onDeltaHandler;
    if (!handler) return null;
    return handler({ textDocument: { uri }, previousResultId }, cancellationToken);
  };

  const setDocumentWithSymbol = (uri: string, text: string, symbolName: string, kind: CoreSymbol['kind'] = 'class') => {
    const symbol: CoreSymbol = {
      name: symbolName,
      kind,
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
    connection,
    triggerFullTokens,
    triggerDeltaTokens,
    setDocumentWithSymbol,
    services,
  };
}

describe('Semantic Tokens: parse-under-edit resilience', () => {
  it('returns tokens even when tokenization encounters errors during malformed edits', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token'),
        probability: 0.5,
      }
    );

    const { setDocumentWithSymbol, triggerFullTokens } =
      createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-malformed.pike';

    // Set up document with a class symbol and valid text
    setDocumentWithSymbol(uri, 'class MyClass {\n  int x = 1;\n}\n', 'MyClass', 'class');

    const result = await triggerFullTokens(uri);

    assert.ok(result, 'Should return a result object');
    assert.ok('resultId' in (result as object), 'Result should have resultId');
    assert.ok('data' in (result as object), 'Result should have data array');
    // Data may be non-empty since symbols are in cache and text is valid
    assert.ok(
      Array.isArray((result as { data: unknown }).data),
      'data should be an array'
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

    const { triggerFullTokens, cache, docs } = createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-rapid.pike';

    // Simulate rapid edits with malformed intermediate text
    const texts = [
      'class Handler {\n  int count = 0;\n}\n',
      'class Handler {\n  int count = ;\n}\n', // Malformed: missing value
      'class Handler {\n  int count = (\n}\n', // Malformed: unclosed paren
      'class Handler {\n  int count = 1 + \n}\n', // Malformed: incomplete expression
      'class Handler {\n  int count = 1;\n}\n', // Fixed
    ];

    const results: unknown[] = [];

    for (let i = 0; i < texts.length; i++) {
      const symbol: CoreSymbol = {
        name: 'Handler',
        kind: 'class',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      };
      const entry: DocumentCacheEntry = {
        version: i + 1,
        symbols: [symbol],
        symbolNames: new Map([['Handler', symbol]]),
        symbolPositions: new Map(),
        diagnostics: [],
      };
      cache.set(uri, entry);
      docs.emitOpen(TextDocument.create(uri, 'pike', i + 1, texts[i]!));

      const result = await triggerFullTokens(uri);
      results.push(result);

      await wait(5);
    }

    // All requests should complete without throwing
    assert.equal(results.length, texts.length, 'All token requests should complete');

    // At least one should return non-empty data (the valid documents)
    const nonEmptyCount = results.filter(
      r => r !== null && Array.isArray((r as { data: unknown }).data) && ((r as { data: unknown[] }).data.length > 0)
    ).length;
    assert.ok(nonEmptyCount >= 1, 'At least one request should return non-empty tokens');
  });

  it('handles cancellation during tokenization', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        delayMs: { min: 50, max: 100 },
      }
    );

    const { setDocumentWithSymbol, triggerFullTokens } =
      createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-cancel.pike';

    setDocumentWithSymbol(uri, 'int myVar = 1;\n', 'myVar', 'variable');

    // Trigger with already-cancelled token — handler checks early
    const result = await triggerFullTokens(uri, { isCancellationRequested: true });

    assert.ok(result, 'Should return a result object even when cancelled');
    assert.deepEqual(result, { resultId: '0', data: [] }, 'Should return empty fallback on cancellation');
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

    const { setDocumentWithSymbol, triggerFullTokens } =
      createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-recovery.pike';

    setDocumentWithSymbol(uri, 'class Recover {\n  int val = 1;\n}\n', 'Recover', 'class');

    // First request — may encounter partial failure in underlying services
    await triggerFullTokens(uri);

    // Clear faults for second request
    bridge.clearFaults();

    // Second request should succeed with actual tokens
    const result = await triggerFullTokens(uri);
    const typed = result as { resultId: string; data: number[] } | null;

    assert.ok(typed, 'Should return a result after recovery');
    assert.ok('resultId' in typed!, 'Should have resultId');
    assert.ok('data' in typed!, 'Should have data');
    // After recovery with valid document + symbols, should produce tokens
    assert.ok(typed!.data.length > 0, 'Should return non-empty tokens after recovery');
  });

  it('handles missing document gracefully', async () => {
    const bridge = new FaultInjectableMockBridge({});

    const { triggerFullTokens } = createSemanticTokensHarness(bridge);

    // Request tokens for a URI that was never opened
    const result = await triggerFullTokens('file:///nonexistent.pike');

    assert.deepEqual(result, { resultId: '0', data: [] }, 'Should return empty fallback for missing document');
  });

  it('delta requests return graceful fallback on error', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: malformed token stream'),
        probability: 0.5,
      }
    );

    const { setDocumentWithSymbol, triggerDeltaTokens } =
      createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-delta.pike';

    setDocumentWithSymbol(uri, 'class Delta {\n  int x = 1;\n}\n', 'Delta', 'class');

    const result = await triggerDeltaTokens(uri, '0');

    assert.ok(result, 'Delta request should return a result');
    assert.ok('resultId' in (result as object), 'Delta result should have resultId');
    assert.ok('edits' in (result as object), 'Delta result should have edits array');
    assert.ok(
      Array.isArray((result as { edits: unknown }).edits),
      'edits should be an array'
    );
  });
});
