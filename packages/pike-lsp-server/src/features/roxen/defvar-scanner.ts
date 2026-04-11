/**
 * Defvar Declaration Scanner
 *
 * Extracts Roxen defvar() declarations from Pike source code using
 * token-based or string-based scanning (ADR-001: no regex).
 *
 * Two extraction paths:
 * - Token-based: Uses PikeToken[] from bridge.tokenize() for accurate parsing
 * - Code-based: Falls back to string scanning when tokens unavailable
 */

import type { PikeToken } from '@pike-lsp/pike-bridge';
import { VAR_FLAGS } from './constants.js';
import type { DefvarDeclaration } from './config.js';

/**
 * Strip surrounding quotes (single or double) from a string.
 */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0]!;
    const last = s[s.length - 1]!;
    if ((first === '"' || first === "'") && first === last) {
      return s.slice(1, -1);
    }
  }
  return s;
}

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
 * Split a string by commas, but not commas inside quoted strings.
 */
function splitCommaRespectingStrings(s: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let quoteChar = '';

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inString) {
      current += ch;
      if (ch === quoteChar) inString = false;
    } else if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === ',') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Strip surrounding quotes from a string (alias for unquote).
 */
function unquote(s: string): string {
  return stripQuotes(s);
}

/**
 * Parse a defvar argument string: "name", "displayName", TYPE_*, "doc", flags
 * Uses simple string operations (indexOf, split) — no regex.
 */
function parseDefvarArgs(argsStr: string): {
  name: string;
  displayName: string;
  type: string;
  documentation: string;
  flags: number;
} | null {
  const parts = splitCommaRespectingStrings(argsStr);
  if (parts.length < 5) return null;

  const name = unquote(parts[0]!.trim());
  const displayName = unquote(parts[1]!.trim());
  const type = parts[2]!.trim();
  const documentation = unquote(parts[3]!.trim());
  const flagsStr = parts[4]!.trim();

  if (!name || !type) return null;

  return { name, displayName, type, documentation, flags: parseFlags(flagsStr) };
}

/**
 * Extract defvar declarations from raw code text using string scanning.
 * Handles multi-line defvar calls.
 */
export function extractDefvarsFromCode(code: string): DefvarDeclaration[] {
  const defvars: DefvarDeclaration[] = [];
  let searchFrom = 0;

  while (true) {
    const defvarPos = code.indexOf('defvar', searchFrom);
    if (defvarPos === -1) break;

    const openParen = code.indexOf('(', defvarPos);
    if (openParen === -1) {
      searchFrom = defvarPos + 1;
      continue;
    }

    // Extract the full argument region to the matching ')', spanning lines
    const argsStart = openParen + 1;
    let depth = 1;
    let argsEnd = argsStart;
    while (argsEnd < code.length && depth > 0) {
      const ch = code[argsEnd];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      argsEnd++;
    }

    if (depth !== 0) {
      searchFrom = defvarPos + 1;
      continue;
    }

    const argsStr = code.slice(argsStart, argsEnd - 1);
    const parsed = parseDefvarArgs(argsStr);
    if (parsed) {
      const beforeDefvar = code.slice(0, defvarPos);
      const line = beforeDefvar.split('\n').length - 1;
      const lastNewline = beforeDefvar.lastIndexOf('\n');
      const column = lastNewline === -1 ? defvarPos : defvarPos - lastNewline - 1;

      defvars.push({
        name: parsed.name,
        displayName: parsed.displayName || parsed.name,
        type: parsed.type,
        documentation: parsed.documentation,
        flags: parsed.flags,
        line,
        column,
      });
    }
    searchFrom = argsEnd;
  }

  return defvars;
}

/**
 * Parse a flags string into a numeric value (re-exported for config.ts).
 */
export { parseFlags as parseFlagsValue };
