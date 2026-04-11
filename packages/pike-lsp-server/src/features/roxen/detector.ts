import type { RoxenModuleInfo } from './types.js';
import { Logger } from '@pike-lsp/core';

type RoxenDetectorBridge = {
  roxenDetect(code: string, filename?: string): Promise<RoxenModuleInfo>;
};

const cache = new Map<string, RoxenModuleInfo | null>();
const log = new Logger('RoxenDetector');

/**
 * Check if code contains a `register_module(` call.
 * Uses string scanning — no regex.
 */
function hasRegisterModule(code: string): boolean {
  let pos = code.indexOf('register_module');
  while (pos !== -1) {
    // Check char before is non-word
    if (pos === 0 || !isWordChar(code.charCodeAt(pos - 1))) {
      let j = pos + 15; // skip 'register_module'
      while (j < code.length && (code[j] === ' ' || code[j] === '\t')) j++;
      if (j < code.length && code[j] === '(') return true;
    }
    pos = code.indexOf('register_module', pos + 1);
  }
  return false;
}

function isWordChar(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f
  );
}

/**
 * Quick check for `module_type = MODULE_` declaration.
 * Uses simple string search — the bridge does authoritative detection.
 */
function hasModuleTypeDecl(code: string): boolean {
  return code.includes('module_type = MODULE_');
}

export function hasMarkers(code: string): boolean {
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
    hasModuleTypeDecl(code) ||
    hasRegisterModule(code)
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
  } catch (error) {
    log.debug('Roxen detection failed', {
      uri,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function invalidateCache(uri: string): void {
  cache.delete(uri);
}
