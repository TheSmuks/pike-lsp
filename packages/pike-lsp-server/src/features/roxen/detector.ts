import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { RoxenModuleInfo } from './types.js';
import { Logger } from '@pike-lsp/core';

type RoxenDetectorBridge = {
  roxenDetect(code: string, filename?: string): Promise<RoxenModuleInfo>;
};

const cache = new Map<string, RoxenModuleInfo | null>();
const log = new Logger('RoxenDetector');

/**
 * Fast text-level pre-filter for Roxen module markers.
 * Used as an early-exit gate before invoking the bridge.
 *
 * Covers all known Roxen markers via cheap string.includes() checks.
 * No regex — register_module and MODULE_ patterns are checked via
 * simple substring inclusion; bridge.roxenDetect() handles full validation.
 */
function hasMarkers(code: string): boolean {
  return (
    code.includes('inherit "module"') ||
    code.includes("inherit 'module'") ||
    code.includes('inherit "filesystem"') ||
    code.includes("inherit 'filesystem'") ||
    code.includes('inherit "roxen"') ||
    code.includes("inherit 'roxen'") ||
    code.includes('#include <module.h>') ||
    code.includes('#include "module.h"') ||
    code.includes('ID_DEFINED') ||
    code.includes('ID_RUNTIME') ||
    code.includes('VERSION_') ||
    code.includes('MODULE_') ||
    code.includes('register_module(')
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

/**
 * Recursively check symbols for a register_ prefixed name.
 */
function hasRegisterSymbol(symbols: PikeSymbol[]): boolean {
  for (const sym of symbols) {
    if (sym.name && sym.name.startsWith('register_')) return true;
    if (sym.children && hasRegisterSymbol(sym.children)) return true;
  }
  return false;
}

/**
 * Single source of truth for Roxen module detection.
 *
 * Combines fast text scanning (hasMarkers) with symbol-table inspection
 * for register_* symbol checks. All callers should delegate to this function.
 * Uses string.includes and startsWith — no regex.
 */
export function isRoxenModule(text: string, symbols?: PikeSymbol[]): boolean {
  if (hasMarkers(text)) return true;

  if (symbols && hasRegisterSymbol(symbols)) return true;

  return false;
}
