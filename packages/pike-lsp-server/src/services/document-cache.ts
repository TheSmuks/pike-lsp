/**
 * Document Cache Management
 *
 * Encapsulates document state management for the LSP server.
 * Extracted from server.ts to enable modular feature handlers.
 */

import type { DocumentCacheEntry } from '../core/types.js';

/**
 * Document cache for parsed symbols and diagnostics.
 *
 * Manages the cache of parsed documents, providing O(1) access
 * to document information by URI.
 */
export class DocumentCache {
    private cache = new Map<string, DocumentCacheEntry>();
    private pending = new Map<string, Promise<void>>();

    /**
     * Get cached document information.
     * @param uri - Document URI
     * @returns Cached entry or undefined if not cached
     */
    get(uri: string): DocumentCacheEntry | undefined {
        return this.cache.get(uri);
    }

    /**
     * Set cached document information.
     * @param uri - Document URI
     * @param entry - Document cache entry to store
     */
    set(uri: string, entry: DocumentCacheEntry): void {
        this.cache.set(uri, entry);
    }

    /**
     * Mark a document as being validated.
     * @param uri - Document URI
     * @param promise - Validation promise
     */
    setPending(uri: string, promise: Promise<void>): void {
        this.pending.set(uri, promise);
        promise.finally(() => {
            if (this.pending.get(uri) === promise) {
                this.pending.delete(uri);
            }
        });
    }

    /**
     * Wait for any pending validation for the document.
     * @param uri - Document URI
     * @returns Promise that resolves when validation is complete (or immediately if none pending)
     */
    async waitFor(uri: string): Promise<void> {
        const pending = this.pending.get(uri);
        if (pending) {
            try {
                await pending;
            } catch (e) {
                // Ignore errors, caller will check cache
            }
        }
    }


    /**
     * Remove document from cache.
     * @param uri - Document URI to remove
     * @returns true if document was in cache, false otherwise
     */
    delete(uri: string): boolean {
        return this.cache.delete(uri);
    }

    /**
     * Check if document is in cache.
     * @param uri - Document URI
     * @returns true if document is cached
     */
    has(uri: string): boolean {
        return this.cache.has(uri);
    }

    /**
     * Clear all cached documents.
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get all cached document entries.
     * @returns Iterable of [uri, entry] tuples
     */
    entries(): IterableIterator<[string, DocumentCacheEntry]> {
        return this.cache.entries();
    }

    /**
     * Get all cached document URIs.
     * @returns Iterable of document URIs
     */
    keys(): IterableIterator<string> {
        return this.cache.keys();
    }

    /**
     * Get the number of cached documents.
     * @returns Cache size
     */
    get size(): number {
        return this.cache.size;
    }
}
