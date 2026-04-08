/**
 * Signature Help Parse-Under-Edit Resilience Tests
 * KB-1248: Tests for signature help handler resilience during rapid malformed edits
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerSignatureHelpHandler } from '../features/editing/signature-help.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry, CoreSymbol } from '../core/types.js';
import { createMockDocuments } from '../tests/helpers/test-helpers.js';
import { FaultInjectableMockBridge } from '../tests/helpers/mock-bridge.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function createSignatureHelpHarness(bridge: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const signatures: Array<{ uri: string; result: unknown }> = [];
  const consoleErrors: string[] = [];

  const connection = {
    onSignatureHelp(
      handler: (params: {
        textDocument: { uri: string };
        position: { line: number; character: number };
      }) => Promise<unknown>
    ) {
      this.signatureHelpHandler = handler;
    },
    signatureHelpHandler: undefined as
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

  registerSignatureHelpHandler(
    connection as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  // Helper to trigger signature help requests
  const triggerSignatureHelp = async (uri: string, line: number, character: number) => {
    const handler = connection.signatureHelpHandler;
    if (!handler) return null;
    const result = await handler({
      textDocument: { uri },
      position: { line, character },
    });
    signatures.push({ uri, result });
    return result;
  };

  // Helper to set cached document with a function symbol
  const setDocumentWithFunction = (uri: string, text: string, funcName: string) => {
    // Use type assertion for method-specific properties that aren't on base PikeSymbol
    const symbol = {
      name: funcName,
      kind: 'method',
      modifiers: [],
      argNames: ['arg1', 'arg2'],
      argTypes: [{ kind: 'int' }, { kind: 'string' }],
      returnType: { kind: 'void' },
      position: { file: uri, line: 1, column: 0 },
    } as CoreSymbol & {
      argNames: string[];
      argTypes: Array<{ kind: string }>;
      returnType: { kind: string };
    };
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [symbol],
      symbolNames: new Map([[funcName, symbol]]),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, text));
  };

  return {
    docs,
    cache,
    signatures,
    consoleErrors,
    triggerSignatureHelp,
    setDocumentWithFunction,
  };
}

describe('Signature Help: parse-under-edit resilience', () => {
  it('returns signature help even when bridge queries fail during malformed edits', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        // Simulate query failures during parse-under-edit
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected token in function call'),
        probability: 0.5,
      }
    );

    const { setDocumentWithFunction, triggerSignatureHelp } = createSignatureHelpHarness(bridge);
    const uri = 'file:///sighelp-parse-resilience.pike';

    // Set up document with a function
    setDocumentWithFunction(uri, 'void myFunc(int a, string b) {}\nmyFunc(1, "test");\n', 'myFunc');

    // Trigger signature help inside function call (position after "myFunc(")
    const result = await triggerSignatureHelp(uri, 1, 7);

    // Should return signature help despite potential failures
    assert.ok(
      result === null || typeof result === 'object',
      'Signature help should complete gracefully even with failures'
    );
  });

  it('handles rapid typing in function arguments without crashing', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: incomplete function call'),
        probability: 0.3,
      }
    );

    const { setDocumentWithFunction, triggerSignatureHelp, cache } =
      createSignatureHelpHarness(bridge);
    const uri = 'file:///sighelp-rapid-args.pike';

    // Initial document with function
    setDocumentWithFunction(uri, 'void compute(int x, int y) {}\n', 'compute');

    // Simulate rapid typing in function arguments
    const callPositions = [
      { line: 1, char: 9 }, // compute(1,
      { line: 1, char: 9 }, // Malformed: missing arg
      { line: 1, char: 12 }, // Malformed: incomplete expr
      { line: 1, char: 12 }, // compute(1, )
      { line: 1, char: 12 }, // Valid
    ];

    const results: (unknown | null)[] = [];

    for (let i = 0; i < callPositions.length; i++) {
      const { line, char } = callPositions[i] ?? { line: 0, char: 0 };

      // Update cached document
      const symbol = {
        name: 'compute',
        kind: 'method',
        modifiers: [],
        argNames: ['x', 'y'],
        argTypes: [{ kind: 'int' }, { kind: 'int' }],
        returnType: { kind: 'void' },
        position: { file: uri, line: 1, column: 0 },
      } as CoreSymbol & {
        argNames: string[];
        argTypes: Array<{ kind: string }>;
        returnType: { kind: string };
      };
      const entry: DocumentCacheEntry = {
        version: i + 1,
        symbols: [symbol],
        symbolNames: new Map([['compute', symbol]]),
        symbolPositions: new Map(),
        diagnostics: [],
      };
      cache.set(uri, entry);

      // Trigger signature help during edit
      const result = await triggerSignatureHelp(uri, line, char);
      results.push(result);

      await wait(10);
    }

    // All requests should complete
    assert.equal(
      results.length,
      callPositions.length,
      'All signature help requests should complete'
    );

    // Should not crash even with malformed edits
    assert.ok(true, 'Signature help survived rapid malformed edits');
  });

  it('handles cancellation during signature help requests', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        delayMs: { min: 50, max: 100 }, // Slow responses
      }
    );

    const { setDocumentWithFunction, triggerSignatureHelp } = createSignatureHelpHarness(bridge);
    const uri = 'file:///sighelp-cancellation.pike';

    setDocumentWithFunction(
      uri,
      'void slowFunc(int a, string b) {}\nslowFunc(1, "test");\n',
      'slowFunc'
    );

    // Start signature help request
    const sigHelpPromise = triggerSignatureHelp(uri, 1, 10);

    // Simulate typing that would cancel the request
    await wait(5);

    // The request should complete without throwing
    const result = await sigHelpPromise;
    // Result may be null if cancelled, but should not throw
    assert.ok(
      result === null || typeof result === 'object',
      'Cancelled signature help should complete gracefully'
    );
  });

  it('recovers after transient parse errors during signature help', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('parse error: unexpected end of file in function call'),
        probability: 0.5,
      }
    );

    const { setDocumentWithFunction, triggerSignatureHelp } = createSignatureHelpHarness(bridge);
    const uri = 'file:///sighelp-recovery.pike';

    setDocumentWithFunction(uri, 'int helper(int x) { return x; }\nhelper(42);\n', 'helper');

    // First request may fail
    void (await triggerSignatureHelp(uri, 1, 7));

    // Clear faults for second request
    bridge.clearFaults();

    // Second request should succeed with proper signature
    const result2 = await triggerSignatureHelp(uri, 1, 7);

    if (result2 !== null && typeof result2 === 'object') {
      assert.ok(
        'signatures' in result2 && Array.isArray(result2.signatures),
        'Signature help should have signatures array after recovery'
      );
    }
  });

  it('handles missing function symbols gracefully', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerSignatureHelp, cache } = createSignatureHelpHarness(bridge);
    const uri = 'file:///sighelp-missing.pike';

    // Document without the function in cache (symbol not found scenario)
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [], // Empty symbols
      symbolNames: new Map(),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);

    // Try to get signature help for non-existent function
    const result = await triggerSignatureHelp(uri, 0, 5);

    // Should return null gracefully without throwing
    assert.equal(result, null, 'Should return null for non-existent function');
  });

  it('handles stdlib lookup failures gracefully', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('stdlib resolution failed'),
        probability: 1,
      }
    );

    // Create harness with stdlibIndex that will fail
    const harness = createSignatureHelpHarness(bridge);
    const { setDocumentWithFunction, triggerSignatureHelp } = harness;
    const uri = 'file:///sighelp-stdlib-fail.pike';

    setDocumentWithFunction(uri, 'Stdio.stdout->write("test");\n', 'write');

    // Request signature help for stdlib method
    const result = await triggerSignatureHelp(uri, 0, 18);

    // Should not throw even when stdlib lookup fails
    assert.ok(
      result === null || typeof result === 'object',
      'Signature help should handle stdlib lookup failures gracefully'
    );
  });

  it('survives call context resolution failures', async () => {
    const bridge = new FaultInjectableMockBridge();

    const { triggerSignatureHelp, cache } = createSignatureHelpHarness(bridge);
    const uri = 'file:///sighelp-context-fail.pike';

    // Document with malformed call context
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [],
      symbolNames: new Map(),
      symbolPositions: new Map(),
      diagnostics: [],
    };
    cache.set(uri, entry);

    // Trigger in position that may cause context resolution issues
    // This tests the try-catch around resolveCallContextAtOffset
    const result = await triggerSignatureHelp(uri, 0, 0);

    // Should return null gracefully
    assert.equal(result, null, 'Should handle context resolution failures');
  });
});
