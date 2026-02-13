import { PikeBridge } from '@pike-lsp/pike-bridge';
import type { RoxenModuleInfo } from './types.js';

const cache = new Map<string, RoxenModuleInfo | null>();

function hasMarkers(code: string): boolean {
  return (
    // Inherit patterns
    code.includes('inherit "module"') ||
    code.includes("inherit 'module'") ||
    code.includes('inherit "filesystem"') ||
    code.includes("inherit 'filesystem'") ||
    code.includes('inherit "roxen"') ||
    code.includes("inherit 'roxen'") ||
    // Include patterns (both <> and "" variants)
    code.includes('#include <module.h>') ||
    code.includes('#include "module.h"') ||
    // Module type constant patterns (multiple assignment styles)
    /constant\s+(int\s+)?module_type\s*=\s*MODULE_/.test(code) ||
    /constant\s+(int\s+)?module_type\s*=\s*1\s*<<\s*\d+/.test(code) ||
    /constant\s+(int\s+)?module_type\s*=\s*\d+/.test(code) ||
    // Direct module type constant reference
    code.includes('MODULE_TAG') ||
    code.includes('MODULE_LOCATION') ||
    code.includes('MODULE_FILTER') ||
    // defvar pattern
    code.includes('defvar(')
  );
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
