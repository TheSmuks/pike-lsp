/**
 * Defvar Declaration Scanner
 *
 * Extracts Roxen defvar() declarations from Pike source code using
 * token-based scanning (ADR-001: no regex).
 *
 * Uses PikeToken[] from bridge.tokenize() for accurate parsing.
 */

import type { PikeToken } from '@pike-lsp/pike-bridge';
import { VAR_FLAGS } from './constants.js';

/**
 * Check if a string consists entirely of ASCII digits.
 */
function isAllDigits(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x30 || c > 0x39) return false;
  }
  return true;
}

/**
 * Parse flags string (numeric or named VAR_* constants) into a numeric value.
 */
function parseFlags(flagsStr: string): number {
  const trimmed = flagsStr.trim();
  if (trimmed.length > 0 && isAllDigits(trimmed)) {
    return parseInt(trimmed, 10);
  }
  let flags = 0;
  const parts = trimmed.split('|');
  for (const part of parts) {
    const flagName = part.trim();
    const flagInfo = VAR_FLAGS[flagName as keyof typeof VAR_FLAGS];
    if (flagInfo) {
      flags |= flagInfo.value;
    }
  }
  return flags;
}

/**
 * Split a flat token-text array into argument groups, splitting on ',' tokens.
 */
function splitArgsByCommas(args: string[]): string[][] {
  const groups: string[][] = [[]];
  for (const arg of args) {
    if (arg === ',') {
      groups.push([]);
    } else {
      groups[groups.length - 1]!.push(arg);
    }
  }
  return groups;
}

/**
 * Extract string literal value from token group.
 * Tokens from string literals may include quote tokens; strip them.
 */
function extractStringLiteral(tokens: string[]): string {
  return tokens
    .filter(t => t !== '"' && t !== "'")
    .join('')
    .trim();
}

/**
 * Extract a single identifier from a token group.
 */
function extractIdentifier(tokens: string[]): string {
  return tokens.join('').trim();
}

/** Intermediate defvar data before flag parsing */
export interface RawDefvar {
  name: string;
  displayName: string;
  type: string;
  documentation: string;
  flagsStr: string;
  line: number;
  column: number;
}

/**
 * Extract defvar declarations from tokens (bridge tokenize).
 * Walks tokens looking for: defvar ( "name" , "displayName" , TYPE_* , "doc" , flags )
 */
export function extractDefvarsFromTokens(tokens: PikeToken[]): RawDefvar[] {
  const results: RawDefvar[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok || tok.text !== 'defvar') continue;

    const parenIdx = i + 1;
    if (parenIdx >= tokens.length || tokens[parenIdx]?.text !== '(') continue;

    // Collect all tokens until matching ')'
    const args: string[] = [];
    let depth = 1;
    let j = parenIdx + 1;
    while (j < tokens.length && depth > 0) {
      const t = tokens[j];
      if (!t) {
        j++;
        continue;
      }
      if (t.text === '(') {
        depth++;
        args.push(t.text);
      } else if (t.text === ')') {
        depth--;
        if (depth > 0) args.push(t.text);
      } else {
        args.push(t.text);
      }
      j++;
    }

    const argGroups = splitArgsByCommas(args);
    if (argGroups.length < 5) continue;

    const name = extractStringLiteral(argGroups[0] ?? []);
    const displayName = extractStringLiteral(argGroups[1] ?? []);
    const type = extractIdentifier(argGroups[2] ?? []);
    const documentation = extractStringLiteral(argGroups[3] ?? []);
    const flagsTokens = argGroups[4] ?? [];

    if (!name || !type) continue;

    results.push({
      name,
      displayName,
      type,
      documentation,
      flagsStr: flagsTokens.join(' '),
      line: Math.max(0, tok.line - 1),
      column: Math.max(0, tok.character),
    });
  }

  return results;
}
/**
 * Parse a flags string into a numeric value (re-exported for config.ts).
 */
export { parseFlags as parseFlagsValue };
