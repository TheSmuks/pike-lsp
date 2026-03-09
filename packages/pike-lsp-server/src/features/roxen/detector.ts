import type { RoxenModuleInfo } from './types.js';

type RoxenDetectorBridge = {
  roxenDetect(code: string, filename?: string): Promise<RoxenModuleInfo>;
};

const cache = new Map<string, RoxenModuleInfo | null>();

function hasMarkers(code: string): boolean {
  const hasRoxenInheritance =
    code.includes('inherit "module"') ||
    code.includes("inherit 'module'") ||
    code.includes('inherit "filesystem"') ||
    code.includes("inherit 'filesystem'") ||
    code.includes('inherit "roxen"') ||
    code.includes("inherit 'roxen'");

  return (
    hasRoxenInheritance ||
    code.includes('#include <module.h>') ||
    code.includes('#include "module.h"') ||
    /constant\s+(int\s+)?module_type\s*=\s*MODULE_/.test(code) ||
    /register_module\s*\(/.test(code)
  );
}

export async function detectRoxenModule(
  code: string,
  uri: string,
  bridge: RoxenDetectorBridge
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
