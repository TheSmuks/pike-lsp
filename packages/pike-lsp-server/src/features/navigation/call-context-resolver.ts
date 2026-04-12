import type { PikeToken } from '@pike-lsp/pike-bridge';
import { buildLineOffsets, positionToOffset } from '../roxen/parser-helpers.js';

// ── Public types ──────────────────────────────────────────────────────────

export interface ResolvedCallTarget {
  name: string;
  expression: string;
  isMemberCall: boolean;
  memberOperator: '->' | '.' | null;
}

export interface CallArgumentRange {
  start: number;
  end: number;
}

export interface ResolvedCallContext {
  target: ResolvedCallTarget;
  openParen: number;
  closeParen: number | null;
  activeParameter: number;
  argumentRanges: CallArgumentRange[];
}

// ── Internal helpers ──────────────────────────────────────────────────────

interface OpenCallState {
  target: ResolvedCallTarget;
  openParen: number;
  argumentStart: number;
  argumentRanges: CallArgumentRange[];
  nonCallParenDepth: number;
  bracketDepth: number;
  braceDepth: number;
}

const CONTROL_KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'foreach',
  'lambda',
  'do',
]);

/** Build an offset → token-index map for efficient nearest-token lookups. */
function buildTokenOffsetIndex(tokens: PikeToken[], lineOffsets: number[]): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    offsets.push(positionToOffset({ line: tok.line - 1, character: tok.character }, lineOffsets));
  }
  return offsets;
}

/** Find the token index whose start offset is <= `offset`, searching backward. */
function findTokenAtOrBefore(offsets: number[], offset: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (offsets[mid]! <= offset) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return hi; // -1 if nothing found
}

/** Check if a token is inside a string or comment. */
function isNonCodeToken(tok: PikeToken): boolean {
  const t = tok.text;
  if (t.startsWith('//') || t.startsWith('/*') || t === '*/') return true;
  if (t.startsWith('#"') || t === '"#') return true;
  if (t.startsWith('"') || t.startsWith("'")) return true;
  return false;
}

/** Check if token text is a valid Pike identifier. */
function isIdentifier(text: string): boolean {
  if (text.length === 0) return false;
  const first = text.charCodeAt(0);
  if (!((first >= 0x41 && first <= 0x5a) || (first >= 0x61 && first <= 0x7a) || first === 0x5f))
    return false;
  for (let i = 1; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (
      !(
        (c >= 0x41 && c <= 0x5a) ||
        (c >= 0x61 && c <= 0x7a) ||
        (c >= 0x30 && c <= 0x39) ||
        c === 0x5f
      )
    )
      return false;
  }
  return true;
}

function resolveTargetAtToken(
  tokens: PikeToken[],
  _tokenOffsets: number[],
  parenTokenIdx: number
): ResolvedCallTarget | null {
  // Walk backward from the '(' token to find the preceding identifier
  let idx = parenTokenIdx - 1;
  while (idx >= 0 && isNonCodeToken(tokens[idx]!)) {
    idx--;
  }
  if (idx < 0 || !isIdentifier(tokens[idx]!.text)) {
    return null;
  }

  const nameTok = tokens[idx]!;
  const name = nameTok.text;
  if (CONTROL_KEYWORDS.has(name)) {
    return null;
  }

  // Check for member operator preceding the name
  let memberOperator: '->' | '.' | null = null;
  let receiverStartIdx = idx;

  let prevIdx = idx - 1;
  while (prevIdx >= 0 && isNonCodeToken(tokens[prevIdx]!)) {
    prevIdx--;
  }

  if (prevIdx >= 0 && tokens[prevIdx]!.text === '.') {
    memberOperator = '.';
    receiverStartIdx = prevIdx - 1;
    // Walk further back over receiver expression tokens
    while (receiverStartIdx >= 0 && isNonCodeToken(tokens[receiverStartIdx]!)) {
      receiverStartIdx--;
    }
    if (receiverStartIdx >= 0 && isIdentifier(tokens[receiverStartIdx]!.text)) {
      receiverStartIdx--;
    }
    receiverStartIdx++;
  } else if (prevIdx >= 0 && tokens[prevIdx]!.text === '->') {
    memberOperator = '->';
    receiverStartIdx = prevIdx - 1;
    while (receiverStartIdx >= 0 && isNonCodeToken(tokens[receiverStartIdx]!)) {
      receiverStartIdx--;
    }
    if (receiverStartIdx >= 0 && isIdentifier(tokens[receiverStartIdx]!.text)) {
      receiverStartIdx--;
    }
    receiverStartIdx++;
  }

  const expression =
    memberOperator === null
      ? name
      : tokens
          .slice(receiverStartIdx, idx + 1)
          .map(t => t.text)
          .join('');

  return {
    name,
    expression,
    isMemberCall: memberOperator !== null,
    memberOperator,
  };
}

function computeActiveParameter(
  tokens: PikeToken[],
  tokenOffsets: number[],
  openParenOffset: number,
  offset: number
): number {
  let parameterIndex = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const tokStart = tokenOffsets[i]!;

    // Only consider tokens inside the open-paren region
    if (tokStart <= openParenOffset) continue;
    if (tokStart >= offset) break;

    const t = tok.text;
    if (isNonCodeToken(tok)) continue;

    if (t === '(') parenDepth++;
    else if (t === ')' && parenDepth > 0) parenDepth--;
    else if (t === '[') bracketDepth++;
    else if (t === ']' && bracketDepth > 0) bracketDepth--;
    else if (t === '{') braceDepth++;
    else if (t === '}' && braceDepth > 0) braceDepth--;
    else if (t === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      parameterIndex++;
    }
  }

  return parameterIndex;
}

// ── Public API ────────────────────────────────────────────────────────────

export async function resolveCallContextAtOffset(
  text: string,
  offset: number,
  tokenize: (text: string) => Promise<PikeToken[]>
): Promise<ResolvedCallContext | null> {
  if (offset < 0 || offset > text.length) return null;

  const tokens = await tokenize(text);
  if (tokens.length === 0) return null;

  const lineOffsets = buildLineOffsets(text);
  const tokenOffsets = buildTokenOffsetIndex(tokens, lineOffsets);

  // Walk tokens backward from offset to find an unmatched '('
  const startIdx = findTokenAtOrBefore(tokenOffsets, offset);
  let depth = 0;

  for (let i = startIdx; i >= 0; i--) {
    const tok = tokens[i]!;
    if (isNonCodeToken(tok)) continue;

    if (tok.text === ')') {
      depth++;
      continue;
    }
    if (tok.text === '(') {
      if (depth > 0) {
        depth--;
        continue;
      }

      const target = resolveTargetAtToken(tokens, tokenOffsets, i);
      if (!target) continue;

      const openParenOffset = tokenOffsets[i]!;
      return {
        target,
        openParen: openParenOffset,
        closeParen: null,
        activeParameter: computeActiveParameter(tokens, tokenOffsets, openParenOffset, offset),
        argumentRanges: [],
      };
    }
  }

  return null;
}

export async function collectCallContexts(
  text: string,
  tokenize: (text: string) => Promise<PikeToken[]>
): Promise<ResolvedCallContext[]> {
  const tokens = await tokenize(text);
  if (tokens.length === 0) return [];

  const lineOffsets = buildLineOffsets(text);
  const tokenOffsets = buildTokenOffsetIndex(tokens, lineOffsets);
  const openCalls: OpenCallState[] = [];
  const resolved: ResolvedCallContext[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (isNonCodeToken(tok)) continue;

    const t = tok.text;
    const tokOffset = tokenOffsets[i]!;
    const top = openCalls[openCalls.length - 1];

    if (t === '[' && top) {
      top.bracketDepth++;
      continue;
    }
    if (t === ']' && top && top.bracketDepth > 0) {
      top.bracketDepth--;
      continue;
    }
    if (t === '{' && top) {
      top.braceDepth++;
      continue;
    }
    if (t === '}' && top && top.braceDepth > 0) {
      top.braceDepth--;
      continue;
    }

    if (t === '(') {
      const target = resolveTargetAtToken(tokens, tokenOffsets, i);
      if (target) {
        openCalls.push({
          target,
          openParen: tokOffset,
          argumentStart: tokOffset + 1,
          argumentRanges: [],
          nonCallParenDepth: 0,
          bracketDepth: 0,
          braceDepth: 0,
        });
      } else if (top) {
        top.nonCallParenDepth++;
      }
      continue;
    }

    if (t === ',') {
      if (top && top.nonCallParenDepth === 0 && top.bracketDepth === 0 && top.braceDepth === 0) {
        const argStart = top.argumentStart;
        const argEnd = tokOffset;
        if (argEnd > argStart) {
          top.argumentRanges.push({ start: argStart, end: argEnd });
        }
        top.argumentStart = tokOffset + 1;
      }
      continue;
    }

    if (t === ')' && top) {
      if (top.nonCallParenDepth > 0) {
        top.nonCallParenDepth--;
        continue;
      }

      const argStart = top.argumentStart;
      const argEnd = tokOffset;
      if (argEnd > argStart) {
        top.argumentRanges.push({ start: argStart, end: argEnd });
      }

      resolved.push({
        target: top.target,
        openParen: top.openParen,
        closeParen: tokOffset,
        activeParameter: 0,
        argumentRanges: top.argumentRanges,
      });
      openCalls.pop();
    }
  }

  return resolved;
}
