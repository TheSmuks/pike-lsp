import type { PikeSymbol } from '@pike-lsp/pike-bridge';
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
 * Quick check for MODULE_* constant references.
 * Covers both `module_type = MODULE_*` declarations and standalone MODULE_* constants.
 */
function hasModuleTypeDecl(code: string): boolean {
  return code.includes('MODULE_');
}

/**
 * Fast text-level scan for Roxen module markers.
 * Used as the early-exit gate before invoking the bridge.
 *
 * Covers all known Roxen markers:
 * - inherit "module" / "roxen" / "filesystem" (single/double quoted)
 * - #include <module.h> / "module.h"
 * - module_type = MODULE_* declaration
 * - register_module() call
 * - ID_DEFINED, ID_RUNTIME, VERSION_ constants (Roxen metadata macros)
 * - standalone MODULE_ constant references
 */
function hasMarkers(code: string): boolean {
  const hasRoxenInheritance =
    code.includes('inherit "module"') ||
    code.includes("inherit 'module'") ||
    code.includes('inherit "filesystem"') ||
    code.includes("inherit 'filesystem'") ||
    code.includes('inherit "roxen"') ||
    code.includes("inherit 'roxen'");

  if (hasRoxenInheritance) return true;

  if (code.includes('#include <module.h>') || code.includes('#include "module.h"')) return true;

  if (hasModuleTypeDecl(code)) return true;

  if (hasRegisterModule(code)) return true;

  // Roxen metadata constant markers
  if (code.includes('ID_DEFINED') || code.includes('ID_RUNTIME') || code.includes('VERSION_')) {
    return true;
  }

  return false;
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
