/**
 * Document Cache Management
 *
 * Encapsulates document state management for the LSP server.
 * Extracted from server.ts to enable modular feature handlers.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Diagnostic, Position } from 'vscode-languageserver/node';
import type { DocumentCacheEntry } from '../core/types.js';

/**
 * Document cache for parsed symbols and diagnostics.
 *
 * Manages the cache of parsed documents, providing O(1) access
 * to document information by URI.
 */
export class DocumentCache {
    private cache = new Map<string, DocumentCacheEntry>();

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
