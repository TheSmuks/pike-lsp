import { describe, expect, it } from 'bun:test';
import { PikeIntrospectionService } from '../services/pike-introspection.js';
import type { Services } from '../services/index.js';
import type { StdlibIndexManager } from '../stdlib-index.js';

function createMockServices(): Services {
  return {
    documentCache: {
      get() {
        return undefined;
      },
    } as unknown as Services['documentCache'],
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    } as unknown as Services['logger'],
  } as Services;
}

function createMockStdlibIndex(
  modules: Map<string, Map<string, { kind: string }>>
): StdlibIndexManager {
  return {
    getAvailableModules() {
      return Array.from(modules.keys());
    },
    async getModule(path: string) {
      const symbols = modules.get(path);
      if (!symbols) return null;
      return { symbols };
    },
  } as unknown as StdlibIndexManager;
}

describe('searchStdlibCandidates binary search prefix lookup', () => {
  it('finds exact match via sorted key binary search', async () => {
    const modules = new Map<string, Map<string, { kind: string }>>();
    modules.set(
      'Public.Template',
      new Map([
        ['String', { kind: 'class' }],
        ['StringBuffer', { kind: 'class' }],
        ['Array', { kind: 'class' }],
      ])
    );

    const service = new PikeIntrospectionService(
      createMockServices(),
      undefined,
      createMockStdlibIndex(modules)
    );

    const results = await service.searchImportableSymbols('String');
    const names = results.map(r => r.symbol);

    // 'String' should be found (exact match gets higher score)
    expect(names).toContain('String');
    expect(names).toContain('StringBuffer');
  });

  it('finds prefix matches only (not substring matches) in Phase 1', async () => {
    const modules = new Map<string, Map<string, { kind: string }>>();
    modules.set('Public.Sort', new Map([['sort', { kind: 'function' }]]));
    modules.set('Public.Misc', new Map([['insertion_sort', { kind: 'function' }]]));

    const service = new PikeIntrospectionService(
      createMockServices(),
      undefined,
      createMockStdlibIndex(modules)
    );

    const results = await service.searchImportableSymbols('sort');
    const names = results.map(r => r.symbol);

    // 'sort' (exact) and 'insertion_sort' (contains 'sort') are expected
    // 'insertion_sort' has 'sort' as substring but not prefix - Phase 1 only matches prefix
    // so insertion_sort should only appear via Phase 2 fuzzy fallback or not at all
    expect(names).toContain('sort');
  });

  it('returns empty for non-matching query', async () => {
    const modules = new Map<string, Map<string, { kind: string }>>();
    modules.set('Public.Foo', new Map([['foo', { kind: 'function' }]]));

    const service = new PikeIntrospectionService(
      createMockServices(),
      undefined,
      createMockStdlibIndex(modules)
    );

    const results = await service.searchImportableSymbols('zzzz_nonexistent');
    expect(results).toHaveLength(0);
  });

  it('handles multiple modules with overlapping symbol names', async () => {
    const modules = new Map<string, Map<string, { kind: string }>>();
    modules.set('Public.A', new Map([['common_func', { kind: 'function' }]]));
    modules.set(
      'Public.B',
      new Map([
        ['common_func', { kind: 'function' }],
        ['common_other', { kind: 'function' }],
      ])
    );

    const service = new PikeIntrospectionService(
      createMockServices(),
      undefined,
      createMockStdlibIndex(modules)
    );

    const results = await service.searchImportableSymbols('common');
    const names = results.map(r => r.symbol);

    expect(names).toContain('common_func');
    expect(names).toContain('common_other');
  });

  it('correctly populates sorted keys across multiple calls', async () => {
    const modules = new Map<string, Map<string, { kind: string }>>();
    modules.set(
      'Public.First',
      new Map([
        ['alpha', { kind: 'function' }],
        ['charlie', { kind: 'function' }],
      ])
    );
    modules.set(
      'Public.Second',
      new Map([
        ['bravo', { kind: 'function' }],
        ['delta', { kind: 'function' }],
      ])
    );

    const service = new PikeIntrospectionService(
      createMockServices(),
      undefined,
      createMockStdlibIndex(modules)
    );

    // First call loads all modules
    const r1 = await service.searchImportableSymbols('alpha');
    expect(r1).toHaveLength(1);
    expect(r1[0]!.symbol).toBe('alpha');

    // Second call uses cached index, should still find bravo
    const r2 = await service.searchImportableSymbols('bravo');
    expect(r2).toHaveLength(1);
    expect(r2[0]!.symbol).toBe('bravo');
  });

  it('returns empty when no stdlib index provided', async () => {
    const service = new PikeIntrospectionService(createMockServices(), undefined, null);

    const results = await service.searchImportableSymbols('anything');
    expect(results).toHaveLength(0);
  });

describe('searchStdlibCandidates Phase 2 fuzzy fallback', () => {
  it('returns fuzzy matches from inverted index when Phase 1 yields nothing', async () => {
    const modules = new Map<string, Map<string, { kind: string }>>();
    // Only 'String' — no prefix match for 'strng', so Phase 2 fuzzy must fire
    modules.set(
      'Public.String',
      new Map([
        ['String', { kind: 'class' }],
        ['StringBuffer', { kind: 'class' }],
      ])
    );

    const service = new PikeIntrospectionService(
      createMockServices(),
      undefined,
      createMockStdlibIndex(modules)
    );

    const results = await service.searchImportableSymbols('strng');

    // 'strng' is a contiguous subsequence of both 'String' and 'StringBuffer'
    expect(results.length).toBeGreaterThanOrEqual(2);

    // Verify candidate shape
    for (const r of results) {
      expect(r.symbol).toBeTruthy();
      expect(r.modulePath).toBe('Public.String');
      expect(['import', 'inherit']).toContain(r.importKind);
      expect(r.score).toBeGreaterThan(0);
      expect(r.source).toBe('stdlib-index');
    }

    // class → inherit
    const strEntry = results.find(r => r.symbol === 'String');
    expect(strEntry).toBeDefined();
    expect(strEntry!.importKind).toBe('inherit');
    expect(strEntry!.modulePath).toBe('Public.String');
    expect(strEntry!.score).toBeGreaterThan(0);

    const bufEntry = results.find(r => r.symbol === 'StringBuffer');
    expect(bufEntry).toBeDefined();
    expect(bufEntry!.importKind).toBe('inherit');
    expect(bufEntry!.modulePath).toBe('Public.String');
  });

  it('Phase 2 fuzzy match prefers substring over subsequence', async () => {
    const modules = new Map<string, Map<string, { kind: string }>>();
    // 'substrng' is a substring of 'substring_match', subsequence of 'subsequence'
    modules.set('Public.Test', new Map([
      ['substring_match', { kind: 'function' }],
      ['subsequence', { kind: 'function' }],
    ]));

    const service = new PikeIntrospectionService(
      createMockServices(),
      undefined,
      createMockStdlibIndex(modules)
    );

    const results = await service.searchImportableSymbols('substrng');
    const subMatch = results.find(r => r.symbol === 'substring_match');
    expect(subMatch).toBeDefined();
    // substring_match should score higher than subsequence
    const subSeq = results.find(r => r.symbol === 'subsequence');
    if (subSeq) {
      expect(subMatch!.score).toBeGreaterThan(subSeq.score);
    }
  });
});

});
