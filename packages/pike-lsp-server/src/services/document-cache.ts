/**
 * Document Cache Management
 *
 * Encapsulates document state management for the LSP server.
 * Extracted from server.ts to enable modular feature handlers.
 */

import type { DocumentCacheEntry } from '../core/types.js';
// PERF-1229: Removed crypto import — replaced SHA-256 with FNV-1a for content hashing.
import { Logger } from '@pike-lsp/core';

const log = new Logger('DocumentCache');

/**
 * FNV-1a 32-bit hash — single canonical implementation.
 */
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * PERF-1229: Compute FNV-1a hash of document content.
 * Non-cryptographic but sufficient for change detection and ~5× faster than SHA-256.
 *
 * @param content - Document text content
 * @returns Hex-encoded FNV-1a hash
 */
export function computeContentHash(content: string): string {
  return fnv1a(content).toString(16).padStart(8, '0');
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
    hashes.push(computeSemanticLineHash(line));
  }

  return hashes;
}

/**
 * Strip line comments from a line of Pike code.
 * Removes content after '//' comment markers and trims whitespace.
 */
export function stripLineComments(line: string): string {
  const commentPos = line.indexOf('//');
  if (commentPos >= 0) {
    line = line.substring(0, commentPos);
  }
  return line.trim();
}

export function computeSemanticLineHash(line: string): number {
  const semantic = stripLineComments(line.trim());
  return fnv1a(semantic);
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
      } catch (error) {
        log.debug('Pending document validation failed while waiting', {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
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
