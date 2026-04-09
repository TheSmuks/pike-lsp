/**
 * Shared LRU-bounded file content cache for RXML providers.
 *
 * Replaces the unbounded Map<string, {mtimeMs; content}> that existed in
 * both definition-provider.ts and references-provider.ts (issue #1274).
 *
 * Uses the project's generic LRUCache with a configurable max-size so that
 * workspaces with many .pike/.rxml files cannot grow this cache indefinitely.
 * Files are still validated against mtime before reuse.
 */

import { readFile, stat } from 'fs/promises';
import { Logger } from '@pike-lsp/core';
import { LRUCache } from '../../utils/lru-cache.js';

interface FileContentEntry {
  mtimeMs: number;
  content: string;
}

const DEFAULT_MAX_FILES = 200;

const log = new Logger('RXMLFileContentCache');

/** LRU-bounded cache — oldest entries are evicted when capacity is reached. */
const cache = new LRUCache<string, FileContentEntry>(DEFAULT_MAX_FILES);

/**
 * Read a file through the LRU cache. Returns cached content when the file's
 * mtimeMs matches the cached value; otherwise re-reads from disk.
 *
 * On stat failure (file deleted mid-scan etc.) falls through to a direct
 * read which will propagate the ENOENT to the caller.
 */
export async function readFileCached(filePath: string): Promise<string> {
  try {
    const fileStats = await stat(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === fileStats.mtimeMs) {
      return cached.content;
    }

    const content = await readFile(filePath, 'utf-8');
    cache.set(filePath, { mtimeMs: fileStats.mtimeMs, content });
    return content;
  } catch (error) {
    log.debug('RXML read-through cache miss fallback', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return readFile(filePath, 'utf-8');
  }
}

/**
 * Invalidate a single URI from the cache.
 * Accepts a URI string (file://…) and converts to a file-system path.
 */
export function invalidateFileContentCache(uri: string): void {
  cache.delete(uriToFilePath(uri));
}

/** Clear the entire file content cache. */
export function clearFileContentCache(): void {
  cache.clear();
}

/** Expose current entry count for diagnostics / testing. */
export function getFileContentCacheSize(): number {
  return cache.size;
}

function uriToFilePath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}
