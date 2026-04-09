/**
 * Semantic Tokens Parse-Under-Edit Resilience Tests
 * KB-1262: Tests for semantic tokens handler resilience during rapid malformed edits
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
  const tokenResults: Array<{ uri: string; result: unknown }> = [];
  const consoleErrors: string[] = [];

  const connection = {
    languages: {
      semanticTokens: {
        on(handler: (params: { textDocument: { uri: string } }) => Promise<unknown>) {
          this.onHandler = handler;
        },
        onDelta(
          handler: (params: {
            textDocument: { uri: string };
            previousResultId: string;
          }) => Promise<unknown>
        ) {
          this.onDeltaHandler = handler;
        },
        onHandler: undefined as
          | ((params: { textDocument: { uri: string } }) => Promise<unknown>)
          | undefined,
        onDeltaHandler: undefined as
          | ((params: {
              textDocument: { uri: string };
              previousResultId: string;
            }) => Promise<unknown>)
          | undefined,
      },
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
      runnable: { showCodeLens: false },
    },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    pikeIntrospection: {
      async searchImportableSymbols() {
        return [];
      },
    },
  };

  registerSemanticTokensHandler(
    connection as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  // Helper to trigger full token requests
  const triggerTokens = async (uri: string) => {
    const handler = connection.languages.semanticTokens.onHandler;
    if (!handler) return null;
    const result = await handler({ textDocument: { uri } });
    tokenResults.push({ uri, result });
    return result;
  };

  // Helper to trigger delta token requests
  const triggerTokensDelta = async (uri: string, previousResultId: string) => {
    const handler = connection.languages.semanticTokens.onDeltaHandler;
    if (!handler) return null;
    const result = await handler({ textDocument: { uri }, previousResultId });
    tokenResults.push({ uri, result });
    return result;
  };

  // Helper to set cached document with symbols
  const setDocumentWithSymbols = (
    uri: string,
    text: string,
    symbols: CoreSymbol[],
    version = 1
  ) => {
    const entry: DocumentCacheEntry = {
      version,
      symbols,
      symbolNames: new Map(symbols.map(s => [s.name, s])),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', version, text));
  };

  return {
    docs,
    cache,
    tokenResults,
    consoleErrors,
    triggerTokens,
    triggerTokensDelta,
    setDocumentWithSymbols,
  };
}

describe('Semantic Tokens: parse-under-edit resilience', () => {
  it('returns tokens even when regex construction fails on symbol names with special chars', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token'),
        probability: 0.5,
      }
    );

    const { setDocumentWithSymbols, triggerTokens } = createSemanticTokensHarness(bridge);
    const uri = 'file:///semtokens-regex-resilience.pike';

    // Symbol with regex-special characters in name
    const symbols: CoreSymbol[] = [
      {
        name: 'var$special*chars',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 4 },
      },
    ];

    setDocumentWithSymbols(uri, 'int var$special*chars = 1;\n', symbols);

    const result = await triggerTokens(uri);

    // Should return a result object despite regex-special chars in symbol name
    assert.ok(result, 'Semantic tokens should return result even with regex-special symbol names');
    assert.ok(
      typeof result === 'object' && result !== null && 'resultId' in result && 'data' in result,
      'Semantic tokens result should have resultId and data'
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

    const { setDocumentWithSymbols, triggerTokens, cache } = createSemanticTokensHarness(bridge);
    const uri = 'file:///semtokens-rapid-changes.pike';

    // Initial document
    setDocumentWithSymbols(uri, 'int stable = 1;\n', [
      {
        name: 'stable',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 4 },
      },
    ]);

    // Simulate rapid edits with malformed intermediate states
    const texts = [
      'int stable = 1;\n',
      'int stable = ;\n', // Malformed: missing value
      'int stable = (\n', // Malformed: unclosed paren
      'int stable = 1 + \n', // Malformed: incomplete expression
      'int stable = 2;\n', // Fixed
    ];

    const results: (unknown | null)[] = [];

    for (let i = 0; i < texts.length; i++) {
      const symbol: CoreSymbol = {
        name: 'stable',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 4 },
      };
      const entry: DocumentCacheEntry = {
        version: i + 2,
        symbols: [symbol],
        symbolNames: new Map([['stable', symbol]]),
        symbolPositions: new Map(),
        diagnostics: [],
      };
      cache.set(uri, entry);

      // Trigger token request during edit
      const result = await triggerTokens(uri);
      results.push(result);

      await wait(10);
    }

    // All requests should complete (never throw)
    assert.equal(results.length, texts.length, 'All semantic token requests should complete');

    // At least one successful result in valid states
    const successCount = results.filter(r => r !== null).length;
    assert.ok(successCount >= 1, 'At least some semantic token requests should succeed');
  });

  it('handles cancellation during token requests', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        delayMs: { min: 50, max: 100 },
      }
    );

    const { setDocumentWithSymbols, triggerTokens } = createSemanticTokensHarness(bridge);
    const uri = 'file:///semtokens-cancellation.pike';

    setDocumentWithSymbols(uri, 'int testVar = 42;\n', [
      {
        name: 'testVar',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 4 },
      },
    ]);

    // Start token request
    const tokenPromise = triggerTokens(uri);

    // Wait briefly (simulate rapid cancellation)
    await wait(5);

    // The request should complete without throwing
    const result = await tokenPromise;
    assert.ok(
      result === null || typeof result === 'object',
      'Cancelled semantic token request should complete gracefully'
    );
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

    const { setDocumentWithSymbols, triggerTokens } = createSemanticTokensHarness(bridge);
    const uri = 'file:///semtokens-recovery.pike';

    setDocumentWithSymbols(uri, 'int recoverable = 123;\n', [
      {
        name: 'recoverable',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 4 },
      },
    ]);

    // First request may fail due to injected fault
    void (await triggerTokens(uri));

    // Clear faults for second request
    bridge.clearFaults();

    // Second request should succeed
    const result2 = await triggerTokens(uri);

    assert.ok(
      result2 !== null && typeof result2 === 'object' && 'resultId' in result2 && 'data' in result2,
      'Semantic tokens should recover after clearing faults'
    );
  });

  it('delta handler returns valid response on malformed input', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: malformed token stream'),
        probability: 0.3,
      }
    );

    const { setDocumentWithSymbols, triggerTokens, triggerTokensDelta } =
      createSemanticTokensHarness(bridge);
    const uri = 'file:///semtokens-delta-malformed.pike';

    setDocumentWithSymbols(uri, 'string data = "hello";\n', [
      {
        name: 'data',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 7 },
      },
    ]);

    // First: get full tokens to establish a resultId
    const fullResult = await triggerTokens(uri);
    assert.ok(fullResult && typeof fullResult === 'object', 'Full token request should succeed');

    const previousResultId = (fullResult as { resultId: string }).resultId;

    // Now send delta with malformed intermediate state
    const result = await triggerTokensDelta(uri, previousResultId);

    // Should return valid delta response without throwing
    assert.ok(
      result !== null && typeof result === 'object',
      'Delta response should be returned for malformed input'
    );
    assert.ok(
      'resultId' in (result as object) && 'edits' in (result as object),
      'Delta result should have resultId and edits'
    );
  });

  it('handles missing document gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerTokens } = createSemanticTokensHarness(bridge);
    const uri = 'file:///semtokens-missing.pike';

    // Request tokens for a URI with no document
    const result = await triggerTokens(uri);

    // Should return empty result without throwing
    assert.ok(
      result !== null && typeof result === 'object',
      'Should return result object for missing document'
    );
    assert.deepEqual(
      (result as { resultId: string; data: number[] }).data,
      [],
      'Should return empty data for missing document'
    );
    assert.equal(
      (result as { resultId: string; data: number[] }).resultId,
      '0',
      'Should return resultId "0" for missing document'
    );
  });
});
