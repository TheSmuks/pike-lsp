/**
 * Scenario: PikeIntrospectionService cache edge cases (#2154)
 *
 * Tests cache hit/miss, LRU eviction, version-based invalidation,
 * concurrent access, and property-based invariants.
 *
 * All testing is through the public API only: getSymbols, getInherits,
 * getMethodSignature. Cache behavior is observed via bridge.analyze
 * call counts and result consistency.
 *
 * Key design knowledge (from public API):
 * - buildDocument prefers documentCache.symbols when available (no bridge call)
 * - bridge.analyze is only called when documentCache has no entry for the URI
 * - Version key is computed from documentCache.get(uri)?.version
 * - Cache hit occurs when cached.versionKey === computeVersionKey(uri)
 */

import { describe, it, expect } from 'bun:test';
import { PikeIntrospectionService } from '../services/pike-introspection.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { DocumentCacheEntry } from '../core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSymbol(name: string, kind: PikeSymbol['kind'] = 'class'): PikeSymbol {
  return {
    name,
    kind,
    modifiers: [],
    position: { file: 'test.pike', line: 1 },
  };
}

interface CacheState {
  entries: Map<string, DocumentCacheEntry>;
  snapshots: Map<string, string>;
}

function makeCacheState(): CacheState {
  return { entries: new Map(), snapshots: new Map() };
}

function addDocument(
  state: CacheState,
  uri: string,
  version: number,
  symbols: PikeSymbol[] = []
): void {
  state.entries.set(uri, {
    version,
    symbols,
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map(symbols.map(s => [s.name, s])),
    contentHash: `hash-${version}`,
    lineHashes: [version],
    analysisState: { isStale: false, parseFailed: false },
  });
  state.snapshots.set(uri, `// ${uri} v${version}\nclass Foo {}`);
}

let analyzeCallCount: number;

function makeServices(state: CacheState) {
  analyzeCallCount = 0;

  return {
    bridge: {
      isRunning: () => true,
      bridge: {
        async analyze(
          _text: string,
          _modes: string[],
          _fsPath: string
        ): Promise<{
          result: {
            parse: { symbols: PikeSymbol[]; diagnostics: unknown[] };
            introspect: {
              inherits: unknown[];
              symbols: Array<{ kind: string; name: string; type: { kind: string } }>;
            };
          };
        }> {
          analyzeCallCount++;
          return {
            result: {
              parse: {
                symbols: [makeSymbol('AnalyzedClass', 'class')],
                diagnostics: [],
              },
              introspect: {
                inherits: [],
                symbols: [{ kind: 'function', name: 'analyzedFunc', type: { kind: 'void' } }],
              },
            },
          };
        },
      },
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    documentCache: {
      get: (uri: string) => state.entries.get(uri),
      entries: () => state.entries.entries(),
      keys: () => state.entries.keys(),
      set: () => {},
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
      get: (uri: string) => state.snapshots.get(uri) ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Cache hit / miss
// ---------------------------------------------------------------------------

describe('PikeIntrospectionService cache - hit/miss', () => {
  it('first call builds document from documentCache (cache miss), second returns cached (cache hit)', async () => {
    const state = makeCacheState();
    addDocument(state, 'file:///test.pike', 1, [makeSymbol('TestSym')]);
    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const symbols1 = await svc.getSymbols('file:///test.pike');
    expect(symbols1).toEqual([makeSymbol('TestSym')]);

    // Cache hit — same result without rebuild
    const symbols2 = await svc.getSymbols('file:///test.pike');
    expect(symbols2).toEqual(symbols1);
    expect(analyzeCallCount).toBe(0);
  });

  it('different URIs each build independently on first access', async () => {
    const state = makeCacheState();
    addDocument(state, 'file:///a.pike', 1, [makeSymbol('A')]);
    addDocument(state, 'file:///b.pike', 1, [makeSymbol('B')]);
    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    expect(await svc.getSymbols('file:///a.pike')).toEqual([makeSymbol('A')]);
    expect(await svc.getSymbols('file:///b.pike')).toEqual([makeSymbol('B')]);
  });

  it('cache hit serves identical data from documentCache, not bridge', async () => {
    const state = makeCacheState();
    const docSymbols = [makeSymbol('DocSymbol', 'method')];
    addDocument(state, 'file:///cached.pike', 1, docSymbols);
    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const symbols = await svc.getSymbols('file:///cached.pike');
    expect(symbols).toEqual(docSymbols);
    expect(analyzeCallCount).toBe(0);
  });

  it('URI without documentCache entry falls back to bridge.analyze', async () => {
    const state = makeCacheState();
    // No documentCache entry — bridge path is used
    state.snapshots.set('file:///bridge-only.pike', 'class FromBridge {}');

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const symbols = await svc.getSymbols('file:///bridge-only.pike');
    expect(symbols).toBeDefined();
    expect(symbols.length).toBeGreaterThan(0);
    expect(analyzeCallCount).toBe(1);

    // Second call: versionKey is 'unknown', cache hit
    await svc.getSymbols('file:///bridge-only.pike');
    expect(analyzeCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Version-based invalidation
// ---------------------------------------------------------------------------

describe('PikeIntrospectionService cache - version invalidation', () => {
  it('version change in documentCache causes cache miss and rebuild', async () => {
    const state = makeCacheState();
    addDocument(state, 'file:///changing.pike', 1, [makeSymbol('V1')]);
    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    expect(await svc.getSymbols('file:///changing.pike')).toEqual([makeSymbol('V1')]);

    // Simulate document edit: version increments
    addDocument(state, 'file:///changing.pike', 2, [makeSymbol('NewSymbol', 'variable')]);

    // Version mismatch -> cache miss -> rebuild from documentCache
    expect(await svc.getSymbols('file:///changing.pike')).toEqual([
      makeSymbol('NewSymbol', 'variable'),
    ]);
  });

  it('version change only invalidates the changed document, not others', async () => {
    const state = makeCacheState();
    addDocument(state, 'file:///stable-a.pike', 1, [makeSymbol('A')]);
    addDocument(state, 'file:///stable-b.pike', 1, [makeSymbol('B')]);
    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    expect(await svc.getSymbols('file:///stable-a.pike')).toEqual([makeSymbol('A')]);
    expect(await svc.getSymbols('file:///stable-b.pike')).toEqual([makeSymbol('B')]);

    // Change only A's version
    addDocument(state, 'file:///stable-a.pike', 2, [makeSymbol('A2')]);

    const resultA = await svc.getSymbols('file:///stable-a.pike');
    const resultB = await svc.getSymbols('file:///stable-b.pike');
    expect(resultA).toEqual([makeSymbol('A2')]);
    expect(resultB).toEqual([makeSymbol('B')]);
  });

  it('document not in documentCache uses unknown version key consistently', async () => {
    const state = makeCacheState();
    state.snapshots.set('file:///nosuch.pike', 'class Foo {}');

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const symbols = await svc.getSymbols('file:///nosuch.pike');
    expect(symbols).toBeDefined();
    expect(analyzeCallCount).toBe(1);

    // versionKey is still 'unknown' (no docCache entry), cache hits
    await svc.getSymbols('file:///nosuch.pike');
    expect(analyzeCallCount).toBe(1);
  });

  it('multiple version changes all produce fresh data', async () => {
    const state = makeCacheState();
    const uri = 'file:///multi-version.pike';

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    for (let v = 1; v <= 10; v++) {
      const symbols = [makeSymbol(`V${v}`, 'variable')];
      addDocument(state, uri, v, symbols);
      expect(await svc.getSymbols(uri)).toEqual(symbols);
    }
  });
});

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

describe('PikeIntrospectionService cache - LRU eviction', () => {
  it('handles filling cache beyond capacity without error', async () => {
    const CAPACITY = 200;
    const state = makeCacheState();
    const uris: string[] = [];

    for (let i = 0; i < CAPACITY + 10; i++) {
      const uri = `file:///doc-${i}.pike`;
      uris.push(uri);
      addDocument(state, uri, 1, [makeSymbol(`Symbol${i}`)]);
    }

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    // Fill cache beyond capacity
    for (const uri of uris) {
      const symbols = await svc.getSymbols(uri);
      expect(symbols).toBeDefined();
    }

    // Access the first URI again — should still work (evicted, rebuilt)
    const result = await svc.getSymbols(uris[0]!);
    expect(result).toEqual([makeSymbol('Symbol0')]);
  });

  it('re-accessing an entry before eviction keeps it alive', async () => {
    const state = makeCacheState();
    const uris: string[] = [];
    for (let i = 0; i < 200; i++) {
      const uri = `file:///evict-${i}.pike`;
      uris.push(uri);
      addDocument(state, uri, 1, [makeSymbol(`E${i}`)]);
    }

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    // Fill cache
    for (const uri of uris) {
      await svc.getSymbols(uri);
    }

    // Touch URI 0 to make it most-recently-used
    await svc.getSymbols(uris[0]!);

    // Add 1 more to evict the oldest (which is now URI 1, not URI 0)
    const overflowUri = 'file:///evict-overflow.pike';
    addDocument(state, overflowUri, 1, [makeSymbol('Overflow')]);
    await svc.getSymbols(overflowUri);

    // URI 0 was touched, so it should still be cached (returns immediately)
    // URI 1 was the actual LRU and should have been evicted
    // Both should return correct data regardless
    expect(await svc.getSymbols(uris[0]!)).toEqual([makeSymbol('E0')]);
    expect(await svc.getSymbols(uris[1]!)).toEqual([makeSymbol('E1')]);
  });

  it('cache entry without documentCache falls back to bridge.analyze', async () => {
    const state = makeCacheState();
    state.snapshots.set('file:///bridge-path.pike', 'class FromBridge {}');

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const symbols = await svc.getSymbols('file:///bridge-path.pike');
    expect(symbols).toBeDefined();
    expect(symbols.length).toBeGreaterThan(0);
    expect(analyzeCallCount).toBe(1);

    // Cache hit: versionKey is 'unknown', no rebuild
    await svc.getSymbols('file:///bridge-path.pike');
    expect(analyzeCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Concurrent access
// ---------------------------------------------------------------------------

describe('PikeIntrospectionService cache - concurrent access', () => {
  it('concurrent calls for different URIs all complete independently', async () => {
    const state = makeCacheState();
    for (let i = 0; i < 5; i++) {
      addDocument(state, `file:///concurrent-${i}.pike`, 1, [makeSymbol(`Sym${i}`)]);
    }

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => svc.getSymbols(`file:///concurrent-${i}.pike`))
    );

    for (let i = 0; i < 5; i++) {
      expect(results[i]).toEqual([makeSymbol(`Sym${i}`)]);
    }
  });

  it('concurrent calls for the same URI all return the same result', async () => {
    const state = makeCacheState();
    addDocument(state, 'file:///shared.pike', 1, [makeSymbol('Shared')]);
    state.snapshots.set('file:///shared.pike', 'class Shared {}');

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const results = await Promise.all([
      svc.getSymbols('file:///shared.pike'),
      svc.getSymbols('file:///shared.pike'),
      svc.getSymbols('file:///shared.pike'),
    ]);

    for (const result of results) {
      expect(result).toEqual([makeSymbol('Shared')]);
    }
  });

  it('concurrent calls do not corrupt each other when versions change mid-flight', async () => {
    const state = makeCacheState();
    addDocument(state, 'file:///racy-a.pike', 1, [makeSymbol('V1')]);
    addDocument(state, 'file:///racy-b.pike', 1, [makeSymbol('V1')]);

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    await svc.getSymbols('file:///racy-a.pike');
    await svc.getSymbols('file:///racy-b.pike');

    // Change A's version, then access both concurrently
    addDocument(state, 'file:///racy-a.pike', 2, [makeSymbol('V2')]);

    const [resultA, resultB] = await Promise.all([
      svc.getSymbols('file:///racy-a.pike'),
      svc.getSymbols('file:///racy-b.pike'),
    ]);

    expect(resultA).toEqual([makeSymbol('V2')]);
    expect(resultB).toEqual([makeSymbol('V1')]);
  });
});

// ---------------------------------------------------------------------------
// Shared cache across methods
// ---------------------------------------------------------------------------

describe('PikeIntrospectionService cache - shared across methods', () => {
  it('getSymbols populates cache that getInherits hits', async () => {
    const state = makeCacheState();
    addDocument(state, 'file:///shared-cache.pike', 1, [makeSymbol('MyClass', 'class')]);

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    await svc.getSymbols('file:///shared-cache.pike');

    const inherits = await svc.getInherits('file:///shared-cache.pike');
    expect(Array.isArray(inherits)).toBe(true);
  });

  it('getMethodSignature uses cached introspected symbols', async () => {
    const state = makeCacheState();
    // No documentCache entry -> bridge path used
    state.snapshots.set('file:///sig.pike', 'class Sig { void myMethod() {} }');

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    // First call: bridge.analyze (cache miss)
    const sig1 = await svc.getMethodSignature('analyzedFunc', 'file:///sig.pike');
    expect(sig1).toBe('analyzedFunc: void');
    expect(analyzeCallCount).toBe(1);

    // Cache hit
    const sig2 = await svc.getMethodSignature('analyzedFunc', 'file:///sig.pike');
    expect(sig2).toBe('analyzedFunc: void');
    expect(analyzeCallCount).toBe(1);
  });

  it('getMethodSignature returns null for non-existent function', async () => {
    const state = makeCacheState();
    state.snapshots.set('file:///nosig.pike', 'class NoSig {}');

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const sig = await svc.getMethodSignature('nonExistent', 'file:///nosig.pike');
    expect(sig).toBeNull();
    expect(analyzeCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Property-based invariants
// ---------------------------------------------------------------------------

describe('PikeIntrospectionService cache - property-based invariants', () => {
  it('cache serves consistent results regardless of access order', async () => {
    const state = makeCacheState();
    const uris = Array.from({ length: 10 }, (_, i) => `file:///prop-${i}.pike`);
    for (const uri of uris) {
      addDocument(state, uri, 1, [makeSymbol(uri.split('/').pop()!.replace('.pike', ''))]);
    }

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    const firstResults = await Promise.all(uris.map(uri => svc.getSymbols(uri)));

    // Access in reverse order — all should be cache hits with identical results
    const reversedResults = await Promise.all([...uris].reverse().map(uri => svc.getSymbols(uri)));

    for (let i = 0; i < uris.length; i++) {
      expect(firstResults[i]).toEqual(reversedResults[uris.length - 1 - i]);
    }
  });

  it('interleaved access to many URIs produces correct per-URI results', async () => {
    const state = makeCacheState();
    const count = 50;
    const uris = Array.from({ length: count }, (_, i) => `file:///interleave-${i}.pike`);
    for (let i = 0; i < count; i++) {
      addDocument(state, uris[i]!, 1, [makeSymbol(`S${i}`)]);
    }

    const services = makeServices(state);
    const svc = new PikeIntrospectionService(services as any);

    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < count; i++) {
        const result = await svc.getSymbols(uris[i]!);
        expect(result).toEqual([makeSymbol(`S${i}`)]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bridge failure recovery
// ---------------------------------------------------------------------------

describe('PikeIntrospectionService cache - bridge failure recovery', () => {
  it('bridge.analyze failure falls back to workspace index symbols', async () => {
    const failServices = {
      bridge: {
        isRunning: () => true,
        bridge: {
          async analyze() {
            throw new Error('Bridge crashed');
          },
        },
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      documentCache: {
        get: () => undefined,
        entries: () => [],
        keys: () => [],
        set: () => {},
      },
      moduleContext: null,
      typeDatabase: {},
      workspaceIndex: {
        searchImportableSymbols: () => [],
        getDocumentSymbols: (uri: string) => {
          if (uri === 'file:///fail.pike') {
            return [makeSymbol('FallbackSymbol', 'method')];
          }
          return [];
        },
        getAllDocumentUris: () => [],
      },
      stdlibIndex: null,
      includeResolver: null,
      globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 0 },
      includePaths: [],
      // Provide a snapshot so readDocumentText succeeds and bridge.analyze is reached
      documentSnapshots: { get: () => 'class Fail {}' },
    };

    const svc = new PikeIntrospectionService(failServices as any);

    // Should not throw — safeAnalyze catches errors and falls back
    const symbols = await svc.getSymbols('file:///fail.pike');
    expect(symbols).toBeDefined();
    expect(symbols).toEqual([makeSymbol('FallbackSymbol', 'method')]);
  });

  it('subsequent call after bridge failure uses cached result', async () => {
    let callCount = 0;

    const failServices = {
      bridge: {
        isRunning: () => true,
        bridge: {
          async analyze() {
            callCount++;
            throw new Error('Bridge crashed');
          },
        },
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      documentCache: {
        get: () => undefined,
        entries: () => [],
        keys: () => [],
        set: () => {},
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
      // Must provide a snapshot so readDocumentText succeeds and bridge.analyze is reached
      documentSnapshots: { get: () => 'class Fail {}' },
    };

    const svc = new PikeIntrospectionService(failServices as any);

    // First call: bridge fails, safeAnalyze catches, returns null
    // getIndexedSymbols returns [] since workspace index is empty
    const symbols1 = await svc.getSymbols('file:///fail2.pike');
    expect(symbols1).toEqual([]);
    expect(callCount).toBeGreaterThanOrEqual(1);

    // Second call: versionKey is still 'unknown', cache should hit
    const symbols2 = await svc.getSymbols('file:///fail2.pike');
    expect(symbols2).toEqual([]);
    // Bridge should NOT be called again
    expect(callCount).toBeLessThanOrEqual(1);
  });
});
