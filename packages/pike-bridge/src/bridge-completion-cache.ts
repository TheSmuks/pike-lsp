/**
 * Bridge Completion Cache
 *
 * Tokenization caching for completion context optimization.
 * Caches split tokens per document version to avoid re-tokenizing
 * entire files on every completion request.
 */

import type { RequestSender } from './bridge-analysis.js';

/**
 * Cached tokenization data for a document.
 * PERF-003: Only splitTokens are cached since PikeToken objects are not JSON-serializable.
 */
export interface CachedTokens {
  /** Document version (LSP version number) */
  version: number;
  /** Split tokens from Parser.Pike.split (JSON-serializable string array) */
  splitTokens: string[];
  /** Cache timestamp for LRU eviction */
  timestamp: number;
}

/** PERF-003: Maximum number of cached documents */
const MAX_TOKEN_CACHE_SIZE = 50;

/**
 * Get completion context at a specific position using Pike's tokenizer.
 *
 * PERF-003: When documentUri and version are provided, caches tokenization
 * results to avoid re-tokenizing the entire file on every completion.
 */
export async function getCompletionContext(
  sender: RequestSender,
  tokenCache: Map<string, CachedTokens>,
  debugLog: (message: string) => void,
  params: {
    code: string;
    line: number;
    character: number;
    documentUri?: string | undefined;
    documentVersion?: number | undefined;
  }
): Promise<import('./types.js').CompletionContext> {
  const { code, line, character, documentUri, documentVersion } = params;

  // Try to use cached tokenization if document version matches
  if (documentUri && documentVersion !== undefined) {
    const cached = tokenCache.get(documentUri);
    if (cached && cached.version === documentVersion) {
      debugLog(`Using cached tokens for ${documentUri} (version ${documentVersion})`);

      try {
        const result = await sender.sendRequest<import('./types.js').CompletionContext>(
          'get_completion_context_cached',
          {
            code,
            line,
            character,
            splitTokens: cached.splitTokens,
          }
        );
        return result;
      } catch (err) {
        debugLog(
          `Cached completion context failed, falling back to full tokenization: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Full tokenization needed
  const result = await sender.sendRequest<
    {
      splitTokens?: string[];
    } & import('./types.js').CompletionContext
  >('get_completion_context', {
    code,
    line,
    character,
  });

  // Cache the splitTokens for future use
  if (documentUri && documentVersion !== undefined && result.splitTokens) {
    evictOldEntries(tokenCache);

    tokenCache.set(documentUri, {
      version: documentVersion,
      splitTokens: result.splitTokens,
      timestamp: Date.now(),
    });
    debugLog(`Cached tokens for ${documentUri} (version ${documentVersion})`);
  }

  return result as import('./types.js').CompletionContext;
}

/**
 * Evict oldest cache entries if cache exceeds maximum size.
 */
export function evictOldEntries(tokenCache: Map<string, CachedTokens>): void {
  if (tokenCache.size <= MAX_TOKEN_CACHE_SIZE) {
    return;
  }

  const entries = Array.from(tokenCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);

  const toRemove = entries.slice(0, tokenCache.size - MAX_TOKEN_CACHE_SIZE);
  for (const [uri] of toRemove) {
    tokenCache.delete(uri);
  }
}
