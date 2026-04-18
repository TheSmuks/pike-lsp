/**
 * Scenario: stdlib queue + cache for isStdlibModule calls (Issue #2152)
 *
 * Verifies that the semaphore-limited concurrency and LRU cache in
 * IncludeResolver.isStdlibModule() correctly:
 * - Limit concurrent bridge.resolveStdlib() calls
 * - Cache results to avoid redundant bridge calls
 * - Evict least-recently-used entries when the cache is full
 * - Release semaphore slots on error
 * - Clear cache on resolver.clear()
 * - Track hit/miss statistics
 */

import { describe, it, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { IncludeResolver } from '../services/include-resolver.js';
import type { BridgeManager } from '../services/bridge-manager.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';
import { MAX_CONCURRENT_STDLIB_REQUESTS, MAX_STDLIB_CACHE_SIZE } from '../constants/index.js';

function noopLogger(): Logger {
  return new Logger('test');
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

function createBridge(overrides?: {
  resolveStdlib?: (modulePath: string) => Promise<{ found: number }>;
  resolveIncludeResult?: { path: string; exists: boolean; originalPath: string };
}) {
  let callCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const innerBridge: any = {
    async resolveStdlib(modulePath: string) {
      callCount++;
      if (overrides?.resolveStdlib) {
        return overrides.resolveStdlib(modulePath);
      }
      return { found: 1 };
    },
    async resolveInclude(_path: string, _uri: string) {
      return overrides?.resolveIncludeResult ?? { path: _path, exists: false, originalPath: _path };
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bridgeManager: any = {
    bridge: innerBridge,
    async parseFileSymbols() {
      return [];
    },
  };

  return { bridgeManager: bridgeManager as BridgeManager, getCallCount: () => callCount };
}

describe('stdlib-queue-cache', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = noopLogger();
  });

  describe('concurrency limiting', () => {
    it('should limit concurrent stdlib requests to MAX_CONCURRENT_STDLIB_REQUESTS', async () => {
      let maxConcurrent = 0;
      let currentActive = 0;

      const { bridgeManager } = createBridge({
        resolveStdlib: async () => {
          currentActive++;
          maxConcurrent = Math.max(maxConcurrent, currentActive);
          await new Promise(r => setTimeout(r, 10));
          currentActive--;
          return { found: 1 };
        },
      });

      const resolver = new IncludeResolver(bridgeManager, logger);
      const symbols = Array.from({ length: 10 }, (_, i) => makeImportSymbol(`Module${i}`));

      await resolver.resolveDependencies('file:///test.pike', symbols);

      assert.ok(
        maxConcurrent <= MAX_CONCURRENT_STDLIB_REQUESTS,
        `max concurrent ${maxConcurrent} should not exceed ${MAX_CONCURRENT_STDLIB_REQUESTS}`
      );
    });
  });

  describe('cache hit', () => {
    it('should cache stdlib resolution results across resolveDependencies calls', async () => {
      const { bridgeManager, getCallCount } = createBridge({
        resolveStdlib: async () => ({ found: 1 }),
      });

      const resolver = new IncludeResolver(bridgeManager, logger);

      // First call - cache miss
      await resolver.resolveDependencies('file:///test.pike', [makeImportSymbol('Stdio')]);
      assert.strictEqual(getCallCount(), 1, 'should call bridge on first request');

      // Second call - cache hit
      await resolver.resolveDependencies('file:///test2.pike', [makeImportSymbol('Stdio')]);
      assert.strictEqual(getCallCount(), 1, 'should use cache on second request');

      const stats = resolver.getStats();
      assert.ok(stats.stdlibCacheHits > 0, 'should have cache hits');
    });
  });

  describe('cache eviction', () => {
    it('should respect cache size limit via LRU eviction', async () => {
      const { bridgeManager } = createBridge({
        resolveStdlib: async () => ({ found: 1 }),
      });

      const resolver = new IncludeResolver(bridgeManager, logger);

      // Resolve more unique modules than the cache can hold
      for (let i = 0; i < MAX_STDLIB_CACHE_SIZE + 10; i++) {
        await resolver.resolveDependencies(`file:///test${i}.pike`, [
          makeImportSymbol(`Module${i}`),
        ]);
      }

      const stats = resolver.getStats();
      assert.ok(
        stats.stdlibCacheSize <= MAX_STDLIB_CACHE_SIZE,
        `cache size ${stats.stdlibCacheSize} should not exceed ${MAX_STDLIB_CACHE_SIZE}`
      );
    });
  });

  describe('error handling', () => {
    it('should release semaphore slot on error and continue processing', async () => {
      let callIndex = 0;

      const { bridgeManager } = createBridge({
        resolveStdlib: async (modulePath: string) => {
          callIndex++;
          if (modulePath === 'Failing') {
            throw new Error('bridge error');
          }
          return { found: 1 };
        },
      });

      const resolver = new IncludeResolver(bridgeManager, logger);

      // First call encounters error
      const result1 = await resolver.resolveDependencies('file:///test.pike', [
        makeImportSymbol('Failing'),
      ]);
      assert.strictEqual(result1.imports.length, 1);
      assert.strictEqual(result1.imports[0]!.isStdlib, false);

      // Second call should succeed (slot was released)
      const result2 = await resolver.resolveDependencies('file:///test2.pike', [
        makeImportSymbol('Working'),
      ]);
      assert.strictEqual(result2.imports.length, 1);
      assert.strictEqual(result2.imports[0]!.isStdlib, true);
    });
  });

  describe('cache clear', () => {
    it('should clear stdlib cache when clear() is called', async () => {
      const { bridgeManager, getCallCount } = createBridge({
        resolveStdlib: async () => ({ found: 1 }),
      });

      const resolver = new IncludeResolver(bridgeManager, logger);

      // First call - cache miss
      await resolver.resolveDependencies('file:///test.pike', [makeImportSymbol('Stdio')]);
      assert.strictEqual(getCallCount(), 1);

      // Clear cache
      resolver.clear();

      // Second call - cache miss again
      await resolver.resolveDependencies('file:///test2.pike', [makeImportSymbol('Stdio')]);
      assert.strictEqual(getCallCount(), 2, 'should call bridge again after clear');
    });
  });

  describe('stats tracking', () => {
    it('should track cache hits and misses in getStats()', async () => {
      const { bridgeManager } = createBridge({
        resolveStdlib: async () => ({ found: 1 }),
      });

      const resolver = new IncludeResolver(bridgeManager, logger);

      // First call - cache miss
      await resolver.resolveDependencies('file:///test.pike', [makeImportSymbol('Stdio')]);

      // Second call - cache hit
      await resolver.resolveDependencies('file:///test2.pike', [makeImportSymbol('Stdio')]);

      const stats = resolver.getStats();
      assert.strictEqual(stats.stdlibCacheMisses, 1, 'should have 1 cache miss');
      assert.strictEqual(stats.stdlibCacheHits, 1, 'should have 1 cache hit');
      assert.strictEqual(stats.stdlibCacheSize, 1, 'should have 1 cached entry');
    });
  });
});
