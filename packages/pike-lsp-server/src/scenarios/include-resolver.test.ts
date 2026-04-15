/**
 * Unit tests for IncludeResolver resolveAndCache shared logic (#1970)
 *
 * Exercises resolveDependencies() which internally calls the private
 * resolveAndCache() method. Covers: bridge unavailable, path doesn't exist,
 * cache miss with successful parse, cache hit, parse failure, resolve failure,
 * invalidate/clear/getStats, and workspace import resolution.
 */

import { describe, it, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { IncludeResolver } from '../services/include-resolver.js';
import type { BridgeManager } from '../services/bridge-manager.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';

// ---------------------------------------------------------------------------
// Noop logger — use real Logger instance to satisfy private field
// ---------------------------------------------------------------------------

function noopLogger(): Logger {
  return new Logger('test');
}

// ---------------------------------------------------------------------------
// Mock bridge factory
// ---------------------------------------------------------------------------

interface MockResolveIncludeResult {
  path: string;
  exists: boolean;
  originalPath: string;
}

interface TrackCounts {
  resolveInclude: number;
  parseFileSymbols: number;
  resolveStdlib: number;
}

function createIncludeResolverBridge(overrides?: {
  resolveIncludeResult?: MockResolveIncludeResult | ((path: string) => MockResolveIncludeResult);
  parseFileSymbolsResult?: PikeSymbol[];
  resolveStdlibResult?: { found: number };
  resolveIncludeError?: Error;
  parseFileSymbolsError?: Error;
}) {
  const counts: TrackCounts = { resolveInclude: 0, parseFileSymbols: 0, resolveStdlib: 0 };

  // IncludeResolver accesses this.bridge.bridge.resolveInclude() and
  // this.bridge.bridge.resolveStdlib() (the inner PikeBridge), plus
  // this.bridge.parseFileSymbols() (BridgeManager method).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const innerBridge: any = {
    async resolveInclude(path: string, _currentUri: string) {
      counts.resolveInclude++;
      if (overrides?.resolveIncludeError) throw overrides.resolveIncludeError;
      if (typeof overrides?.resolveIncludeResult === 'function') {
        return overrides.resolveIncludeResult(path);
      }
      return overrides?.resolveIncludeResult ?? { path, exists: true, originalPath: path };
    },
    async resolveStdlib(_modulePath: string) {
      counts.resolveStdlib++;
      return overrides?.resolveStdlibResult ?? { found: 0 };
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bridgeManager: any = {
    bridge: innerBridge,
    async parseFileSymbols(_filePath: string) {
      counts.parseFileSymbols++;
      if (overrides?.parseFileSymbolsError) throw overrides.parseFileSymbolsError;
      return overrides?.parseFileSymbolsResult ?? [];
    },
  };

  return { bridgeManager: bridgeManager as BridgeManager, counts };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIncludeSymbol(classname: string): PikeSymbol {
  return {
    kind: 'include',
    name: 'include',
    classname,
    line: 1,
    column: 1,
    modifiers: [],
  } as unknown as PikeSymbol;
}

function makeImportSymbol(classname: string): PikeSymbol {
  return {
    kind: 'import',
    name: 'import',
    classname,
    line: 1,
    column: 1,
    modifiers: [],
  } as unknown as PikeSymbol;
}

const SAMPLE_SYMBOLS: PikeSymbol[] = [
  { kind: 'function', name: 'helper', line: 10, column: 1, modifiers: [] } as unknown as PikeSymbol,
  { kind: 'variable', name: 'x', line: 20, column: 1, modifiers: [] } as unknown as PikeSymbol,
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IncludeResolver resolveAndCache shared logic', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = noopLogger();
  });

  describe('bridge unavailable', () => {
    it('returns empty dependencies when bridge is null', async () => {
      const resolver = new IncludeResolver(null, logger);
      const symbols = [makeIncludeSymbol('utils.pike')];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.includes.length, 0);
      assert.strictEqual(result.imports.length, 0);
    });
  });

  describe('resolveInclude returns not exists', () => {
    it('excludes include from results when path does not exist', async () => {
      const { bridgeManager } = createIncludeResolverBridge({
        resolveIncludeResult: { path: '/absent.pike', exists: false, originalPath: 'absent.pike' },
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = [makeIncludeSymbol('absent.pike')];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.includes.length, 0);
    });

    it('excludes include when resolveInclude returns empty path', async () => {
      const { bridgeManager } = createIncludeResolverBridge({
        resolveIncludeResult: { path: '', exists: true, originalPath: 'empty.pike' },
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = [makeIncludeSymbol('empty.pike')];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.includes.length, 0);
    });
  });

  describe('cache miss with successful parse', () => {
    it('populates includePathIndex and returns symbols on cache miss', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeResult: { path: '/src/utils.pike', exists: true, originalPath: 'utils.pike' },
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = [makeIncludeSymbol('utils.pike')];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.includes.length, 1);
      assert.strictEqual(result.includes[0]!.originalPath, 'utils.pike');
      assert.strictEqual(result.includes[0]!.resolvedPath, '/src/utils.pike');
      assert.strictEqual(result.includes[0]!.symbols.length, 2);
      assert.strictEqual(result.includes[0]!.symbols[0]!.name, 'helper');
      assert.strictEqual(counts.parseFileSymbols, 1, 'should call parseFileSymbols on cache miss');
      assert.strictEqual(counts.resolveInclude, 1);

      // Cache should be populated
      const stats = resolver.getStats();
      assert.strictEqual(stats.cachedIncludes, 1);
      assert.strictEqual(stats.totalSymbols, 2);
    });
  });

  describe('cache hit', () => {
    it('returns cached result on second call without calling parseFileSymbols', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeResult: { path: '/src/utils.pike', exists: true, originalPath: 'utils.pike' },
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);

      // First call — cache miss
      const result1 = await resolver.resolveDependencies('file:///test.pike', [
        makeIncludeSymbol('utils.pike'),
      ]);
      assert.strictEqual(result1.includes.length, 1);
      assert.strictEqual(counts.parseFileSymbols, 1);

      // Second call — same path resolved again
      const result2 = await resolver.resolveDependencies('file:///test.pike', [
        makeIncludeSymbol('utils.pike'),
      ]);
      assert.strictEqual(result2.includes.length, 1);
      assert.strictEqual(result2.includes[0]!.resolvedPath, '/src/utils.pike');
      assert.strictEqual(
        counts.parseFileSymbols,
        1,
        'should not call parseFileSymbols again on cache hit'
      );
      // resolveInclude is still called (it resolves the path each time)
      assert.strictEqual(counts.resolveInclude, 2);
    });

    it('returns cached symbols even after multiple resolves', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeResult: { path: '/src/utils.pike', exists: true, originalPath: 'utils.pike' },
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);

      for (let i = 0; i < 5; i++) {
        const result = await resolver.resolveDependencies('file:///test.pike', [
          makeIncludeSymbol('utils.pike'),
        ]);
        assert.strictEqual(result.includes[0]!.symbols.length, 2);
      }

      assert.strictEqual(
        counts.parseFileSymbols,
        1,
        'should call parseFileSymbols only once across 5 calls'
      );
    });
  });

  describe('parse failure', () => {
    it('returns null when parseFileSymbols throws, include excluded from results', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeResult: {
          path: '/src/corrupt.pike',
          exists: true,
          originalPath: 'corrupt.pike',
        },
        parseFileSymbolsError: new Error('parse failed'),
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = [makeIncludeSymbol('corrupt.pike')];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.includes.length, 0);
      assert.strictEqual(counts.parseFileSymbols, 1);
    });
  });

  describe('resolve failure', () => {
    it('returns null when resolveInclude throws, include excluded from results', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeError: new Error('bridge timeout'),
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = [makeIncludeSymbol('missing.pike')];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.includes.length, 0);
      assert.strictEqual(counts.resolveInclude, 1);
      assert.strictEqual(
        counts.parseFileSymbols,
        0,
        'should not call parseFileSymbols if resolve fails'
      );
    });
  });

  describe('invalidate and clear', () => {
    it('invalidate removes specific cache entry so next call re-fetches', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeResult: { path: '/src/utils.pike', exists: true, originalPath: 'utils.pike' },
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);

      // Populate cache
      await resolver.resolveDependencies('file:///test.pike', [makeIncludeSymbol('utils.pike')]);
      assert.strictEqual(counts.parseFileSymbols, 1);
      assert.strictEqual(resolver.getStats().cachedIncludes, 1);

      // Invalidate
      resolver.invalidate('/src/utils.pike');
      assert.strictEqual(resolver.getStats().cachedIncludes, 0);

      // Next call should re-fetch
      await resolver.resolveDependencies('file:///test.pike', [makeIncludeSymbol('utils.pike')]);
      assert.strictEqual(
        counts.parseFileSymbols,
        2,
        'should call parseFileSymbols again after invalidate'
      );
    });

    it('clear removes all cache entries', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeResult: (path: string) => ({
          path: `/src/${path}`,
          exists: true,
          originalPath: path,
        }),
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);

      // Populate cache with two different includes
      await resolver.resolveDependencies('file:///test.pike', [
        makeIncludeSymbol('a.pike'),
        makeIncludeSymbol('b.pike'),
      ]);
      assert.strictEqual(resolver.getStats().cachedIncludes, 2);
      assert.strictEqual(counts.parseFileSymbols, 2);

      // Clear all
      resolver.clear();
      assert.strictEqual(resolver.getStats().cachedIncludes, 0);

      // Both should re-fetch
      await resolver.resolveDependencies('file:///test.pike', [
        makeIncludeSymbol('a.pike'),
        makeIncludeSymbol('b.pike'),
      ]);
      assert.strictEqual(
        counts.parseFileSymbols,
        4,
        'should call parseFileSymbols again after clear'
      );
    });
  });

  describe('getStats', () => {
    it('returns correct cachedIncludes and totalSymbols', async () => {
      const { bridgeManager } = createIncludeResolverBridge({
        resolveIncludeResult: { path: '/src/utils.pike', exists: true, originalPath: 'utils.pike' },
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);

      assert.deepStrictEqual(resolver.getStats(), { cachedIncludes: 0, totalSymbols: 0 });

      await resolver.resolveDependencies('file:///test.pike', [makeIncludeSymbol('utils.pike')]);

      assert.deepStrictEqual(resolver.getStats(), { cachedIncludes: 1, totalSymbols: 2 });
    });
  });

  describe('workspace imports', () => {
    it('resolves non-stdlib workspace import with symbols', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeResult: {
          path: '/src/my_module.pike',
          exists: true,
          originalPath: 'my_module',
        },
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
        resolveStdlibResult: { found: 0 },
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = [makeImportSymbol('my_module')];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.imports.length, 1);
      assert.strictEqual(result.imports[0]!.modulePath, 'my_module');
      assert.strictEqual(result.imports[0]!.isStdlib, false);
      assert.strictEqual(result.imports[0]!.resolvedPath, '/src/my_module.pike');
      assert.strictEqual(result.imports[0]!.symbols?.length, 2);
      assert.strictEqual(counts.resolveStdlib, 1, 'should check stdlib status');
      assert.strictEqual(counts.resolveInclude, 1, 'should resolve workspace import path');
      assert.strictEqual(counts.parseFileSymbols, 1, 'should parse workspace import file');
    });

    it('marks stdlib imports without resolving workspace path', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveStdlibResult: { found: 1 },
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = [makeImportSymbol('Stdio')];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.imports.length, 1);
      assert.strictEqual(result.imports[0]!.modulePath, 'Stdio');
      assert.strictEqual(result.imports[0]!.isStdlib, true);
      assert.strictEqual(result.imports[0]!.resolvedPath, undefined);
      assert.strictEqual(counts.resolveStdlib, 1);
      assert.strictEqual(
        counts.resolveInclude,
        0,
        'should not resolve stdlib imports via workspace'
      );
      assert.strictEqual(counts.parseFileSymbols, 0, 'should not parse stdlib imports');
    });
  });

  describe('multiple includes', () => {
    it('resolves multiple includes in parallel', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge({
        resolveIncludeResult: (path: string) => ({
          path: `/src/${path}`,
          exists: true,
          originalPath: path,
        }),
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = [
        makeIncludeSymbol('a.pike'),
        makeIncludeSymbol('b.pike'),
        makeIncludeSymbol('c.pike'),
      ];
      const result = await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.strictEqual(result.includes.length, 3);
      assert.strictEqual(result.includes[0]!.originalPath, 'a.pike');
      assert.strictEqual(result.includes[1]!.originalPath, 'b.pike');
      assert.strictEqual(result.includes[2]!.originalPath, 'c.pike');
      assert.strictEqual(counts.resolveInclude, 3);
      assert.strictEqual(counts.parseFileSymbols, 3);
      assert.strictEqual(resolver.getStats().cachedIncludes, 3);
      assert.strictEqual(resolver.getStats().totalSymbols, 6);
    });
  });

  describe('normalizeFilePath', () => {
    it('strips file:// prefix and decodes URI components', async () => {
      const { bridgeManager } = createIncludeResolverBridge({
        resolveIncludeResult: {
          path: 'file:///src/path%20with%20spaces/utils.pike',
          exists: true,
          originalPath: 'utils.pike',
        },
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const result = await resolver.resolveDependencies('file:///test.pike', [
        makeIncludeSymbol('utils.pike'),
      ]);

      assert.strictEqual(result.includes[0]!.resolvedPath, '/src/path with spaces/utils.pike');
    });
  });

  describe('empty symbols', () => {
    it('returns empty dependencies when no include or import symbols', async () => {
      const { bridgeManager, counts } = createIncludeResolverBridge();
      const resolver = new IncludeResolver(bridgeManager, logger);
      const result = await resolver.resolveDependencies('file:///test.pike', []);

      assert.strictEqual(result.includes.length, 0);
      assert.strictEqual(result.imports.length, 0);
      assert.strictEqual(counts.resolveInclude, 0);
      assert.strictEqual(counts.parseFileSymbols, 0);
    });
  });

  describe('getDependencySymbols', () => {
    it('collects all symbols from resolved includes', async () => {
      const { bridgeManager } = createIncludeResolverBridge({
        resolveIncludeResult: { path: '/src/utils.pike', exists: true, originalPath: 'utils.pike' },
        parseFileSymbolsResult: SAMPLE_SYMBOLS,
      });
      const resolver = new IncludeResolver(bridgeManager, logger);
      const deps = await resolver.resolveDependencies('file:///test.pike', [
        makeIncludeSymbol('utils.pike'),
      ]);

      const depSymbols = await resolver.getDependencySymbols(deps);
      assert.strictEqual(depSymbols.length, 2);
      assert.strictEqual(depSymbols[0]!.name, 'helper');
      assert.strictEqual(depSymbols[1]!.name, 'x');
    });
  });
});
