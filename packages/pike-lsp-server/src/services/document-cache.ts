/**
 * Document Cache Management
 *
 * Encapsulates document state management for the LSP server.
 * Extracted from server.ts to enable modular feature handlers.
 */

import type { DocumentCacheEntry } from '../core/types.js';
import { createHash } from 'crypto';

/**
 * INC-002: Compute SHA-256 hash of document content.
 * Used for detecting if semantic content has changed.
 *
 * @param content - Document text content
 * @returns Hex-encoded SHA-256 hash
 */
export function computeContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

/**
 * INC-002: Compute hash of each line's semantic content.
 * Comments and whitespace are normalized to detect semantic changes only.
 *
 * @param content - Document text content
 * @returns Array of hash codes for each line
 */
export function computeLineHashes(content: string): number[] {
    const lines = content.split('\n');
    const hashes: number[] = [];

    for (const line of lines) {
        // Remove comments and normalize whitespace
        const semantic = stripComments(line.trim());
        // Simple hash for quick comparison
        hashes.push(simpleHash(semantic));
    }

    return hashes;
}

/**
 * INC-002: Strip comments from a line of Pike code.
 * Handles both line comments (//) and removes whitespace.
 */
function stripComments(line: string): string {
    // Find line comment position
    const commentPos = line.indexOf('//');
    if (commentPos >= 0) {
        line = line.substring(0, commentPos);
    }
    return line.trim();
}

/**
 * INC-002: Simple string hash for quick line comparison.
 * Uses FNV-1a algorithm for fast hashing.
 */
function simpleHash(str: string): number {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619); // FNV prime
    }
    return hash >>> 0; // Convert to unsigned 32-bit
}

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
     * Get existing entry or set a new one atomically.
     * Avoids double lookup when entry might need to be computed.
     *
     * @param uri - Document URI
     * @param factory - Function to create entry if not cached
     * @returns Existing or newly created entry
     */
    getOrSet(uri: string, factory: () => DocumentCacheEntry): DocumentCacheEntry {
        const existing = this.cache.get(uri);
        if (existing !== undefined) {
            return existing;
        }
        const entry = factory();
        this.cache.set(uri, entry);
        return entry;
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
            } catch {
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
