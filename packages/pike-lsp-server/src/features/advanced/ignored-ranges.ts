/**
 * Ignored Ranges for Semantic Tokens
 *
 * Builds per-line ignored ranges for comments and strings, so that semantic
 * token generation can skip identifiers inside these regions.
 *
 * Issue #1581: Replaced the original hand-rolled character-by-character scanner
 * with two strategies:
 *  1. bridge.tokenize() - when the Pike bridge is available (production).
 *     Uses token text heuristics to identify comment/string tokens.
 *  2. Line-based fallback - when bridge is unavailable (tests, parse-under-edit).
 *     Lightweight scanner for line comments, block comments, and Pike
 *     multiline strings.
 */

import type { PikeToken } from '@pike-lsp/pike-bridge';

/** A character range on a single line that should be skipped by semantic tokens. */
export interface IgnoredRange {
  start: number;
  end: number;
}

/**
 * Build ignored ranges from bridge.tokenize() output.
 * Uses token text heuristics since PikeToken lacks a type field.
 */
export function buildIgnoredRangesFromTokens(
  tokens: PikeToken[],
  lineCount: number
): IgnoredRange[][] {
  const ignoredRangesByLine: IgnoredRange[][] = Array.from({ length: lineCount }, () => []);

  for (const token of tokens) {
    const t = token.text.trimStart();
    const isComment = t.startsWith('//') || t.startsWith('/*');
    const isString = t.startsWith('#"') || t.startsWith('"');
    if (!isComment && !isString) continue;

    // Token.line is 1-indexed; token.character is 0-indexed
    const lineNum = token.line - 1;
    if (lineNum < 0 || lineNum >= lineCount) continue;
    if (token.character < 0) continue;

    // account for leading whitespace trimmed above
    const leadingWs = token.text.length - t.length;
    const start = token.character + leadingWs;
    ignoredRangesByLine[lineNum]!.push({ start, end: start + t.length });
  }

  return ignoredRangesByLine;
}

/**
 * Fallback: minimal line scanner for when bridge.tokenize is unavailable.
 * Handles line comments, block comments, and Pike multiline strings.
 */
export function buildIgnoredRangesFallback(lines: string[]): IgnoredRange[][] {
  const result: IgnoredRange[][] = lines.map(() => []);
  let inBlockComment = false;
  let inMultilineString = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (inBlockComment) {
      result[i]!.push({ start: 0, end: line.length });
      const closeIdx = line.indexOf('*/');
      if (closeIdx >= 0) {
        inBlockComment = false;
        result[i]!.push({ start: closeIdx + 2, end: line.length });
        // continue scanning the rest of the line below
      } else {
        continue;
      }
    }

    if (inMultilineString) {
      result[i]!.push({ start: 0, end: line.length });
      const closeIdx = line.indexOf('"#');
      if (closeIdx >= 0) {
        inMultilineString = false;
        result[i]!.push({ start: closeIdx + 2, end: line.length });
      } else {
        continue;
      }
    }

    // Scan the line for comments, strings, and multiline string openers
    let pos = 0;
    while (pos < line.length) {
      // Check for // line comment
      if (line[pos] === '/' && line[pos + 1] === '/') {
        result[i]!.push({ start: pos, end: line.length });
        break;
      }
      // Check for /* block comment
      if (line[pos] === '/' && line[pos + 1] === '*') {
        const closeIdx = line.indexOf('*/', pos + 2);
        if (closeIdx >= 0) {
          result[i]!.push({ start: pos, end: closeIdx + 2 });
          pos = closeIdx + 2;
          continue;
        }
        result[i]!.push({ start: pos, end: line.length });
        inBlockComment = true;
        break;
      }
      // Check for Pike multiline string #"...
      if (line[pos] === '#' && line[pos + 1] === '"') {
        const closeIdx = line.indexOf('"#', pos + 2);
        if (closeIdx >= 0) {
          result[i]!.push({ start: pos, end: closeIdx + 2 });
          pos = closeIdx + 2;
          continue;
        }
        result[i]!.push({ start: pos, end: line.length });
        inMultilineString = true;
        break;
      }
      // Check for regular string "..."
      if (line[pos] === '"') {
        const closeIdx = line.indexOf('"', pos + 1);
        if (closeIdx >= 0) {
          result[i]!.push({ start: pos, end: closeIdx + 1 });
          pos = closeIdx + 1;
          continue;
        }
        // Unterminated string — ignore to end of line
        result[i]!.push({ start: pos, end: line.length });
        break;
      }
      pos++;
    }
  }

  return result;
}
