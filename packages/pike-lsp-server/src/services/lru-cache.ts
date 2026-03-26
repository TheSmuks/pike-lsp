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

export class LRUCache<TKey, TValue> {
    private readonly maxSize: number;
    private readonly sizeEstimator: (value: TValue, key: TKey) => number;
    private readonly cache = new Map<TKey, CacheEntry<TValue>>();
    private currentSize = 0;
    private hits = 0;
    private misses = 0;
    private evictions = 0;

    constructor(options: LRUCacheOptions<TKey, TValue>) {
        if (!Number.isFinite(options.maxSize) || options.maxSize < 0) {
            throw new Error(`maxSize must be a non-negative finite number, got ${String(options.maxSize)}`);
        }

        this.maxSize = Math.floor(options.maxSize);
        this.sizeEstimator = options.sizeEstimator ?? (() => DEFAULT_ENTRY_SIZE);
    }

    get size(): number {
        return this.currentSize;
    }

    get entryCount(): number {
        return this.cache.size;
    }

    has(key: TKey): boolean {
        return this.cache.has(key);
    }

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

    peek(key: TKey): TValue | undefined {
        return this.cache.get(key)?.value;
    }

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

    delete(key: TKey): boolean {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }

        this.currentSize -= entry.size;
        this.cache.delete(key);
        return true;
    }

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

    clear(): void {
        this.cache.clear();
        this.currentSize = 0;
    }

    entries(): Array<[TKey, TValue]> {
        return Array.from(this.cache.entries(), ([key, entry]) => [key, entry.value]);
    }

    getStats(): LRUCacheStats {
        return {
            hits: this.hits,
            misses: this.misses,
            evictions: this.evictions,
            size: this.currentSize,
            maxSize: this.maxSize,
        };
    }

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
