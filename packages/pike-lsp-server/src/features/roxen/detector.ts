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
 * Single-pass scan: checks all markers in a single O(n) traversal
 * instead of 13 separate O(n) includes() calls.
 */
function hasMarkers(code: string): boolean {
  const len = code.length;
  let pos = 0;

  while (pos < len) {
    const ch = code[pos];

    // Fast path: skip characters that can't start any marker
    if (ch !== '#' && ch !== 'i' && ch !== 'I' && ch !== 'V' && ch !== 'M' && ch !== 'r') {
      pos++;
      continue;
    }

    // Single-char-start markers: ID_DEFINED, ID_RUNTIME
    if (ch === 'I') {
      if (code.startsWith('ID_DEFINED', pos) || code.startsWith('ID_RUNTIME', pos)) return true;
      pos++;
      continue;
    }
    if (ch === 'V' && code.startsWith('VERSION_', pos)) return true;
    if (ch === 'M' && code.startsWith('MODULE_', pos)) return true;
    if (ch === 'r' && code.startsWith('register_module(', pos)) return true;

    // Multi-char-start markers
    if (ch === 'i' && code.startsWith('inherit ', pos)) {
      const off = pos + 8;
      if (
        code.startsWith('"module"', off) ||
        code.startsWith("'module'", off) ||
        code.startsWith('"roxen"', off) ||
        code.startsWith("'roxen'", off) ||
        code.startsWith('"filesystem"', off) ||
        code.startsWith("'filesystem'", off)
      )
        return true;
    }
    if (ch === '#' && code.startsWith('#include ', pos)) {
      const off = pos + 9;
      if (code.startsWith('<module.h>', off) || code.startsWith('"module.h"', off)) return true;
    }

    pos++;
  }
  return false;
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
 * delegate to this function. Single-pass scan — no regex.
 */
export function isRoxenModule(text: string, symbols?: PikeSymbol[]): boolean {
  if (symbols && hasInheritSymbol(symbols)) return true;

  if (hasMarkers(text)) return true;

  if (symbols && hasRegisterSymbol(symbols)) return true;

  return false;
}
