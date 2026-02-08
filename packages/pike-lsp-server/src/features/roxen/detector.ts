import { PikeBridge } from '@pike-lsp/pike-bridge';
import type { RoxenModuleInfo } from './types.js';

const cache = new Map<string, RoxenModuleInfo | null>();

function hasMarkers(code: string): boolean {
  return code.includes('inherit "module"') || code.includes('#include <module.h>');
}

export async function detectRoxenModule(
  code: string,
  uri: string,
  bridge: PikeBridge
): Promise<RoxenModuleInfo | null> {
  if (!hasMarkers(code)) return null;

  const cached = cache.get(uri);
  if (cached) return cached;

  try {
    const result = await bridge.roxenDetect(code, uri);
    const info = result.is_roxen_module === 1 ? result : null;
    cache.set(uri, info);
    return info;
  } catch {
    return null;
  }
}

export function invalidateCache(uri: string): void {
  cache.delete(uri);
}
