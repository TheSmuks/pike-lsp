/**
 * LRU Cache Tests
 *
 * Tests the unified LRUCache implementation covering both count-based
 * (number constructor) and weighted-size (options-object constructor) modes.
 */

import { describe, it, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { LRUCache } from './lru-cache.js';

// ── Count-based (number constructor) ──────────────────────────────────

describe('LRUCache (count-based)', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3);
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('a', 1);
      assert.equal(cache.get('a'), 1);
    });

    it('should return undefined for missing keys', () => {
      assert.equal(cache.get('missing'), undefined);
    });

    it('should check if key exists with has()', () => {
      cache.set('a', 1);
      assert.equal(cache.has('a'), true);
      assert.equal(cache.has('missing'), false);
    });

    it('should delete specific keys', () => {
      cache.set('a', 1);
      assert.equal(cache.delete('a'), true);
      assert.equal(cache.has('a'), false);
      assert.equal(cache.delete('a'), false);
    });

    it('should clear all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      assert.equal(cache.size, 0);
      assert.equal(cache.has('a'), false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'

      assert.equal(cache.has('a'), false);
      assert.equal(cache.get('b'), 2);
      assert.equal(cache.get('c'), 3);
      assert.equal(cache.get('d'), 4);
    });

    it('should update access order on get', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      // Add new entry - should evict 'b' (now oldest)
      cache.set('d', 4);

      assert.equal(cache.has('a'), true);
      assert.equal(cache.has('b'), false);
      assert.equal(cache.has('c'), true);
      assert.equal(cache.has('d'), true);
    });

    it('should update access order on set (existing key)', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a' to make it recently used
      cache.set('a', 10);

      // Add new entry - should evict 'b' (now oldest)
      cache.set('d', 4);

      assert.equal(cache.get('a'), 10);
      assert.equal(cache.has('b'), false);
      assert.equal(cache.has('c'), true);
      assert.equal(cache.has('d'), true);
    });
  });

  describe('size tracking', () => {
    it('should track size correctly', () => {
      assert.equal(cache.size, 0);
      cache.set('a', 1);
      assert.equal(cache.size, 1);
      cache.set('b', 2);
      assert.equal(cache.size, 2);
      cache.set('a', 10); // Update existing
      assert.equal(cache.size, 2);
      cache.clear();
      assert.equal(cache.size, 0);
    });
  });

  describe('iteration', () => {
    it('should iterate keys in LRU order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // Move 'a' to end

      const keys = Array.from(cache.keys());
      assert.deepEqual(keys, ['b', 'c', 'a']);
    });

    it('should iterate values in LRU order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // Move 'a' to end

      const values = Array.from(cache.values());
      assert.deepEqual(values, [2, 3, 1]);
    });

    it('should iterate entries in LRU order', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const entries = cache.entries();
      assert.deepEqual(entries, [
        ['a', 1],
        ['b', 2],
      ]);
    });
  });

  describe('default size', () => {
    it('should use default size of 500', () => {
      const defaultCache = new LRUCache<string, string>();
      // Fill with 500+ items
      for (let i = 0; i < 510; i++) {
        defaultCache.set(`key${i}`, `value${i}`);
      }
      // Should only have 500 items (oldest 10 evicted)
      assert.equal(defaultCache.size, 500);
      assert.equal(defaultCache.has('key0'), false);
      assert.equal(defaultCache.has('key9'), false);
      assert.equal(defaultCache.has('key10'), true);
    });
  });

  describe('generic types', () => {
    it('should work with number keys', () => {
      const numCache = new LRUCache<number, string>(3);
      numCache.set(1, 'one');
      numCache.set(2, 'two');
      assert.equal(numCache.get(1), 'one');
      assert.equal(numCache.get(2), 'two');
    });

    it('should work with object values', () => {
      interface Item {
        name: string;
        value: number;
      }
      const objCache = new LRUCache<string, Item>(3);
      objCache.set('item1', { name: 'first', value: 100 });
      assert.equal(objCache.get('item1')?.name, 'first');
      assert.equal(objCache.get('item1')?.value, 100);
    });
  });
});

// ── Weighted-size (options-object constructor) ────────────────────────

describe('LRUCache (weighted-size)', () => {
  it('uses sizeEstimator for weighted eviction', () => {
    const cache = new LRUCache<string, string>({
      maxSize: 5,
      sizeEstimator: value => value.length,
    });

    cache.set('a', 'ab'); // size 2, total 2
    cache.set('b', 'cde'); // size 3, total 5

    // 'fg' (size 2) + total 5 = 7 > maxSize 5, so 'a' evicted first (size 2)
    // After evicting 'a': total 3 + 2 = 5 <= maxSize 5
    cache.set('c', 'fg');

    assert.equal(cache.has('a'), false);
    assert.equal(cache.get('b'), 'cde');
    assert.equal(cache.get('c'), 'fg');
  });

  it('rejects entries larger than maxSize', () => {
    const cache = new LRUCache<string, string>({
      maxSize: 4,
      sizeEstimator: value => value.length,
    });

    const stored = cache.set('oversize', '12345');
    assert.equal(stored, false);
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

  it('tracks hits, misses, and evictions in stats', () => {
    const cache = new LRUCache<string, string>({ maxSize: 3 });

    cache.set('a', 'alpha');
    cache.get('a'); // hit
    cache.get('missing'); // miss

    const stats = cache.getStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
    assert.equal(stats.evictions, 0);
    assert.equal(cache.getHitRate(), 0.5);
  });

  it('reports eviction count after LRU eviction', () => {
    const cache = new LRUCache<string, string>({ maxSize: 2 });

    cache.set('a', 'alpha');
    cache.set('b', 'bravo');
    cache.get('a');
    cache.set('c', 'charlie');

    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.getStats().evictions, 1);
  });

  it('clear() removes entries but preserves stats', () => {
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

  it('peek() reads without updating LRU position', () => {
    const cache = new LRUCache<string, string>({ maxSize: 2 });

    cache.set('a', 'alpha');
    cache.set('b', 'bravo');

    // peek 'a' without moving it to end
    assert.equal(cache.peek('a'), 'alpha');

    // 'a' is still oldest, so adding 'c' evicts 'a'
    cache.set('c', 'charlie');
    assert.equal(cache.has('a'), false);
  });

  it('evict() removes N oldest entries', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    const evicted = cache.evict(2);
    assert.deepEqual(evicted, ['a', 'b']);
    assert.equal(cache.entryCount, 1);
    assert.equal(cache.get('c'), 3);
  });

  it('throws on invalid maxSize', () => {
    assert.throws(() => new LRUCache<string, string>({ maxSize: -1 }), /maxSize/);
    assert.throws(() => new LRUCache<string, string>({ maxSize: Infinity }), /maxSize/);
    assert.throws(() => new LRUCache<string, string>({ maxSize: NaN }), /maxSize/);
  });

  describe('deleteBatch', () => {
    it('removes multiple keys and returns count of removed entries', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      const removed = cache.deleteBatch(['a', 'c']);
      assert.equal(removed, 2);
      assert.equal(cache.has('a'), false);
      assert.equal(cache.has('b'), true);
      assert.equal(cache.has('c'), false);
      assert.equal(cache.entryCount, 1);
    });

    it('returns 0 when no keys match', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);

      const removed = cache.deleteBatch(['x', 'y']);
      assert.equal(removed, 0);
      assert.equal(cache.entryCount, 1);
    });

    it('handles mix of present and absent keys', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);
      cache.set('b', 2);

      const removed = cache.deleteBatch(['a', 'missing', 'b']);
      assert.equal(removed, 2);
      assert.equal(cache.entryCount, 0);
    });

    it('handles empty array', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);

      const removed = cache.deleteBatch([]);
      assert.equal(removed, 0);
      assert.equal(cache.entryCount, 1);
    });

    it('updates weighted size correctly', () => {
      const cache = new LRUCache<string, string>({
        maxSize: 100,
        sizeEstimator: v => v.length,
      });
      cache.set('a', 'hello'); // size 5
      cache.set('b', 'world'); // size 5
      cache.set('c', '!'); // size 1

      cache.deleteBatch(['a', 'c']);
      assert.equal(cache.size, 5);
      assert.equal(cache.entryCount, 1);
      assert.equal(cache.get('b'), 'world');
    });

    it('handles duplicates in the input array', () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);
      cache.set('b', 2);

      const removed = cache.deleteBatch(['a', 'a', 'b', 'b']);
      // First occurrence removes, second is a no-op
      assert.equal(removed, 2);
      assert.equal(cache.entryCount, 0);
    });
  });
});
