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

function populateIndex(svc: PikeIntrospectionService, modules: { path: string; symbols: Map<string, IntrospectedSymbol> }[]) {
  for (const mod of modules) {
    svc.addModuleToIndex({
      modulePath: mod.path,
      symbols: mod.symbols,
      lastAccessed: Date.now(),
      accessCount: 0,
      sizeBytes: 0,
    });
  }
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
    populateIndex(svc, modules);
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

  it('uses pre-populated index and does not call getModule', async () => {
    const { svc, stdlibIndex } = createService();
    // Index is already populated — Phase 1 handles it via inverted index.
    // getModule should never be called.
    const results = await svc.searchImportableSymbols('read');
    expect(results.length).toBeGreaterThan(0);
    expect(stdlibIndex._getModuleCallCount()).toBe(0);
  });

  it('invalidateStdlibCache clears index and repopulating restores results', async () => {
    const { svc, stdlibIndex } = createService();
    // Search works before invalidation
    let results = await svc.searchImportableSymbols('read');
    expect(results.length).toBeGreaterThan(0);

    // Invalidate clears the index
    svc.invalidateStdlibCache();
    results = await svc.searchImportableSymbols('read');
    expect(results).toEqual([]);

    // Re-populate restores results
    populateIndex(svc, modules);
    results = await svc.searchImportableSymbols('read');
    expect(results.length).toBeGreaterThan(0);
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
});
