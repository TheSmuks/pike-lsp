/**
 * Bridge Options and Define Resolution
 *
 * Configuration types for PikeBridge and helper functions for
 * resolving preprocessor defines from options and files.
 */

import * as fs from 'fs';

/**
 * Configuration options for the PikeBridge.
 */
export interface PikeBridgeOptions {
  /** Path to Pike executable. Defaults to 'pike'. */
  pikePath?: string;
  /** Path to analyzer.pike script. Auto-detected if not specified. */
  analyzerPath?: string;
  /** Request timeout in milliseconds. Defaults to 30000 (30 seconds). */
  timeout?: number;
  /** Enable debug logging to stderr. */
  debug?: boolean;
  env?: NodeJS.ProcessEnv;
  defines?: string[];
  defineFiles?: string[];
  /** Rate limiting options (disabled by default). */
  rateLimit?: {
    /** Maximum number of requests allowed. Defaults to 100. */
    maxRequests?: number;
    /** Time window in seconds. Defaults to 10. */
    windowSeconds?: number;
  };
}

/**
 * Internal options with all required properties (as used internally).
 */
export interface InternalBridgeOptions {
  pikePath: string;
  analyzerPath: string;
  timeout: number;
  debug: boolean;
  env: NodeJS.ProcessEnv;
  processArgs: string[];
  defineNames: Set<string>;
}

/**
 * Result of a bridge health check.
 */
export interface BridgeHealthCheck {
  /** Whether Pike executable is available. */
  pikeAvailable: boolean;
  /** Detected Pike version (e.g., "8.0"). */
  pikeVersion: string | null;
  /** Whether analyzer.pike script exists. */
  analyzerExists: boolean;
  /** Path to the analyzer script. */
  analyzerPath: string;
  /** Whether the bridge can start successfully. */
  canStart: boolean;
  /** Error message if health check failed. */
  error?: string;
}

function normalizeDefine(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

function collectDefinesFromFiles(
  defineFiles: string[],
  debugLog: (message: string) => void
): string[] {
  const fromFiles: string[] = [];
  for (const filePath of defineFiles) {
    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
      continue;
    }
    try {
      const raw = fs.readFileSync(trimmedPath, 'utf8');
      for (const line of raw.split(/\r?\n/u)) {
        const withoutComment = line.split('#', 1)[0] ?? '';
        const define = normalizeDefine(withoutComment);
        if (define) {
          fromFiles.push(define);
        }
      }
    } catch (error) {
      debugLog(
        `Failed to read define file "${trimmedPath}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return fromFiles;
}

export function resolveDefineEntries(
  defines: string[] | undefined,
  defineFiles: string[] | undefined,
  debugLog: (message: string) => void
): string[] {
  const inlineDefines = (defines ?? []).map(normalizeDefine).filter((v): v is string => Boolean(v));
  const fileDefines = collectDefinesFromFiles(defineFiles ?? [], debugLog);
  return [...inlineDefines, ...fileDefines];
}

export function buildProcessArgs(defineEntries: string[]): string[] {
  return defineEntries.map(value => `-D${value}`);
}

function extractDefineName(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }

  const eq = trimmed.indexOf('=');
  const candidate = (eq >= 0 ? trimmed.slice(0, eq) : trimmed).trim();
  if (!candidate) {
    return null;
  }

  return candidate;
}

export function buildDefineNameSet(defineEntries: string[]): Set<string> {
  const defineNames = new Set<string>();
  for (const entry of defineEntries) {
    const name = extractDefineName(entry);
    if (name) {
      defineNames.add(name);
    }
  }
  return defineNames;
}
