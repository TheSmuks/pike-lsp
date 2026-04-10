/**
 * Bridge Resolution Cache
 *
 * Serialization and deserialization of module/stdlib resolution caches
 * for persistence across bridge restarts.
 */

export function serializeResolutionCaches(
  stdlibResolveCache: Map<string, import('./types.js').StdlibResolveResult>,
  moduleResolveCache: Map<string, string | null>
): string {
  const stdlibEntries: Record<string, unknown> = {};
  for (const [key, value] of stdlibResolveCache) {
    stdlibEntries[key] = value;
  }
  const moduleEntries: Record<string, string | null> = {};
  for (const [key, value] of moduleResolveCache) {
    moduleEntries[key] = value;
  }
  return JSON.stringify({ version: 1, stdlibCache: stdlibEntries, moduleCache: moduleEntries });
}

export function loadResolutionCaches(
  serialized: string,
  stdlibResolveCache: Map<string, import('./types.js').StdlibResolveResult>,
  moduleResolveCache: Map<string, string | null>
): number {
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return 0;
    if (parsed['version'] !== 1) return 0;

    let count = 0;
    if (parsed['stdlibCache'] && typeof parsed['stdlibCache'] === 'object') {
      const stdlib = parsed['stdlibCache'] as Record<string, unknown>;
      for (const [key, value] of Object.entries(stdlib)) {
        if (value && typeof value === 'object') {
          stdlibResolveCache.set(key, value as import('./types.js').StdlibResolveResult);
          count += 1;
        }
      }
    }
    if (parsed['moduleCache'] && typeof parsed['moduleCache'] === 'object') {
      const modules = parsed['moduleCache'] as Record<string, unknown>;
      for (const [key, value] of Object.entries(modules)) {
        if (typeof value === 'string' || value === null) {
          moduleResolveCache.set(key, value);
          count += 1;
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export function getResolutionCacheStats(
  stdlibResolveCache: Map<string, unknown>,
  moduleResolveCache: Map<string, unknown>
): { stdlib: number; modules: number } {
  return { stdlib: stdlibResolveCache.size, modules: moduleResolveCache.size };
}
