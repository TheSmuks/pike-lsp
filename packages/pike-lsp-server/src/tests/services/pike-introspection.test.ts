import { describe, it, expect } from 'bun:test';
import type { IntrospectedSymbol } from '@pike-lsp/pike-bridge';
import { PikeIntrospectionService } from '../../services/pike-introspection.js';
import { createMockServices } from '../helpers/mock-services.js';

/** Create a mock StdlibIndexManager with known modules and symbols. */
function createMockStdlibIndex(
  modules: {
    path: string;
    symbols: Map<string, IntrospectedSymbol>;
  }[]
) {
  let getModuleCallCount = 0;
  return {
    getAvailableModules: () => modules.map(m => m.path),
    getModule: async (modulePath: string) => {
      getModuleCallCount++;
      const mod = modules.find(m => m.path === modulePath);
      return mod ? { symbols: mod.symbols, path: modulePath } : null;
    },
    _getModuleCallCount: () => getModuleCallCount,
  };
}

function makeSymbol(
  name: string,
  kind: IntrospectedSymbol['kind'] = 'function'
): IntrospectedSymbol {
  return { name, kind };
}

describe('PikeIntrospectionService - searchImportableSymbols', () => {
  const modules = [
    {
      path: 'Stream',
      symbols: new Map<string, IntrospectedSymbol>([
        ['read', makeSymbol('read', 'function')],
        ['readBytes', makeSymbol('readBytes', 'function')],
        ['write', makeSymbol('write', 'function')],
      ]),
    },
    {
      path: 'String',
      symbols: new Map<string, IntrospectedSymbol>([
        ['trim', makeSymbol('trim', 'function')],
        ['trimAllWhites', makeSymbol('trimAllWhites', 'function')],
        ['strlen', makeSymbol('strlen', 'function')],
      ]),
    },
    {
      path: 'Array',
      symbols: new Map<string, IntrospectedSymbol>([
        ['sort', makeSymbol('sort', 'function')],
        ['ArrayIterator', makeSymbol('ArrayIterator', 'class')],
      ]),
    },
  ];

  function createService() {
    const stdlibIndex = createMockStdlibIndex(modules);
    const services = createMockServices();
    const svc = new PikeIntrospectionService(services, undefined, stdlibIndex as never);
    return { svc, stdlibIndex };
  }

  it('returns empty for empty query', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('');
    expect(results).toEqual([]);
  });

  it('returns empty for whitespace-only query', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('   ');
    expect(results).toEqual([]);
  });

  it('matches exact symbol name', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('read');
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain('read');
  });

  it('matches prefix (starts with query)', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('read');
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain('readBytes');
  });

  it('matches substring (query found inside name)', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('trim');
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain('trimAllWhites');
  });

  it('matches contiguous subsequence', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('rBy');
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain('readBytes');
  });

  it('ranks exact match higher than prefix match', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('read');
    const readResult = results.find(r => r.symbol === 'read');
    const readBytesResult = results.find(r => r.symbol === 'readBytes');
    expect(readResult).toBeDefined();
    expect(readBytesResult).toBeDefined();
    expect(readResult!.score).toBeGreaterThan(readBytesResult!.score);
  });

  it('ranks prefix match higher than substring match', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('trim');
    const trimResult = results.find(r => r.symbol === 'trim');
    const trimAllResult = results.find(r => r.symbol === 'trimAllWhites');
    expect(trimResult).toBeDefined();
    expect(trimAllResult).toBeDefined();
    expect(trimResult!.score).toBeGreaterThan(trimAllResult!.score);
  });

  it('does not match unrelated symbols', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('xyz');
    expect(results).toEqual([]);
  });

  it('sets importKind to inherit for class symbols', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('ArrayIterator');
    const match = results.find(r => r.symbol === 'ArrayIterator');
    expect(match).toBeDefined();
    expect(match!.importKind).toBe('inherit');
  });

  it('sets importKind to import for function symbols', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('sort');
    const match = results.find(r => r.symbol === 'sort');
    expect(match).toBeDefined();
    expect(match!.importKind).toBe('import');
  });

  it('caches module symbols and does not re-fetch on second call', async () => {
    const { svc, stdlibIndex } = createService();
    // First call populates cache
    await svc.searchImportableSymbols('read');
    const countAfterFirst = stdlibIndex._getModuleCallCount();

    // Second call should use cache, not re-fetch
    await svc.searchImportableSymbols('write');
    const countAfterSecond = stdlibIndex._getModuleCallCount();

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('invalidateStdlibCache clears cache and forces re-fetch', async () => {
    const { svc, stdlibIndex } = createService();
    // First call populates cache
    await svc.searchImportableSymbols('read');
    const countAfterFirst = stdlibIndex._getModuleCallCount();

    // Invalidate cache
    svc.invalidateStdlibCache();

    // Second call must re-fetch from stdlibIndex
    await svc.searchImportableSymbols('write');
    const countAfterSecond = stdlibIndex._getModuleCallCount();

    expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
  });

  it('is case-insensitive', async () => {
    const { svc } = createService();
    const resultsLower = await svc.searchImportableSymbols('read');
    const resultsUpper = await svc.searchImportableSymbols('READ');
    expect(resultsLower.map(r => r.symbol).sort()).toEqual(resultsUpper.map(r => r.symbol).sort());
  });

  it('all candidates have source stdlib-index', async () => {
    const { svc } = createService();
    const results = await svc.searchImportableSymbols('r');
    for (const r of results) {
      expect(r.source).toBe('stdlib-index');
    }
  });

  describe('name index optimization', () => {
    it('still finds subsequence-only matches via fuzzy fallback', async () => {
      const { svc } = createService();
      // 'rBy' is a subsequence of 'readBytes' but not a prefix
      const results = await svc.searchImportableSymbols('rBy');
      const symbols = results.map(r => r.symbol);
      expect(symbols).toContain('readBytes');
    });

    it('exact and prefix matches produce correct scores after index build', async () => {
      const { svc } = createService();
      // Warm the index
      await svc.searchImportableSymbols('read');
      // Now query again — should use index
      const results = await svc.searchImportableSymbols('read');
      const readResult = results.find(r => r.symbol === 'read');
      const readBytesResult = results.find(r => r.symbol === 'readBytes');
      expect(readResult).toBeDefined();
      expect(readBytesResult).toBeDefined();
      expect(readResult!.score).toBeGreaterThan(readBytesResult!.score);
    });

    it('finds same symbols after cache invalidation and rebuild', async () => {
      const { svc } = createService();
      const before = await svc.searchImportableSymbols('sort');
      svc.invalidateStdlibCache();
      const after = await svc.searchImportableSymbols('sort');
      expect(before.map(r => r.symbol)).toEqual(after.map(r => r.symbol));
    });
  });
});
