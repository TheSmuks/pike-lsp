/**
 * Generic LRU (Least Recently Used) Cache
 *
 * Supports two construction patterns:
 *   new LRUCache(maxSize)               — count-based, each entry costs 1
 *   new LRUCache({ maxSize, ...opts })  — weighted size, custom estimators, stats
 */

export interface LRUCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
}

export interface LRUCacheOptions<TKey, TValue> {
  maxSize: number;
  sizeEstimator?: (value: TValue, key: TKey) => number;
}

interface CacheEntry<TValue> {
  value: TValue;
  size: number;
}

const DEFAULT_ENTRY_SIZE = 1;

/**
 * Generic LRU cache backed by Map insertion order.
 *
 * @example Count-based (simple)
 *   const cache = new LRUCache<string, number>(100);
 *
 * @example Weighted-size with stats
 *   const cache = new LRUCache<string, string>({
 *     maxSize: 4096,
 *     sizeEstimator: (v) => v.length,
 *   });
 */
export class LRUCache<TKey, TValue> {
  private readonly maxSize: number;
  private readonly sizeEstimator: (value: TValue, key: TKey) => number;
  private readonly cache = new Map<TKey, CacheEntry<TValue>>();
  private currentSize = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(maxSize?: number);
  constructor(options: LRUCacheOptions<TKey, TValue>);
  constructor(optionsOrMaxSize?: number | LRUCacheOptions<TKey, TValue>) {
    if (typeof optionsOrMaxSize === 'number' || optionsOrMaxSize === undefined) {
      this.maxSize = optionsOrMaxSize ?? 500;
      this.sizeEstimator = () => DEFAULT_ENTRY_SIZE;
    } else {
      const { maxSize, sizeEstimator } = optionsOrMaxSize;
      if (!Number.isFinite(maxSize) || maxSize < 0) {
        throw new Error(`maxSize must be a non-negative finite number, got ${String(maxSize)}`);
      }
      this.maxSize = Math.floor(maxSize);
      this.sizeEstimator = sizeEstimator ?? (() => DEFAULT_ENTRY_SIZE);
    }
  }

  /** Current weighted size of the cache. */
  get size(): number {
    return this.currentSize;
  }

  /** Number of entries in the cache. */
  get entryCount(): number {
    return this.cache.size;
  }

  /**
   * Check if a key exists in the cache.
   * Does NOT update the item's position.
   */
  has(key: TKey): boolean {
    return this.cache.has(key);
  }

  /**
   * Get a value from the cache.
   * Updates the item's position to most recently used.
   * Tracks hits and misses for stats.
   */
  get(key: TKey): TValue | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    this.hits += 1;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  /**
   * Get a value without updating LRU position or stats.
   */
  peek(key: TKey): TValue | undefined {
    return this.cache.get(key)?.value;
  }

  /**
   * Store a value in the cache.
   *
   * Count-based usage always succeeds (returns true).
   * Weighted-size usage returns false when the entry
   * exceeds the total cache capacity.
   */
  set(key: TKey, value: TValue): boolean {
    const entrySize = this.normalizeSize(this.sizeEstimator(value, key));
    const previous = this.cache.get(key);

    if (entrySize > this.maxSize) {
      if (previous) {
        this.delete(key);
      }
      return false;
    }

    if (previous) {
      this.currentSize -= previous.size;
      this.cache.delete(key);
    }

    while (this.currentSize + entrySize > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    if (this.currentSize + entrySize > this.maxSize) {
      return false;
    }

    this.cache.set(key, { value, size: entrySize });
    this.currentSize += entrySize;
    return true;
  }

  /**
   * Remove a specific key from the cache.
   * @returns True if the key was removed, false if not found
   */
  delete(key: TKey): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.currentSize -= entry.size;
    this.cache.delete(key);
    return true;
  }

  /**
   * Evict a specific number of the least-recently-used entries.
   * @returns Array of evicted keys
   */
  evict(count = 1): TKey[] {
    const keys: TKey[] = [];
    const evictionCount = Math.max(0, Math.floor(count));
    for (let i = 0; i < evictionCount; i += 1) {
      const key = this.evictOldest();
      if (key === undefined) {
        break;
      }
      keys.push(key);
    }
    return keys;
  }

  /** Clear all cached entries. */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /** Get all keys in LRU order (oldest first). */
  keys(): IterableIterator<TKey> {
    return this.cache.keys();
  }

  /** Get all values in LRU order (oldest first). */
  *values(): IterableIterator<TValue> {
    for (const entry of this.cache.values()) {
      yield entry.value;
    }
  }

  /**
   * Return all entries as [key, value] pairs in LRU order.
   */
  entries(): Array<[TKey, TValue]> {
    return Array.from(this.cache.entries(), ([key, entry]) => [key, entry.value]);
  }

  /** Cache hit/miss/eviction statistics. */
  getStats(): LRUCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.currentSize,
      maxSize: this.maxSize,
    };
  }

  /** Hit rate as a fraction 0..1. Returns 0 when there are no accesses. */
  getHitRate(): number {
    const total = this.hits + this.misses;
    if (total === 0) {
      return 0;
    }
    return this.hits / total;
  }

  private evictOldest(): TKey | undefined {
    const oldest = this.cache.entries().next();
    if (oldest.done) {
      return undefined;
    }

    const [key, entry] = oldest.value;
    this.cache.delete(key);
    this.currentSize -= entry.size;
    this.evictions += 1;
    return key;
  }

  private normalizeSize(size: number): number {
    if (!Number.isFinite(size) || size <= 0) {
      return DEFAULT_ENTRY_SIZE;
    }
    return Math.ceil(size);
  }
}
