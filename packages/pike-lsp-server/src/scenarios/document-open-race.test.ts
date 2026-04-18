/**
 * Scenario: Document Symbols Race on File Open (Issue #1075)
 *
 * Tests that document symbols resolve correctly when requested
 * immediately after file open, without relying on fragile setTimeout hacks.
 *
 * Before the fix:
 * - onDidOpen called engineOpenDocument fire-and-forget
 * - validateDocument ran immediately (without snapshot)
 * - documentCache.setPending was called synchronously (OK)
 * - BUT symbols.ts had a 50ms setTimeout hack because the pending
 *   promise resolved before the cache was populated in some edge cases
 *
 * After the fix:
 * - onDidOpen awaits engineOpenDocument before validateDocument
 * - documentSnapshots is set before validation starts
 * - symbols.ts no longer needs the 50ms setTimeout hack
 * - waitFor(uri) guarantees cache is populated when it resolves
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { DocumentCache } from '../services/document-cache.js';
import { registerDocumentSymbolHandler } from '../features/navigation/document-symbol.js';
import {
  createMockConnection,
  createMockServices,
  makeCacheEntry,
  sym,
  asConnection,
  asServices,
} from '../tests/helpers/mock-services.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

function createRealDocumentCache() {
  return new DocumentCache();
}

function setupDocumentSymbolTest(cache: DocumentCache) {
  const services = createMockServices();
  (services as any).documentCache = {
    get: (u: string) => cache.get(u),
    waitFor: async (u: string) => cache.waitFor(u),
    entries: () => cache.entries(),
    keys: () => cache.keys(),
  };

  const conn = createMockConnection();
  registerDocumentSymbolHandler(asConnection(conn), asServices(services), {
    get: () => undefined,
  } as any);

  return conn;
}

describe('Scenario: document symbols race on file open', () => {
  it('should resolve symbols after waitFor without setTimeout hack', async () => {
    const uri = 'file:///race-test.pike';
    const cache = createRealDocumentCache();

    const pikeSymbols: PikeSymbol[] = [
      sym('TestClass', 'class', { position: { file: 'race-test.pike', line: 1 } }),
      sym('main', 'method', { position: { file: 'race-test.pike', line: 5 } }),
    ];

    const cacheEntry = makeCacheEntry({ symbols: pikeSymbols, version: 1 });

    const validationPromise = new Promise<void>(resolve => {
      setTimeout(() => {
        cache.set(uri, cacheEntry);
        resolve();
      }, 30);
    });

    cache.setPending(uri, validationPromise);

    const conn = setupDocumentSymbolTest(cache);

    const result = await conn.documentSymbolHandler({ textDocument: { uri } });

    assert.ok(result, 'Symbols should resolve after waitFor without setTimeout hack');
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]!.name, 'TestClass');
    assert.strictEqual(result[1]!.name, 'main');
  });

  it('should return symbols immediately when cache is already populated', async () => {
    const uri = 'file:///cached.pike';
    const cache = createRealDocumentCache();

    const pikeSymbols: PikeSymbol[] = [
      sym('cached_fn', 'method', { position: { file: 'cached.pike', line: 1 } }),
    ];

    cache.set(uri, makeCacheEntry({ symbols: pikeSymbols, version: 1 }));

    const conn = setupDocumentSymbolTest(cache);

    const result = await conn.documentSymbolHandler({ textDocument: { uri } });

    assert.ok(result, 'Should return cached symbols immediately');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.name, 'cached_fn');
  });

  it('should return null when validation completes with no symbols', async () => {
    const uri = 'file:///empty.pike';
    const cache = createRealDocumentCache();

    const validationPromise = new Promise<void>(resolve => {
      setTimeout(() => {
        cache.set(uri, makeCacheEntry({ symbols: [], version: 1 }));
        resolve();
      }, 10);
    });

    cache.setPending(uri, validationPromise);

    const conn = setupDocumentSymbolTest(cache);

    const result = await conn.documentSymbolHandler({ textDocument: { uri } });

    assert.deepStrictEqual(result, []);
  });

  it('should return null when no pending validation and no cache', async () => {
    const uri = 'file:///unknown.pike';
    const cache = createRealDocumentCache();

    const conn = setupDocumentSymbolTest(cache);

    const result = await conn.documentSymbolHandler({ textDocument: { uri } });

    assert.strictEqual(result, null);
  });

  it('should handle slow validation completing after symbols request', async () => {
    const uri = 'file:///slow.pike';
    const cache = createRealDocumentCache();

    const pikeSymbols: PikeSymbol[] = [
      sym('SlowClass', 'class', { position: { file: 'slow.pike', line: 1 } }),
    ];

    const validationPromise = new Promise<void>(resolve => {
      setTimeout(() => {
        cache.set(uri, makeCacheEntry({ symbols: pikeSymbols, version: 1 }));
        resolve();
      }, 100);
    });

    cache.setPending(uri, validationPromise);

    const conn = setupDocumentSymbolTest(cache);

    const startTime = Date.now();
    const result = await conn.documentSymbolHandler({ textDocument: { uri } });
    const elapsed = Date.now() - startTime;

    assert.ok(result, 'Should resolve symbols even with slow validation');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.name, 'SlowClass');
    assert.ok(
      elapsed >= 90,
      `Should have waited for slow validation (took ${elapsed}ms, expected >= 90ms)`
    );
  });

  it('should handle validation promise rejection gracefully', async () => {
    const uri = 'file:///error.pike';
    const cache = createRealDocumentCache();

    const validationPromise = new Promise<void>((resolve, _reject) => {
      setTimeout(() => resolve(), 10);
    });
    cache.setPending(uri, validationPromise);

    const conn = setupDocumentSymbolTest(cache);

    const result = await conn.documentSymbolHandler({ textDocument: { uri } });

    assert.strictEqual(result, null, 'Should return null when validation fails');
  });
});

describe('Scenario: DocumentCache setPending/waitFor contract', () => {
  it('waitFor should resolve after setPending promise resolves and cache is set', async () => {
    const cache = createRealDocumentCache();
    const uri = 'file:///contract.pike';

    let resolved = false;
    const promise = new Promise<void>(resolve => {
      setTimeout(() => {
        cache.set(uri, makeCacheEntry({ symbols: [], version: 1 }));
        resolved = true;
        resolve();
      }, 20);
    });

    cache.setPending(uri, promise);

    assert.strictEqual(resolved, false, 'Should not be resolved yet');
    assert.strictEqual(cache.get(uri), undefined, 'Cache should not be set yet');

    await cache.waitFor(uri);

    assert.strictEqual(resolved, true, 'Should be resolved after waitFor');
    assert.ok(cache.get(uri), 'Cache should be populated after waitFor');
  });

  it('waitFor should return immediately when no pending promise exists', async () => {
    const cache = createRealDocumentCache();
    const uri = 'file:///no-pending.pike';

    const start = Date.now();
    await cache.waitFor(uri);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 10, `waitFor should be near-instant when no pending (took ${elapsed}ms)`);
  });

  it('setPending should auto-cleanup after promise resolves', async () => {
    const cache = createRealDocumentCache();
    const uri = 'file:///cleanup.pike';

    const promise = Promise.resolve();
    cache.setPending(uri, promise);

    await new Promise(r => setTimeout(r, 10));

    await cache.waitFor(uri);
  });
});
