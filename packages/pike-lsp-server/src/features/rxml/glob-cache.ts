/**
 * Glob Result Cache for RXML Providers
 *
 * Caches glob pattern results to avoid repeated file system scans.
 * Each workspace folder has its own cache entry with TTL.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export class GlobCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private readonly ttlMs: number;

    constructor(ttlSeconds: number = 30) {
        this.ttlMs = ttlSeconds * 1000;
    }

    private makeKey(pattern: string, cwd: string): string {
        return `${pattern}:${cwd}`;
    }

    get(pattern: string, cwd: string): T | undefined {
        const key = this.makeKey(pattern, cwd);
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.data;
    }

    set(pattern: string, cwd: string, data: T): void {
        const key = this.makeKey(pattern, cwd);
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
        });
    }

    invalidate(cwd: string): void {
        // Remove all entries for a given cwd
        for (const key of this.cache.keys()) {
            if (key.endsWith(`:${cwd}`)) {
                this.cache.delete(key);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }

    getStats(): { size: number } {
        return { size: this.cache.size };
    }
}
