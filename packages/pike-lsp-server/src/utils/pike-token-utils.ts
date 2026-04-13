/**
 * Pike Token Utilities
 *
 * Shared token-based operations for Pike source analysis.
 * All Pike source parsing should go through this module or directly
 * through bridge.parse()/bridge.tokenize() — never through regex.
 *
 * ADR-001: No regex on Pike source code.
 */

import type { PikeToken } from '@pike-lsp/pike-bridge';
import type { Position } from 'vscode-languageserver';
import { isPikeKeyword } from '../features/navigation/keywords.js';

// ─── Identifier lookup ────────────────────────────────────────

/**
 * Find all occurrences of an identifier in tokenized Pike source.
 *
 * Matches tokens whose text exactly equals `name`, excluding Pike
 * keywords. This is comment/string/keyword-safe by construction
 * because bridge.tokenize() already separates those token classes.
 *
 * Returns positions in LSP coordinates (0-indexed line and character).
 */
export function findIdentifierOccurrences(tokens: PikeToken[], name: string): Position[] {
  const positions: Position[] = [];
  for (const token of tokens) {
    if (token.text !== name) continue;
    if (isPikeKeyword(token.text)) continue;
    positions.push({
      line: token.line - 1, // bridge uses 1-indexed lines
      character: Math.max(0, token.character),
    });
  }
  return positions;
}

// ─── Token classification ──────────────────────────────────────

/**
 * Check if a token represents a user identifier (not a keyword,
 * not punctuation, not a literal).
 *
 * PikeToken has text/line/character but no kind field, so we
 * distinguish by exclusion: keywords are known, single-char tokens
 * are punctuation, and everything else is treated as an identifier.
 */
export function isIdentifierToken(token: PikeToken): boolean {
  if (isPikeKeyword(token.text)) return false;
  // Single non-alphanumeric characters are punctuation/operators
  if (token.text.length === 1 && !isAlphaNumeric(token.text)) return false;
  // Numeric literals (heuristic: starts with digit, not a valid identifier start)
  if (token.text.length > 0 && token.text.charCodeAt(0) >= 0x30 && token.text.charCodeAt(0) <= 0x39)
    return false;
  return true;
}

function isAlphaNumeric(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f
  );
}

// ─── Bridge fallback wrapper ───────────────────────────────────

/**
 * Type for a tokenize function, matching bridge.tokenize signature.
 * Accepts `null` to indicate the bridge is not available.
 */
export type TokenizeFn = ((text: string) => Promise<PikeToken[]>) | null;

/**
 * Tokenize Pike source if the bridge is available, otherwise return null.
 *
 * Standardizes the `if (tokenizeFn) { ... } else { ... }` pattern
 * used across features. Callers check the result and decide whether
 * to proceed with token-based analysis or skip/fallback.
 */
export async function tokenizeOrFallback(
  content: string,
  tokenizeFn: TokenizeFn
): Promise<PikeToken[] | null> {
  if (!tokenizeFn) return null;
  try {
    return await tokenizeFn(content);
  } catch {
    return null;
  }
}

// ─── Position utilities ────────────────────────────────────────

/**
 * Convert a byte offset into a Position (0-indexed line/character).
 *
 * This is the single canonical implementation — replaces the 3+
 * duplicated copies that existed across rxml/feature files.
 */
export function findPositionForIndex(content: string, index: number): Position {
  const before = content.substring(0, index);
  const lines = before.split('\n');
  return {
    line: lines.length - 1,
    character: (lines[lines.length - 1] ?? '').length,
  };
}
