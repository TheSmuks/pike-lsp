import { describe, it, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeIntrospectionService } from '../services/pike-introspection.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noopLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function makeServices() {
  return {
    bridge: null,
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
    workspaceIndex: {},
    stdlibIndex: null,
    includeResolver: null,
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 0 },
    includePaths: [],
  };
}

function makeStdlibIndex(modules: Map<string, Map<string, { kind: string }>>) {
  return {
    getAvailableModules: () => [...modules.keys()],
    getModule: async (path: string) => {
      const symbols = modules.get(path);
      if (!symbols) return null;
      return {
        modulePath: path,
        symbols,
        lastAccessed: Date.now(),
        accessCount: 0,
        sizeBytes: 0,
      };
    },
  };
}

/** Pre-populate the search index from mock stdlib modules (simulates background population). */
async function populateIndex(
  svc: PikeIntrospectionService,
  modules: Map<string, Map<string, { kind: string }>>
) {
  for (const [path, symbols] of modules) {
    svc.addModuleToIndex({
      modulePath: path,
      symbols: symbols as unknown as Map<
        string,
        import('@pike-lsp/pike-bridge').IntrospectedSymbol
      >,
      lastAccessed: Date.now(),
      accessCount: 0,
      sizeBytes: 0,
    });
  }
}

function makeWorkspaceIndex(
  results: Array<{
    symbol: string;
    modulePath: string;
    importKind: 'import' | 'inherit';
    score: number;
  }> = []
) {
  return {
    searchImportableSymbols: (_query: string, _opts?: { excludeUri?: string; limit?: number }) =>
      results.map(r => ({ ...r, source: 'workspace-index' as const })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PikeIntrospectionService - stdlib fuzzy scoring and deduplication', () => {
  let service: PikeIntrospectionService;

  beforeEach(() => {
    service = new PikeIntrospectionService(
      makeServices() as never,
      makeWorkspaceIndex() as never,
      null
    );
  });

  // ---- 1. Empty / whitespace query returns empty ----

  describe('searchImportableSymbols - empty query', () => {
    it('returns empty array for empty string', async () => {
      const results = await service.searchImportableSymbols('');
      assert.deepStrictEqual(results, []);
    });

    it('returns empty array for whitespace-only string', async () => {
      const results = await service.searchImportableSymbols('   ');
      assert.deepStrictEqual(results, []);
    });
  });

  // ---- 2. Limit truncation ----

  describe('searchImportableSymbols - limit', () => {
    it('respects the limit parameter', async () => {
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      const symbols = new Map<string, { kind: string }>();
      for (let i = 0; i < 10; i++) {
        symbols.set(`matchA${i}`, { kind: 'function' });
      }
      stdlibModules.set('Mod.A', symbols);

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex() as never,
        makeStdlibIndex(stdlibModules) as never
      );

      await populateIndex(svc, stdlibModules);

      const results = await svc.searchImportableSymbols('matchA', { limit: 3 });
      assert.equal(results.length, 3);
      for (const r of results) {
        assert.equal(r.source, 'stdlib-index');
      }
    });

    it('enforces minimum limit of 1', async () => {
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      stdlibModules.set('Mod.X', new Map([['foobar', { kind: 'function' }]]));

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex() as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(svc, stdlibModules);

      const results = await svc.searchImportableSymbols('foobar', { limit: 0 });
      assert.ok(results.length >= 1, 'should return at least 1 result even with limit: 0');
    });
  });

  // ---- 3. Scoring: exact > prefix > fuzzy ----

  describe('searchStdlibCandidates - scoring order', () => {
    it('exact match scores higher than prefix match', async () => {
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      stdlibModules.set(
        'Mod',
        new Map([
          ['Array', { kind: 'class' }],
          ['ArrayIterator', { kind: 'class' }],
        ])
      );

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex() as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(svc, stdlibModules);

      const results = await svc.searchImportableSymbols('Array');
      assert.ok(results.length >= 2);

      const exact = results.find(r => r.symbol === 'Array');
      const prefix = results.find(r => r.symbol === 'ArrayIterator');

      assert.ok(exact, 'exact match "Array" should be present');
      assert.ok(prefix, 'prefix match "ArrayIterator" should be present');
      assert.ok(
        exact!.score > prefix!.score,
        `exact score (${exact!.score}) should exceed prefix score (${prefix!.score})`
      );
    });

    it('prefix match scores higher than fuzzy match', async () => {
      // Use two separate service instances to compare phase-1 (prefix) vs phase-2 (fuzzy)
      // scores for the same symbol.
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      stdlibModules.set('Mod', new Map([['String', { kind: 'class' }]]));

      // Query "Str" triggers phase 1 (prefix match) — has exactBoost + prefix matchScore
      const prefixSvc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex() as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(prefixSvc, stdlibModules);
      const prefixResults = await prefixSvc.searchImportableSymbols('Str');
      assert.equal(prefixResults.length, 1);
      const prefixScore = prefixResults[0]!.score;

      // Query "rng" triggers phase 2 (fuzzy subsequence match) — no exactBoost
      // "rng" matches "String" via contiguous subsequence (s-t-r-i-n-g → r,n,g in order)
      const fuzzySvc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex() as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(fuzzySvc, stdlibModules);
      const fuzzyResults = await fuzzySvc.searchImportableSymbols('rng');
      assert.equal(fuzzyResults.length, 1);
      const fuzzyScore = fuzzyResults[0]!.score;

      assert.ok(
        prefixScore > fuzzyScore,
        `prefix score (${prefixScore}) should exceed fuzzy score (${fuzzyScore})`
      );
    });

    it('fuzzy fallback is used when no prefix/exact match exists', async () => {
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      stdlibModules.set('Mod', new Map([['internals', { kind: 'function' }]]));

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex() as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(svc, stdlibModules);

      const results = await svc.searchImportableSymbols('nrs');
      assert.equal(results.length, 1, 'should find "internals" via fuzzy subsequence');
      assert.equal(results[0]!.symbol, 'internals');
      assert.equal(results[0]!.source, 'stdlib-index');
    });

    it('returns empty when no fuzzy match exists', async () => {
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      stdlibModules.set('Mod', new Map([['String', { kind: 'class' }]]));

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex() as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(svc, stdlibModules);

      const results = await svc.searchImportableSymbols('zzz_no_match');
      assert.deepStrictEqual(results, []);
    });
  });

  // ---- 4. Deduplication: same symbol from workspace + stdlib ----

  describe('mergeCandidates - deduplication', () => {
    it('deduplicates candidates with same (symbol, modulePath, importKind) keeping highest score', async () => {
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      stdlibModules.set('Mod', new Map([['Array', { kind: 'class' }]]));

      const workspaceResults = [
        { symbol: 'Array', modulePath: 'Mod', importKind: 'inherit' as const, score: 50 },
      ];

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex(workspaceResults) as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(svc, stdlibModules);

      const results = await svc.searchImportableSymbols('Array');

      const arrayMatches = results.filter(
        r => r.symbol === 'Array' && r.modulePath === 'Mod' && r.importKind === 'inherit'
      );
      assert.equal(arrayMatches.length, 1, 'should deduplicate to a single entry');
      assert.ok(
        arrayMatches[0]!.score > 50,
        `deduped score (${arrayMatches[0]!.score}) should keep the higher stdlib score`
      );
    });

    it('keeps distinct candidates with different importKind for same symbol+module', async () => {
      const workspaceResults = [
        { symbol: 'Foo', modulePath: 'Mod', importKind: 'import' as const, score: 80 },
        { symbol: 'Foo', modulePath: 'Mod', importKind: 'inherit' as const, score: 90 },
      ];

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex(workspaceResults) as never,
        null
      );

      const results = await svc.searchImportableSymbols('Foo');
      assert.equal(results.length, 2, 'different importKind should not deduplicate');

      const kinds = results.map(r => r.importKind).sort();
      assert.deepStrictEqual(kinds, ['import', 'inherit']);
    });

    it('merges and sorts candidates from both workspace and stdlib', async () => {
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      stdlibModules.set('Lib', new Map([['Helper', { kind: 'function' }]]));

      const workspaceResults = [
        { symbol: 'Helper', modulePath: 'Lib', importKind: 'import' as const, score: 50 },
        { symbol: 'Other', modulePath: 'Src', importKind: 'import' as const, score: 200 },
      ];

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex(workspaceResults) as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(svc, stdlibModules);

      const results = await svc.searchImportableSymbols('Helper');

      const other = results.find(r => r.symbol === 'Other');
      assert.ok(other, '"Other" from workspace should be in merged results');
      assert.equal(other!.source, 'workspace-index');

      const helpers = results.filter(r => r.symbol === 'Helper' && r.modulePath === 'Lib');
      assert.equal(helpers.length, 1, '"Helper" from "Lib" should be deduplicated');
      assert.ok(helpers[0]!.score > 50, 'deduplicated score should be from stdlib (higher)');
    });

    it('sorts results by score descending, then symbol ascending', async () => {
      const workspaceResults = [
        { symbol: 'Beta', modulePath: 'M', importKind: 'import' as const, score: 100 },
        { symbol: 'Alpha', modulePath: 'M', importKind: 'import' as const, score: 200 },
        { symbol: 'Gamma', modulePath: 'M', importKind: 'import' as const, score: 50 },
      ];

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex(workspaceResults) as never,
        null
      );

      const results = await svc.searchImportableSymbols('Alpha');
      assert.equal(results.length, 3);
      assert.equal(results[0]!.symbol, 'Alpha');
      assert.equal(results[0]!.score, 200);
      assert.equal(results[1]!.symbol, 'Beta');
      assert.equal(results[1]!.score, 100);
      assert.equal(results[2]!.symbol, 'Gamma');
      assert.equal(results[2]!.score, 50);
    });
  });

  // ---- 5. Class symbols get inherit kind ----

  describe('searchStdlibCandidates - importKind assignment', () => {
    it('assigns inherit to class-kind symbols, import to others', async () => {
      const stdlibModules = new Map<string, Map<string, { kind: string }>>();
      stdlibModules.set(
        'Lib',
        new Map([
          ['MyClass', { kind: 'class' }],
          ['myFunction', { kind: 'function' }],
          ['MY_CONSTANT', { kind: 'variable' }],
        ])
      );

      const svc = new PikeIntrospectionService(
        makeServices() as never,
        makeWorkspaceIndex() as never,
        makeStdlibIndex(stdlibModules) as never
      );
      await populateIndex(svc, stdlibModules);

      const results = await svc.searchImportableSymbols('My');

      const cls = results.find(r => r.symbol === 'MyClass');
      const fn = results.find(r => r.symbol === 'myFunction');
      const variable = results.find(r => r.symbol === 'MY_CONSTANT');

      assert.ok(cls, 'MyClass should be found');
      assert.equal(cls!.importKind, 'inherit', 'class symbols should get inherit kind');

      assert.ok(fn, 'myFunction should be found');
      assert.equal(fn!.importKind, 'import', 'non-class symbols should get import kind');

      assert.ok(variable, 'MY_CONSTANT should be found');
      assert.equal(variable!.importKind, 'import', 'variable symbols should get import kind');
    });
  });
});
