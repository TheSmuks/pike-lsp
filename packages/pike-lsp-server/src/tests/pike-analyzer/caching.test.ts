import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import { LRUCache } from '../../services/lru-cache.js';
import { CompilationCache } from '../../services/compilation-cache.js';

interface AnalysisResult {
  symbols: string[];
  diagnostics: Array<{ message: string; severity: 'error' | 'warning' }>;
}

function createResult(
  symbols: string[],
  diagnostics: AnalysisResult['diagnostics'] = []
): AnalysisResult {
  return { symbols, diagnostics };
}

describe('LRUCache', () => {
  it('tracks cache hits and misses through get()', () => {
    const cache = new LRUCache<string, string>({ maxSize: 3 });

    cache.set('a', 'alpha');

    assert.equal(cache.get('a'), 'alpha', 'existing key should be a hit');
    assert.equal(cache.get('missing'), undefined, 'missing key should be a miss');

    const stats = cache.getStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
    assert.equal(cache.getHitRate(), 0.5);
  });

  it('evicts least-recently-used entry when max size is exceeded', () => {
    const cache = new LRUCache<string, string>({ maxSize: 2 });

    cache.set('a', 'alpha');
    cache.set('b', 'bravo');
    cache.get('a');
    cache.set('c', 'charlie');

    assert.equal(cache.get('b'), undefined, 'entry b should be evicted as least recently used');
    assert.equal(cache.get('a'), 'alpha');
    assert.equal(cache.get('c'), 'charlie');
    assert.equal(cache.getStats().evictions, 1);
  });

  it('uses configured size estimator and rejects oversize entries', () => {
    const cache = new LRUCache<string, string>({
      maxSize: 4,
      sizeEstimator: value => value.length,
    });

    const stored = cache.set('oversize', '12345');

    assert.equal(stored, false, 'entry larger than max size should not be stored');
    assert.equal(cache.entryCount, 0);
    assert.equal(cache.size, 0);
  });

  it('updates existing entry and recalculates total size', () => {
    const cache = new LRUCache<string, string>({
      maxSize: 10,
      sizeEstimator: value => value.length,
    });

    cache.set('item', 'ab');
    cache.set('item', 'abcdef');

    assert.equal(cache.get('item'), 'abcdef');
    assert.equal(cache.size, 6);
    assert.equal(cache.entryCount, 1);
  });

  it('clear() removes all entries and keeps stats readable', () => {
    const cache = new LRUCache<string, number>({ maxSize: 5 });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.clear();

    assert.equal(cache.entryCount, 0);
    assert.equal(cache.size, 0);

    const stats = cache.getStats();
    assert.equal(stats.hits, 1, 'clear should not erase collected telemetry');
    assert.equal(stats.size, 0);
  });

  it('maintains integrity during interleaved async access', async () => {
    const cache = new LRUCache<string, string>({ maxSize: 3 });

    await Promise.all([
      Promise.resolve().then(() => {
        cache.set('a', 'alpha');
      }),
      Promise.resolve().then(() => {
        cache.set('b', 'bravo');
      }),
      Promise.resolve().then(() => {
        cache.set('c', 'charlie');
        cache.get('a');
      }),
      Promise.resolve().then(() => {
        cache.set('d', 'delta');
      }),
    ]);

    assert.ok(cache.entryCount <= 3, 'cache should never exceed configured max size');
    assert.equal(cache.get('d'), 'delta', 'latest write should be retained');
  });
});

describe('CompilationCache', () => {
  it('stores and returns entry when code is unchanged', () => {
    const cache = new CompilationCache<AnalysisResult>({ maxSize: 100 });
    const uri = 'file:///main.pike';
    const code = 'int x = 1;';

    const stored = cache.store(uri, code, createResult(['x']));
    const cached = cache.get(uri, code);

    assert.equal(stored, true);
    assert.ok(cached, 'entry should be available immediately after store');
    assert.deepEqual(cached?.result.symbols, ['x']);
  });

  it('returns cache miss when code changes', () => {
    const cache = new CompilationCache<AnalysisResult>({ maxSize: 100 });
    const uri = 'file:///main.pike';

    cache.store(uri, 'int x = 1;', createResult(['x']));
    const cached = cache.get(uri, 'int x = 2;');

    assert.equal(cached, undefined, 'cache should be keyed by exact code content');
  });

  it('invalidates direct dependency entries', () => {
    const cache = new CompilationCache<AnalysisResult>({ maxSize: 100 });
    const depUri = 'file:///dep.pike';
    const mainUri = 'file:///main.pike';

    cache.store(depUri, 'int dep = 1;', createResult(['dep']));
    cache.store(mainUri, 'inherit "dep";', createResult(['main']), [depUri]);

    const invalidated = cache.invalidate(depUri);

    assert.deepEqual(invalidated, [depUri]);
    assert.equal(cache.get(depUri, 'int dep = 1;'), undefined);
    assert.ok(
      cache.get(mainUri, 'inherit "dep";'),
      'non-transitive invalidation should keep dependent entry'
    );
  });

  it('invalidates transitive dependents through dependency graph', () => {
    const cache = new CompilationCache<AnalysisResult>({ maxSize: 100 });

    const uriA = 'file:///a.pike';
    const uriB = 'file:///b.pike';
    const uriC = 'file:///c.pike';

    cache.store(uriA, 'inherit "b";', createResult(['A']), [uriB]);
    cache.store(uriB, 'inherit "c";', createResult(['B']), [uriC]);
    cache.store(uriC, 'int c = 1;', createResult(['C']));

    const invalidated = cache.invalidate(uriC, true).sort();

    assert.deepEqual(invalidated, [uriA, uriB, uriC].sort());
    assert.equal(cache.size, 0);
  });

  it('keeps compilation diagnostics in cached result', () => {
    const cache = new CompilationCache<AnalysisResult>({ maxSize: 100 });
    const uri = 'file:///broken.pike';
    const code = 'int x = ;';
    const diagnostics = [{ message: 'Syntax error', severity: 'error' as const }];

    cache.store(uri, code, createResult([], diagnostics));
    const cached = cache.get(uri, code);

    assert.ok(cached);
    assert.equal(cached?.result.diagnostics.length, 1);
    assert.equal(cached?.result.diagnostics[0]?.message, 'Syntax error');
  });

  it('evicts entries older than max age threshold', () => {
    const cache = new CompilationCache<AnalysisResult>({ maxSize: 100, clock: () => 10_000 });

    cache.store('file:///old.pike', 'int old;', createResult(['old']), [], 1_000);
    cache.store('file:///new.pike', 'int fresh;', createResult(['fresh']), [], 9_800);

    const evicted = cache.evictOlderThan(3_000, 10_000);

    assert.deepEqual(evicted, ['file:///old.pike']);
    assert.equal(cache.get('file:///old.pike', 'int old;'), undefined);
    assert.ok(cache.get('file:///new.pike', 'int fresh;'));
  });

  it('serializes and deserializes cache entries', () => {
    const cache = new CompilationCache<AnalysisResult>({ maxSize: 100 });

    cache.store('file:///a.pike', 'int a;', createResult(['a']), ['file:///shared.pike'], 123);
    cache.store('file:///b.pike', 'int b;', createResult(['b']), [], 456);

    const serialized = cache.serialize();
    const restored = CompilationCache.deserialize<AnalysisResult>(serialized, { maxSize: 100 });

    const restoredA = restored.get('file:///a.pike', 'int a;');
    const restoredB = restored.get('file:///b.pike', 'int b;');

    assert.ok(restoredA);
    assert.ok(restoredB);
    assert.deepEqual(restoredA?.dependencies, ['file:///shared.pike']);
    assert.equal(restoredA?.timestamp, 123);
    assert.deepEqual(restoredB?.result.symbols, ['b']);
  });

  it('handles corrupted serialized payload without throwing', () => {
    const corrupted = '{this-is-not-json';

    const restored = CompilationCache.deserialize<AnalysisResult>(corrupted, { maxSize: 100 });

    assert.equal(restored.size, 0);
    assert.equal(restored.getStats().hits, 0);
    assert.equal(restored.getStats().misses, 0);
  });

  it('re-throws non-SyntaxError from JSON.parse during deserialization', () => {
    // JSON.parse only throws SyntaxError for parse failures.
    // Any other error type indicates a programming bug and must propagate.
    const originalParse = JSON.parse;
    const spyError = new TypeError('unexpected type');
    JSON.parse = () => {
      throw spyError;
    };
    try {
      assert.throws(
        () => CompilationCache.deserialize<AnalysisResult>('{}', { maxSize: 100 }),
        err => err === spyError
      );
    } finally {
      JSON.parse = originalParse;
    }
  });
});
