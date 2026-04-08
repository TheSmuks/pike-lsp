/**
 * Generic LRU (Least Recently Used) Cache
 *
 * A reusable cache implementation with configurable max size.
 * Items are evicted in LRU order when the cache reaches capacity.
 */

export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /**
   * Get a value from the cache.
   * Updates the item's position to most recently used.
   * @param key - The cache key
   * @returns The cached value, or undefined if not found
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }

    return value;
  }

  /**
   * Store a value in the cache.
   * Updates the item's position to most recently used.
   * Evicts the oldest item if at capacity.
   * @param key - The cache key
   * @param value - The value to cache
   */
  set(key: K, value: V): void {
    // If key exists, delete it first to update LRU order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Check if a key exists in the cache.
   * Does NOT update the item's position.
   * @param key - The cache key
   * @returns True if the key exists
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Remove a specific key from the cache.
   * @param key - The cache key to remove
   * @returns True if the key was removed, false if not found
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (in LRU order - oldest first).
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get all values in the cache (in LRU order - oldest first).
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * Iterate over cache entries [key, value] (in LRU order - oldest first).
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
}
