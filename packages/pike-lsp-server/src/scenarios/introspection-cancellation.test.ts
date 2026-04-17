/**
 * Cancellation and timeout support for PikeIntrospectionService.
 *
 * Validates that CancellationToken is respected at every checkpoint
 * and that bridge.analyze() times out after ANALYZE_TIMEOUT_MS.
 */
import { describe, it, expect } from 'bun:test';
import {
  CancellationTokenSource,
  LSPErrorCodes,
  ResponseError,
} from 'vscode-languageserver/node.js';
import { PikeIntrospectionService } from '../services/pike-introspection.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noopLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function makeServices(bridgeOverride?: any) {
  return {
    bridge: bridgeOverride ?? null,
    logger: noopLogger(),
    documentCache: {
      get() {
        return undefined;
      },
      entries() {
        return [];
      },
    },
    moduleContext: null,
    typeDatabase: {},
    workspaceIndex: {
      searchImportableSymbols: () => [],
      getDocumentSymbols: () => [],
      getAllDocumentUris: () => [],
    },
    stdlibIndex: null,
    includeResolver: null,
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 0 },
    includePaths: [],
    documentSnapshots: {
      get(_uri: string) {
        return 'class Foo {}';
      },
    },
  };
}

function createMockBridge(analyzeResponse: () => Promise<any>) {
  return {
    isRunning: () => true,
    bridge: { analyze: analyzeResponse },
  };
}

/** Create a service that will call bridge.analyze() (cache miss path). */
function createService(bridgeOverride: ReturnType<typeof createMockBridge>) {
  const services = makeServices(bridgeOverride) as any;
  return new PikeIntrospectionService(services);
}

describe('PikeIntrospectionService cancellation', () => {
  it('throws ResponseError when token is already cancelled before getSymbols', async () => {
    const service = createService(
      createMockBridge(async () => ({
        result: { parse: { symbols: [] }, introspect: { inherits: [], symbols: [] } },
      }))
    );
    const cts = new CancellationTokenSource();
    cts.cancel();

    await expect(service.getSymbols('file:///test.pike', cts.token)).rejects.toThrow();
    try {
      await service.getSymbols('file:///test.pike', cts.token);
    } catch (err) {
      expect(err).toBeInstanceOf(ResponseError);
      expect((err as ResponseError).code).toBe(LSPErrorCodes.RequestCancelled);
    }
  });

  it('throws ResponseError when token is already cancelled before getInherits', async () => {
    const service = createService(
      createMockBridge(async () => ({
        result: { parse: { symbols: [] }, introspect: { inherits: [], symbols: [] } },
      }))
    );
    const cts = new CancellationTokenSource();
    cts.cancel();

    await expect(service.getInherits('file:///test.pike', cts.token)).rejects.toThrow();
    try {
      await service.getInherits('file:///test.pike', cts.token);
    } catch (err) {
      expect(err).toBeInstanceOf(ResponseError);
      expect((err as ResponseError).code).toBe(LSPErrorCodes.RequestCancelled);
    }
  });

  it('returns normally when no CancellationToken is provided', async () => {
    const service = createService(
      createMockBridge(async () => ({
        result: {
          parse: { symbols: [{ name: 'Foo', kind: 'class', position: { line: 1, character: 0 } }] },
          introspect: { inherits: [], symbols: [] },
        },
      }))
    );

    const symbols = await service.getSymbols('file:///test.pike');
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.name).toBe('Foo');
  });

  it('respects cancellation during slow bridge.analyze', async () => {
    // Simulate a slow bridge.analyze that never resolves on its own
    let resolveAnalyze: (v: any) => void;
    const analyzePromise = new Promise<any>(resolve => {
      resolveAnalyze = resolve;
    });

    const service = createService(createMockBridge(async () => analyzePromise));
    const cts = new CancellationTokenSource();

    const resultPromise = service.getSymbols('file:///test.pike', cts.token);

    // Cancel after a small delay
    setTimeout(() => cts.cancel(), 5);

    await expect(resultPromise).rejects.toThrow();
    try {
      await resultPromise;
    } catch (err) {
      expect(err).toBeInstanceOf(ResponseError);
      expect((err as ResponseError).code).toBe(LSPErrorCodes.RequestCancelled);
    }

    // Cleanup the hanging promise so the process can exit
    resolveAnalyze!({
      result: { parse: { symbols: [] }, introspect: { inherits: [], symbols: [] } },
    });
  });

  it('getMethodSignature respects cancellation', async () => {
    const service = createService(
      createMockBridge(async () => ({
        result: { parse: { symbols: [] }, introspect: { inherits: [], symbols: [] } },
      }))
    );
    const cts = new CancellationTokenSource();
    cts.cancel();

    await expect(
      service.getMethodSignature('foo', 'file:///test.pike', cts.token)
    ).rejects.toThrow();
  });

  it('searchImportableSymbols respects cancellation', async () => {
    const services = makeServices(
      createMockBridge(async () => ({
        result: { parse: { symbols: [] }, introspect: { inherits: [], symbols: [] } },
      }))
    );

    const service = new PikeIntrospectionService(services as any);
    const cts = new CancellationTokenSource();
    cts.cancel();

    await expect(service.searchImportableSymbols('Foo', {}, cts.token)).rejects.toThrow();
  });

  it('backward compatibility: all methods work without CancellationToken', async () => {
    const service = createService(
      createMockBridge(async () => ({
        result: {
          parse: { symbols: [{ name: 'Foo', kind: 'class', position: { line: 1, character: 0 } }] },
          introspect: {
            inherits: [],
            symbols: [{ kind: 'function', name: 'bar', type: { kind: 'void' } }],
          },
        },
      }))
    );

    const symbols = await service.getSymbols('file:///test.pike');
    expect(symbols.length).toBeGreaterThanOrEqual(0);

    const inherits = await service.getInherits('file:///test.pike');
    expect(Array.isArray(inherits)).toBe(true);

    const sig = await service.getMethodSignature('bar', 'file:///test.pike');
    // bar exists in the introspected symbols
    expect(sig).toBe('bar: void');
  });

  it('timeout fires when bridge.analyze never resolves', async () => {
    // Create a bridge.analyze that never resolves
    const service = createService(createMockBridge(async () => new Promise(() => {})));

    // Override timeout to 50ms for fast test
    const original = (PikeIntrospectionService as any).ANALYZE_TIMEOUT_MS;
    (PikeIntrospectionService as any).ANALYZE_TIMEOUT_MS = 50;

    try {
      // safeAnalyze catches timeout errors internally (non-cancellation), returns null
      // so getSymbols should return [] (from getIndexedSymbols fallback)
      const symbols = await service.getSymbols('file:///test.pike');
      expect(symbols).toEqual([]);
    } finally {
      (PikeIntrospectionService as any).ANALYZE_TIMEOUT_MS = original;
    }
  });
});
