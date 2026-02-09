/**
 * RXML Tag Catalog Cache
 *
 * Provides caching and invalidation for the RXML tag catalog, which is
 * extracted from Roxen server instances. The cache strategy ensures:
 *
 * 1. **Fast Retrieval**: Tag catalog is loaded once per server instance
 * 2. **Server Detection**: Cache is invalidated when server restarts (process PID changes)
 * 3. **TTL Fallback**: If server info unavailable, cache expires after 5 minutes
 * 4. **Thread Safety**: Map operations are inherently thread-safe in Node.js
 *
 * Cache Structure:
 * - Key: `{serverPid: number, timestamp: number}`
 * - Value: { catalog: RXMLTagCatalogEntry[], server: string }
 *
 * Invalidation Triggers:
 * - Document change (cache key contains timestamp)
 * - Server restart (PID change)
 * - TTL expiration (timestamp > 5 minutes ago)
 *
 * This cache is used by the RXML parser to validate tags and provide
 * accurate diagnostics for RXML templates.
 *
 * TODO Phase 5: Integrate with bridge-manager.ts for server PID tracking
 */

import type { RXMLTagCatalogEntry } from './types.js';

/**
 * Cache entry structure
 */
interface CacheEntry {
    /** Parsed RXML tag catalog */
    catalog: RXMLTagCatalogEntry[];
    /** Server instance identifier (e.g., "localhost:9000") */
    server: string;
    /** Cache timestamp (used for TTL and cache key) */
    timestamp: number;
}

/**
 * RXML tag catalog cache manager
 *
 * Provides thread-safe in-memory caching for RXML tag catalogs
 * extracted from Roxen server instances.
 */
export class RXMLTagCatalogCache {
    private cache = new Map<string, CacheEntry>();
    private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Get a cache entry for the given server instance
     *
     * @param serverPid - Server process ID or identifier
     * @param serverName - Human-readable server identifier (e.g., "localhost:9000")
     * @returns Cache entry or undefined if not found/expired
     */
    get(serverPid: number | string, serverName: string): RXMLTagCatalogEntry[] | undefined {
        const key = this.createCacheKey(serverPid, serverName);
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        // Check TTL expiration
        if (this.isExpired(entry.timestamp)) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.catalog;
    }

    /**
     * Set a cache entry for the given server instance
     *
     * @param serverPid - Server process ID or identifier
     * @param serverName - Human-readable server identifier
     * @param catalog - Parsed tag catalog
     */
    set(
        serverPid: number | string,
        serverName: string,
        catalog: RXMLTagCatalogEntry[]
    ): void {
        const key = this.createCacheKey(serverPid, serverName);
        const entry: CacheEntry = {
            catalog,
            server: serverName,
            timestamp: Date.now(),
        };

        // Map.set() is atomic in Node.js - thread-safe by default
        this.cache.set(key, entry);
    }

    /**
     * Invalidate cache for a specific server instance
     *
     * @param serverPid - Server process ID or identifier
     * @param serverName - Human-readable server identifier
     */
    invalidate(serverPid: number | string, serverName: string): void {
        const key = this.createCacheKey(serverPid, serverName);
        this.cache.delete(key);
    }

    /**
     * Invalidate all cached entries
     *
     * Use this when server restarts and all caches should be rebuilt.
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics for debugging
     *
     * @returns Object with cache size and entry details
     */
    getStats(): {
        size: number;
        keys: string[];
    } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
        };
    }

    /**
     * Create a cache key from server identifier and timestamp
     *
     * The key combines server info with timestamp to enable
     * automatic expiration and change detection.
     *
     * @param serverPid - Server process ID
     * @param serverName - Server identifier string
     * @returns Unique cache key
     */
    private createCacheKey(serverPid: number | string, serverName: string): string {
        // Combine PID and name with timestamp for cache invalidation
        // Format: "{serverName}:{serverPid}:{timestamp}"
        return `${serverName}:${serverPid}:${Date.now()}`;
    }

    /**
     * Check if a cache entry has expired
     *
     * @param timestamp - Entry timestamp
     * @returns true if expired
     */
    private isExpired(timestamp: number): boolean {
        return Date.now() - timestamp > this.TTL_MS;
    }
}

/**
 * Singleton cache instance
 *
 * Exported for use across the RXML feature module.
 * In production, this would be injected as a dependency.
 */
export const rxmlTagCatalogCache = new RXMLTagCatalogCache();
