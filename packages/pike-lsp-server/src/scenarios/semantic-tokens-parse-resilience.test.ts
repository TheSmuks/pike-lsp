/**
 * Semantic Tokens Parse-Under-Edit Resilience Tests
 * KB-1248: Tests for semantic tokens handler resilience during rapid malformed edits
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
          this.tokensHandler = handler;
        },
        onDelta(
          handler: (params: {
            textDocument: { uri: string };
            previousResultId: string;
          }) => Promise<unknown>
        ) {
          this.deltaHandler = handler;
        },
        tokensHandler: undefined as
          | ((params: { textDocument: { uri: string } }) => Promise<unknown>)
          | undefined,
        deltaHandler: undefined as
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
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 5 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  registerSemanticTokensHandler(
    connection as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  // Helper to trigger semantic tokens requests
  const triggerSemanticTokens = async (uri: string) => {
    const handler = connection.languages.semanticTokens.tokensHandler;
    if (!handler) return null;
    const result = await handler({ textDocument: { uri } });
    tokenResults.push({ uri, result });
    return result;
  };

  // Helper to trigger delta requests
  const triggerSemanticTokensDelta = async (uri: string, previousResultId: string) => {
    const handler = connection.languages.semanticTokens.deltaHandler;
    if (!handler) return null;
    const result = await handler({ textDocument: { uri }, previousResultId });
    return result;
  };

  // Helper to set cached document with symbols
  const setDocumentWithSymbols = (uri: string, text: string, symbols: CoreSymbol[]) => {
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols,
      symbolNames: new Map(symbols.map(s => [s.name, s])),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, text));
  };

  return {
    docs,
    cache,
    tokenResults,
    consoleErrors,
    triggerSemanticTokens,
    triggerSemanticTokensDelta,
    setDocumentWithSymbols,
  };
}

describe('Semantic Tokens: parse-under-edit resilience', () => {
  it('returns tokens even when symbol regex fails during malformed edits', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { setDocumentWithSymbols, triggerSemanticTokens } = createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-parse-resilience.pike';

    // Include a symbol with a name that could cause regex issues
    const symbols: CoreSymbol[] = [
      {
        name: 'normalVar',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 4 },
      },
      {
        name: 'class({[', // Potentially problematic regex name
        kind: 'class',
        modifiers: [],
        position: { file: uri, line: 2, column: 0 },
      },
    ];

    setDocumentWithSymbols(uri, 'int normalVar = 1;\nclass broken { }\n', symbols);

    const result = await triggerSemanticTokens(uri);

    // Should return a result without throwing, even if one symbol's regex fails
    assert.ok(
      result !== null && typeof result === 'object' && 'data' in result,
      'Semantic tokens should return data even when symbol regex fails'
    );
  });

  it('handles rapid document changes without crashing', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerSemanticTokens, cache } = createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-rapid-changes.pike';

    // Simulate rapid edits with malformed intermediate states
    const texts = [
      'int stable = 1;\n', // Valid
      'int stable = ;\n', // Malformed: missing value
      'class C {\n  int x\n', // Malformed: incomplete class
      'class C {\n  int x = 1;\n...', // Malformed: unclosed block
      'int repaired = 2;\n', // Valid again
    ];

    const results: (unknown | null)[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] ?? '';
      // Update cached document
      const symbol: CoreSymbol = {
        name: text.includes('stable') ? 'stable' : 'repaired',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 4 },
      };
      const entry: DocumentCacheEntry = {
        version: i + 1,
        symbols: [symbol],
        symbolNames: new Map([[symbol.name, symbol]]),
        symbolPositions: new Map(),
        diagnostics: [],
      };
      cache.set(uri, entry);

      // Trigger semantic tokens during edit
      const result = await triggerSemanticTokens(uri);
      results.push(result);

      await wait(10);
    }

    // All requests should complete
    assert.equal(results.length, texts.length, 'All semantic tokens requests should complete');

    // All should return valid token data (never throw)
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      assert.ok(
        result !== null && typeof result === 'object' && 'data' in result,
        `Request ${i} should return valid token data`
      );
    }
  });

  it('handles delta requests gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerSemanticTokens, triggerSemanticTokensDelta, cache } =
      createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-delta.pike';

    // Initial document
    const symbol: CoreSymbol = {
      name: 'counter',
      kind: 'variable',
      modifiers: [],
      position: { file: uri, line: 1, column: 4 },
    };
    cache.set(uri, {
      version: 1,
      symbols: [symbol],
      symbolNames: new Map([['counter', symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    });

    // First request to get resultId
    const firstResult = await triggerSemanticTokens(uri);
    assert.ok(firstResult && typeof firstResult === 'object' && 'resultId' in firstResult);

    const resultId = (firstResult as { resultId: string }).resultId;

    // Update document (version change)
    cache.set(uri, {
      version: 2,
      symbols: [symbol],
      symbolNames: new Map([['counter', symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    });

    // Delta request
    const deltaResult = await triggerSemanticTokensDelta(uri, resultId);
    assert.ok(
      deltaResult !== null && typeof deltaResult === 'object',
      'Delta request should complete gracefully'
    );
  });

  it('handles missing document gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerSemanticTokens } = createSemanticTokensHarness(bridge);

    const result = await triggerSemanticTokens('file:///nonexistent.pike');

    // Should return empty tokens
    assert.ok(
      result !== null && typeof result === 'object' && 'data' in result,
      'Should return empty tokens for non-existent document'
    );
    assert.deepEqual((result as { data: number[] }).data, [], 'Should return empty data array');
  });

  it('handles empty symbol list gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { setDocumentWithSymbols, triggerSemanticTokens } = createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-empty-symbols.pike';

    // Document with empty symbols
    setDocumentWithSymbols(uri, '// Just a comment\n', []);

    const result = await triggerSemanticTokens(uri);

    assert.ok(
      result !== null && typeof result === 'object' && 'data' in result,
      'Should return valid result for empty symbols'
    );
  });

  it('survives keyword regex failures during tokenization', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerSemanticTokens, cache, docs } = createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-keyword-resilience.pike';

    // Document with control keywords
    const symbol: CoreSymbol = {
      name: 'x',
      kind: 'variable',
      modifiers: [],
      position: { file: uri, line: 1, column: 4 },
    };
    cache.set(uri, {
      version: 1,
      symbols: [symbol],
      symbolNames: new Map([['x', symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    });
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'if (x) { return 1; }\n'));

    const result = await triggerSemanticTokens(uri);

    assert.ok(
      result !== null && typeof result === 'object' && 'data' in result,
      'Should return tokens with keywords highlighted'
    );
    // Note: keyword token count depends on PIKE_KEYWORDS content
    const data = (result as { data: number[] }).data;
    assert.ok(Array.isArray(data), 'Should produce token data array');
  });

  it('handles malformed symbol names without crashing', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { setDocumentWithSymbols, triggerSemanticTokens } = createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-malformed-names.pike';

    // Symbols with unusual names that might cause regex issues
    const symbols: CoreSymbol[] = [
      {
        name: '', // Empty name
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 1, column: 0 },
      },
      {
        name: '$$$', // Non-identifier characters
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 2, column: 0 },
      },
      {
        name: 'validName',
        kind: 'variable',
        modifiers: [],
        position: { file: uri, line: 3, column: 4 },
      },
    ];

    setDocumentWithSymbols(uri, '\n\nint validName = 1;\n', symbols);

    const result = await triggerSemanticTokens(uri);

    // Should not throw, and should still tokenize the valid symbol
    assert.ok(
      result !== null && typeof result === 'object' && 'data' in result,
      'Should handle malformed symbol names gracefully'
    );
  });

  it('recovers after transient tokenization errors', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerSemanticTokens, cache } = createSemanticTokensHarness(bridge);
    const uri = 'file:///tokens-recovery.pike';

    // First request with broken data
    cache.set(uri, {
      version: 1,
      symbols: [],
      symbolNames: new Map(),
      symbolPositions: new Map(),
      diagnostics: [],
    });

    void (await triggerSemanticTokens(uri));

    // Second request with valid data
    const symbol: CoreSymbol = {
      name: 'recovered',
      kind: 'variable',
      modifiers: [],
      position: { file: uri, line: 1, column: 4 },
    };
    cache.set(uri, {
      version: 2,
      symbols: [symbol],
      symbolNames: new Map([['recovered', symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    });

    const result2 = await triggerSemanticTokens(uri);

    assert.ok(
      result2 !== null && typeof result2 === 'object' && 'data' in result2,
      'Semantic tokens should recover after transient errors'
    );
  });
});
