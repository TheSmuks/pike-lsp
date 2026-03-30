import { describe, it, beforeEach, expect, vi } from 'bun:test';
import { GlobCache } from '../../features/rxml/glob-cache.js';

describe('GlobCache', () => {
  let cache: GlobCache<string[]>;

  beforeEach(() => {
    cache = new GlobCache<string[]>(1);
  });

  describe('get and set', () => {
    it('should return undefined for non-existent key', () => {
      const result = cache.get('*.pike', '/workspace');
      expect(result).toBeUndefined();
    });

    it('should store and retrieve data', () => {
      cache.set('*.pike', '/workspace', ['file1.pike', 'file2.pike']);
      const result = cache.get('*.pike', '/workspace');
      expect(result).toEqual(['file1.pike', 'file2.pike']);
    });

    it('should return different results for different patterns', () => {
      cache.set('*.pike', '/workspace', ['pike files']);
      cache.set('*.xml', '/workspace', ['xml files']);

      expect(cache.get('*.pike', '/workspace')).toEqual(['pike files']);
      expect(cache.get('*.xml', '/workspace')).toEqual(['xml files']);
    });

    it('should return different results for different cwds', () => {
      cache.set('*.pike', '/workspace', ['files in workspace']);
      cache.set('*.pike', '/other', ['files in other']);

      expect(cache.get('*.pike', '/workspace')).toEqual(['files in workspace']);
      expect(cache.get('*.pike', '/other')).toEqual(['files in other']);
    });
  });

  describe('expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('*.pike', '/workspace', ['file.pike']);

      expect(cache.get('*.pike', '/workspace')).toEqual(['file.pike']);

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(cache.get('*.pike', '/workspace')).toBeUndefined();
    });

    it('should use custom TTL from constructor', () => {
      const customTtlCache = new GlobCache<string[]>(5);
      customTtlCache.set('*.pike', '/workspace', ['file.pike']);

      expect(customTtlCache.get('*.pike', '/workspace')).toEqual(['file.pike']);
    });
  });

  describe('invalidate', () => {
    it('should remove all entries for a specific cwd', () => {
      cache.set('*.pike', '/workspace', ['f1']);
      cache.set('*.xml', '/workspace', ['f2']);
      cache.set('*.pike', '/other', ['f3']);

      cache.invalidate('/workspace');

      expect(cache.get('*.pike', '/workspace')).toBeUndefined();
      expect(cache.get('*.xml', '/workspace')).toBeUndefined();
      expect(cache.get('*.pike', '/other')).toEqual(['f3']);
    });

    it('should handle invalidation of non-existent cwd', () => {
      cache.set('*.pike', '/workspace', ['file']);

      cache.invalidate('/nonexistent');

      expect(cache.get('*.pike', '/workspace')).toEqual(['file']);
    });
  });

  describe('clear', () => {
    it('should remove all entries from cache', () => {
      cache.set('*.pike', '/workspace', ['f1']);
      cache.set('*.xml', '/workspace', ['f2']);
      cache.set('*.pike', '/other', ['f3']);

      cache.clear();

      expect(cache.get('*.pike', '/workspace')).toBeUndefined();
      expect(cache.get('*.xml', '/workspace')).toBeUndefined();
      expect(cache.get('*.pike', '/other')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return correct cache size', () => {
      expect(cache.getStats().size).toBe(0);

      cache.set('*.pike', '/workspace', ['f1']);
      expect(cache.getStats().size).toBe(1);

      cache.set('*.xml', '/workspace', ['f2']);
      expect(cache.getStats().size).toBe(2);

      cache.set('*.pike', '/other', ['f3']);
      expect(cache.getStats().size).toBe(3);

      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty pattern', () => {
      cache.set('', '/workspace', ['file']);
      expect(cache.get('', '/workspace')).toEqual(['file']);
    });

    it('should handle empty cwd', () => {
      cache.set('*.pike', '', ['file']);
      expect(cache.get('*.pike', '')).toEqual(['file']);
    });

    it('should handle special characters in pattern', () => {
      cache.set('file[0-9].pike', '/workspace', ['file1.pike']);
      expect(cache.get('file[0-9].pike', '/workspace')).toEqual(['file1.pike']);
    });

    it('should handle pattern with colon', () => {
      cache.set('pattern:with:colons', '/workspace', ['file']);
      expect(cache.get('pattern:with:colons', '/workspace')).toEqual(['file']);
    });

    it('should handle overwriting existing entry', () => {
      cache.set('*.pike', '/workspace', ['old']);
      cache.set('*.pike', '/workspace', ['new']);

      const result = cache.get('*.pike', '/workspace');
      expect(result).toEqual(['new']);
      expect(cache.getStats().size).toBe(1);
    });
  });
});
