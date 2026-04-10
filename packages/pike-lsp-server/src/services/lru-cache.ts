/**
 * Re-export from the canonical LRUCache implementation in utils/.
 *
 * The services/ location is retained so that existing imports through
 * services/index.ts continue to resolve without a breaking change.
 */
export { LRUCache, type LRUCacheOptions, type LRUCacheStats } from '../utils/lru-cache.js';
