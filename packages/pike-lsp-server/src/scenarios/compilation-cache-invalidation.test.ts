import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { CompilationCache } from '../services/compilation-cache.js';

type TestResult = { errors: number };

function makeOptions(overrides?: { clock?: () => number }) {
  return { maxSize: 100, ...overrides };
}

describe('CompilationCache.invalidate', () => {
  it('non-transitive invalidation removes only the target file', () => {
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike']);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, ['file:///c.pike']);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, []);

    const invalidated = cache.invalidate('file:///b.pike', false);

    assert.deepStrictEqual(invalidated, ['file:///b.pike']);
    assert.strictEqual(cache.size, 2);
    assert.ok(cache.get('file:///a.pike', 'code-a'));
    assert.ok(!cache.get('file:///b.pike', 'code-b'));
    assert.ok(cache.get('file:///c.pike', 'code-c'));
  });

  it('non-transitive invalidation returns empty array for missing entry', () => {
    const cache = new CompilationCache<TestResult>(makeOptions());

    const invalidated = cache.invalidate('file:///nonexistent.pike', false);

    assert.deepStrictEqual(invalidated, []);
    assert.strictEqual(cache.size, 0);
  });

  it('transitive invalidation follows full dependent chain', () => {
    // A depends on B, B depends on C.
    // Invalidating C transitively should remove B and A (dependents of C).
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike']);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, ['file:///c.pike']);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, []);

    const invalidated = cache.invalidate('file:///c.pike', true);

    assert.strictEqual(invalidated.length, 3);
    assert.ok(invalidated.includes('file:///c.pike'));
    assert.ok(invalidated.includes('file:///b.pike'));
    assert.ok(invalidated.includes('file:///a.pike'));
    assert.strictEqual(cache.size, 0);
  });

  it('transitive invalidation of B removes B and A but not C', () => {
    // A depends on B, B depends on C.
    // Invalidating B transitively should remove B and A (dependents of B).
    // C is a dependency of B, not a dependent, so it stays.
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike']);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, ['file:///c.pike']);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, []);

    const invalidated = cache.invalidate('file:///b.pike', true);

    assert.strictEqual(invalidated.length, 2);
    assert.ok(invalidated.includes('file:///b.pike'));
    assert.ok(invalidated.includes('file:///a.pike'));
    assert.ok(!invalidated.includes('file:///c.pike'));
    assert.strictEqual(cache.size, 1);
    assert.ok(cache.get('file:///c.pike', 'code-c'));
  });

  it('transitive invalidation handles diamond dependency graph', () => {
    //     A
    //    / \
    //   B   C
    //    \ /
    //     D
    // Invalidating D should remove D, B, C, A (all dependents).
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike', 'file:///c.pike']);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, ['file:///d.pike']);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, ['file:///d.pike']);
    cache.store('file:///d.pike', 'code-d', { errors: 0 }, []);

    const invalidated = cache.invalidate('file:///d.pike', true);

    assert.strictEqual(invalidated.length, 4);
    assert.strictEqual(cache.size, 0);
  });

  it('transitive invalidation does not revisit already-visited nodes', () => {
    // A depends on B and C. B depends on D. C depends on D.
    // Invalidating D should visit D -> B -> A -> C, but A is already visited
    // when reached via C. Each node invalidated exactly once.
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike', 'file:///c.pike']);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, ['file:///d.pike']);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, ['file:///d.pike']);
    cache.store('file:///d.pike', 'code-d', { errors: 0 }, []);

    const invalidated = cache.invalidate('file:///d.pike', true);

    // All four invalidated, no duplicates
    const unique = new Set(invalidated);
    assert.strictEqual(invalidated.length, unique.size);
    assert.strictEqual(unique.size, 4);
  });

  it('transitive invalidation of a node with no dependents only removes itself', () => {
    // C is a leaf dependency with no dependents stored.
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, []);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, []);

    const invalidated = cache.invalidate('file:///c.pike', true);

    assert.deepStrictEqual(invalidated, ['file:///c.pike']);
    assert.strictEqual(cache.size, 1);
    assert.ok(cache.get('file:///a.pike', 'code-a'));
  });
});

describe('CompilationCache.invalidate dependency edge cleanup', () => {
  it('removes dependency edges from both maps when an intermediate node is invalidated', () => {
    // A depends on B, B depends on C.
    // After invalidating B (transitive), A's entry is also removed.
    // Check that both maps are consistent.
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike']);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, ['file:///c.pike']);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, []);

    cache.invalidate('file:///b.pike', true);

    // Only C remains
    const stats = cache.getStats();
    assert.strictEqual(stats.trackedFiles, 0); // C has no dependencies
    assert.strictEqual(stats.trackedDependencyEdges, 0);
  });

  it('invalidating a node with both dependencies and dependents cleans both maps', () => {
    // A depends on B, B depends on C.
    // B has both a dependency (C) and a dependent (A).
    // Non-transitive invalidation of B should remove B's outgoing edges
    // (B->C in dependenciesByFile) and B's reverse edge (A->B in dependentsByFile).
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike']);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, ['file:///c.pike']);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, []);

    cache.invalidate('file:///b.pike', false);

    // A still exists, depends on B (but B is gone from dependentsByFile tracking)
    const stats = cache.getStats();
    // A still has dependency on B, but B's entry is gone.
    // A's dependency edge to B still exists in dependenciesByFile for A.
    // B's dependentsByFile entry was cleaned up.
    assert.strictEqual(stats.trackedFiles, 1); // A still has dependencies tracked
    assert.strictEqual(stats.trackedDependencyEdges, 1); // A->B edge
  });

  it('re-storing after invalidation rebuilds dependency edges correctly', () => {
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike']);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, []);

    cache.invalidate('file:///b.pike', true);

    // Re-store B
    cache.store('file:///b.pike', 'code-b', { errors: 1 }, []);
    // Re-store A with dependency on B
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike']);

    const stats = cache.getStats();
    assert.strictEqual(stats.trackedFiles, 1); // A has dependencies
    assert.strictEqual(stats.trackedDependencyEdges, 1); // A->B

    // Now transitive invalidation of B should still reach A
    const invalidated = cache.invalidate('file:///b.pike', true);
    assert.strictEqual(invalidated.length, 2);
  });
});

describe('CompilationCache.evictOlderThan', () => {
  it('removes entries older than the threshold', () => {
    let now = 1000;
    const cache = new CompilationCache<TestResult>(makeOptions({ clock: () => now }));

    cache.store('file:///old.pike', 'old-code', { errors: 0 }, [], 500);
    cache.store('file:///new.pike', 'new-code', { errors: 0 }, [], 900);

    const evicted = cache.evictOlderThan(300, 1000);

    assert.deepStrictEqual(evicted, ['file:///old.pike']);
    assert.strictEqual(cache.size, 1);
    assert.ok(cache.get('file:///new.pike', 'new-code'));
  });

  it('does not remove entries exactly at the threshold boundary', () => {
    let now = 1000;
    const cache = new CompilationCache<TestResult>(makeOptions({ clock: () => now }));

    cache.store('file:///boundary.pike', 'code', { errors: 0 }, [], 700);

    const evicted = cache.evictOlderThan(300, 1000);

    // now(1000) - timestamp(700) = 300, which is NOT > 300
    assert.deepStrictEqual(evicted, []);
    assert.strictEqual(cache.size, 1);
  });

  it('removes entries with zero maxAge', () => {
    let now = 1000;
    const cache = new CompilationCache<TestResult>(makeOptions({ clock: () => now }));

    cache.store('file:///a.pike', 'code-a', { errors: 0 }, [], 999);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, [], 1000);

    const evicted = cache.evictOlderThan(0, 1000);

    // now - timestamp > 0 for entry with timestamp 999
    assert.strictEqual(evicted.length, 1);
    assert.ok(evicted.includes('file:///a.pike'));
    assert.strictEqual(cache.size, 1);
  });

  it('cleans up dependency edges when evicting', () => {
    let now = 1000;
    const cache = new CompilationCache<TestResult>(makeOptions({ clock: () => now }));

    cache.store('file:///a.pike', 'code-a', { errors: 0 }, ['file:///b.pike'], 500);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, [], 900);

    cache.evictOlderThan(300, 1000);

    // A was evicted (timestamp 500). Its dependency edge to B should be cleaned.
    // B remains.
    const stats = cache.getStats();
    assert.strictEqual(stats.trackedFiles, 0); // B has no dependencies
    assert.strictEqual(stats.trackedDependencyEdges, 0);
    assert.strictEqual(cache.size, 1);
    assert.ok(cache.get('file:///b.pike', 'code-b'));
  });

  it('cleans up all dependency edges when evicting multiple entries', () => {
    let now = 1000;
    const cache = new CompilationCache<TestResult>(makeOptions({ clock: () => now }));

    cache.store(
      'file:///a.pike',
      'code-a',
      { errors: 0 },
      ['file:///b.pike', 'file:///c.pike'],
      200
    );
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, ['file:///c.pike'], 300);
    cache.store('file:///c.pike', 'code-c', { errors: 0 }, [], 950);

    const evicted = cache.evictOlderThan(500, 1000);

    // A (200) and B (300) evicted. C (950) stays.
    assert.strictEqual(evicted.length, 2);
    assert.ok(evicted.includes('file:///a.pike'));
    assert.ok(evicted.includes('file:///b.pike'));

    const stats = cache.getStats();
    assert.strictEqual(stats.trackedFiles, 0); // C has no deps
    assert.strictEqual(stats.trackedDependencyEdges, 0);
    assert.strictEqual(cache.size, 1);
  });

  it('returns empty array when nothing is old enough', () => {
    let now = 1000;
    const cache = new CompilationCache<TestResult>(makeOptions({ clock: () => now }));

    cache.store('file:///a.pike', 'code-a', { errors: 0 }, [], 900);

    const evicted = cache.evictOlderThan(200, 1000);

    assert.deepStrictEqual(evicted, []);
    assert.strictEqual(cache.size, 1);
  });

  it('evicts everything when all entries are old enough', () => {
    let now = 1000;
    const cache = new CompilationCache<TestResult>(makeOptions({ clock: () => now }));

    cache.store('file:///a.pike', 'code-a', { errors: 0 }, [], 100);
    cache.store('file:///b.pike', 'code-b', { errors: 0 }, [], 200);

    const evicted = cache.evictOlderThan(100, 1000);

    assert.strictEqual(evicted.length, 2);
    assert.strictEqual(cache.size, 0);
    const stats = cache.getStats();
    assert.strictEqual(stats.trackedFiles, 0);
    assert.strictEqual(stats.trackedDependencyEdges, 0);
  });

  it('uses cache clock when now parameter is omitted', () => {
    let clockValue = 0;
    const cache = new CompilationCache<TestResult>(makeOptions({ clock: () => clockValue }));

    // Store at time 100
    clockValue = 100;
    cache.store('file:///a.pike', 'code-a', { errors: 0 }, []);

    // Evict at time 200, maxAge 50
    clockValue = 200;
    const evicted = cache.evictOlderThan(50);

    assert.strictEqual(evicted.length, 1);
    assert.strictEqual(cache.size, 0);
  });
});
