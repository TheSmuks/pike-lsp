import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { RoxenModuleInfo } from './types.js';
import { Logger } from '@pike-lsp/core';

type RoxenDetectorBridge = {
  roxenDetect(code: string, filename?: string): Promise<RoxenModuleInfo>;
};

const cache = new Map<string, RoxenModuleInfo | null>();
const log = new Logger('RoxenDetector');

/**
 * Text-level marker check for synchronous Roxen detection.
 * Uses string.includes — no regex.
 */
function hasMarkers(code: string): boolean {
  return (
    code.includes('inherit "module"') ||
    code.includes("inherit 'module'") ||
    code.includes('inherit "roxen"') ||
    code.includes("inherit 'roxen'") ||
    code.includes('inherit "filesystem"') ||
    code.includes("inherit 'filesystem'") ||
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
  const cached = cache.get(uri);
  if (cached !== undefined) return cached;

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
 * Recursively check symbols for an inherit of module/roxen/filesystem.
 */
function hasInheritSymbol(symbols: PikeSymbol[]): boolean {
  for (const sym of symbols) {
    if (
      sym.kind === 'inherit' &&
      sym.classname &&
      ['module', 'roxen', 'filesystem'].includes(sym.classname)
    ) {
      return true;
    }
    if (sym.children && hasInheritSymbol(sym.children)) return true;
  }
  return false;
}

/**
 * Single source of truth for Roxen module detection.
 *
 * Combines symbol-table inspection (inherit + register_ checks) with
 * fast text scanning (hasMarkers) as fallback. All callers should
 * delegate to this function. Uses string.includes — no regex.
 */
export function isRoxenModule(text: string, symbols?: PikeSymbol[]): boolean {
  if (symbols && hasInheritSymbol(symbols)) return true;

  if (hasMarkers(text)) return true;

  if (symbols && hasRegisterSymbol(symbols)) return true;

  return false;
}
