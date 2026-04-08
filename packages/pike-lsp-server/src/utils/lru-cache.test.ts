/**
 * LRU Cache Unit Tests
 *
 * Tests the generic LRUCache implementation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LRUCache } from './lru-cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3); // Small size for testing eviction
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('should check if key exists with has()', () => {
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('should delete specific keys', () => {
      cache.set('a', 1);
      expect(cache.delete('a')).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.delete('a')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'

      expect(cache.has('a')).toBe(false);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should update access order on get', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      // Add new entry - should evict 'b' (now oldest)
      cache.set('d', 4);

      expect(cache.has('a')).toBe(true); // Still there
      expect(cache.has('b')).toBe(false); // Evicted
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('should update access order on set (existing key)', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a' to make it recently used
      cache.set('a', 10);

      // Add new entry - should evict 'b' (now oldest)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(10);
      expect(cache.has('b')).toBe(false); // Evicted
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('size tracking', () => {
    it('should track size correctly', () => {
      expect(cache.size).toBe(0);
      cache.set('a', 1);
      expect(cache.size).toBe(1);
      cache.set('b', 2);
      expect(cache.size).toBe(2);
      cache.set('a', 10); // Update existing
      expect(cache.size).toBe(2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('iteration', () => {
    it('should iterate keys in LRU order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // Move 'a' to end

      const keys = Array.from(cache.keys());
      expect(keys).toEqual(['b', 'c', 'a']);
    });

    it('should iterate values in LRU order', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // Move 'a' to end

      const values = Array.from(cache.values());
      expect(values).toEqual([2, 3, 1]);
    });

    it('should iterate entries in LRU order', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const entries = Array.from(cache.entries());
      expect(entries).toEqual([
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
      expect(defaultCache.size).toBe(500);
      expect(defaultCache.has('key0')).toBe(false);
      expect(defaultCache.has('key9')).toBe(false);
      expect(defaultCache.has('key10')).toBe(true);
    });
  });

  describe('generic types', () => {
    it('should work with number keys', () => {
      const numCache = new LRUCache<number, string>(3);
      numCache.set(1, 'one');
      numCache.set(2, 'two');
      expect(numCache.get(1)).toBe('one');
      expect(numCache.get(2)).toBe('two');
    });

    it('should work with object values', () => {
      interface Item {
        name: string;
        value: number;
      }
      const objCache = new LRUCache<string, Item>(3);
      objCache.set('item1', { name: 'first', value: 100 });
      expect(objCache.get('item1')?.name).toBe('first');
      expect(objCache.get('item1')?.value).toBe(100);
    });
  });
});
