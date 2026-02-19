/**
 * RXML Tag Catalog Manager
 *
 * Manages the unified tag catalog from multiple sources:
 * - Built-in tags (from tag-catalog.ts)
 * - Server tags (from running Roxen server)
 * - Custom module tags (from local .pike files)
 *
 * Merge priority: custom > built-in > server
 * Custom tags override built-in, built-in override server.
 */

import type { RXMLTagCatalogEntry } from './types.js';
import { rxmlTagCatalogCache } from './cache.js';

/**
 * Tag source identifier for debugging
 */
export type TagSource = 'builtin' | 'server' | 'custom';

/**
 * Catalog entry with source tracking
 */
interface TagWithSource extends RXMLTagCatalogEntry {
    source: TagSource;
}

/**
 * Tag catalog manager
 *
 * Provides unified access to RXML tags from all sources.
 */
export class RXMLTagCatalogManager {
    private cache = rxmlTagCatalogCache;

    /**
     * Get unified tag catalog for a server instance
     *
     * @param serverPid - Server process ID
     * @param serverName - Server name (e.g., "localhost:9000")
     * @param builtinTags - Built-in tag catalog
     * @param serverTags - Tags from running Roxen server
     * @param customTags - Tags from custom modules
     * @returns Merged tag catalog
     */
    async getCatalog(
        serverPid: number,
        serverName: string,
        builtinTags: RXMLTagCatalogEntry[],
        serverTags: RXMLTagCatalogEntry[],
        customTags: RXMLTagCatalogEntry[]
    ): Promise<RXMLTagCatalogEntry[]> {
        // Check cache first
        const cached = this.cache.get(serverPid, serverName);
        if (cached) {
            return cached;
        }

        // Merge tags from all sources
        const merged = mergeTags(builtinTags, serverTags, customTags);

        // Cache the result
        this.cache.set(serverPid, serverName, merged);

        return merged;
    }

    /**
     * Refresh catalog for a specific server
     *
     * Fetches fresh tags from server and updates cache.
     *
     * @param serverPid - Server process ID
     * @param serverName - Server name
     * @param builtinTags - Built-in tag catalog
     * @param serverTags - Fresh tags from server
     * @param customTags - Tags from custom modules
     */
    async refreshCatalog(
        serverPid: number,
        serverName: string,
        builtinTags: RXMLTagCatalogEntry[],
        serverTags: RXMLTagCatalogEntry[],
        customTags: RXMLTagCatalogEntry[]
    ): Promise<void> {
        // Invalidate old cache
        this.cache.invalidate(serverPid, serverName);

        // Merge and cache fresh data
        const merged = mergeTags(builtinTags, serverTags, customTags);
        this.cache.set(serverPid, serverName, merged);
    }

    /**
     * Invalidate cache for a specific server
     *
     * Use this when server restarts (PID changes).
     *
     * @param serverPid - Server process ID
     * @param serverName - Server name
     */
    invalidateServer(serverPid: number, serverName: string): void {
        this.cache.invalidate(serverPid, serverName);
    }

    /**
     * Clear all cached catalogs
     */
    clearAll(): void {
        this.cache.clear();
    }
}

/**
 * Merge tags from multiple sources
 *
 * Priority order: custom > built-in > server
 * Custom tags override built-in, built-in override server.
 *
 * @param builtin - Built-in tags
 * @param server - Server tags
 * @param custom - Custom module tags
 * @returns Merged tag catalog
 */
export function mergeTags(
    builtin: RXMLTagCatalogEntry[],
    server: RXMLTagCatalogEntry[],
    custom: RXMLTagCatalogEntry[]
): RXMLTagCatalogEntry[] {
    // Build tag map with priority ordering
    const tagMap = new Map<string, TagWithSource>();

    // Add server tags (lowest priority)
    for (const tag of server) {
        tagMap.set(tag.name, { ...tag, source: 'server' });
    }

    // Add built-in tags (override server)
    for (const tag of builtin) {
        tagMap.set(tag.name, { ...tag, source: 'builtin' });
    }

    // Add custom tags (highest priority - override everything)
    for (const tag of custom) {
        tagMap.set(tag.name, { ...tag, source: 'custom' });
    }

    // Convert map back to array
    const result: RXMLTagCatalogEntry[] = [];
    for (const tag of tagMap.values()) {
        const { source: _source, ...entry } = tag;
        result.push(entry);
    }

    return result;
}

/**
 * Singleton catalog manager instance
 */
export const rxmlTagCatalogManager = new RXMLTagCatalogManager();
