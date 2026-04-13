/**
 * Call context resolver — uses bridge.tokenize() for lexical awareness.
 *
 * Replaces hand-rolled character scanning (buildExclusionRanges, resolveTargetAtParen)
 * with token-based analysis. Tokens provide correct handling of Pike string literals
 * (#"..."#), nested comments, and other lexical edge cases.
 */

import type { PikeToken } from '@pike-lsp/pike-bridge';

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

/**
 * Convert PikeToken (1-indexed line, 0-indexed column) to document offset.
 */
function tokenToOffset(lines: string[], token: PikeToken): number {
  let offset = 0;
  for (let i = 0; i < token.line - 1; i++) {
    offset += (lines[i]?.length ?? 0) + 1;
  }
  return offset + token.character;
}

/**
 * Build a set of document offsets that fall inside string or comment tokens.
 */
function buildExcludedOffsetSet(text: string, tokens: PikeToken[]): Set<number> {
  const excluded = new Set<number>();
  const lines = text.split('\n');
  for (const token of tokens) {
    const t = token.text.trimStart();
    const isComment = t.startsWith('//') || t.startsWith('/*');
    const isString = t.startsWith('#"') || t.startsWith('"') || t.startsWith("'");
    if (!isComment && !isString) continue;

    const leadingWs = token.text.length - t.length;
    const start = tokenToOffset(lines, token) + leadingWs;
    const end = start + t.length;
    for (let i = start; i < end; i++) {
      excluded.add(i);
    }
  }
  return excluded;
}

function trimRange(text: string, start: number, end: number): CallArgumentRange | null {
  let left = start;
  let right = end;
  while (left < right && /\s/.test(text[left] ?? '')) {
    left += 1;
  }
  while (right > left && /\s/.test(text[right - 1] ?? '')) {
    right -= 1;
  }
  return left < right ? { start: left, end: right } : null;
}

/**
 * Walk backward through the token list to find the call target for an open paren.
 * Looks for an identifier token immediately before `(`, optionally preceded by `->` or `.`.
 */
function resolveTargetAtParen(
  tokens: PikeToken[],
  text: string,
  lines: string[],
  openParenOffset: number,
  excludedOffsets: Set<number>
): ResolvedCallTarget | null {
  // Find the token at or immediately before the open paren
  let parenTokenIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tokenToOffset(lines, tok) === openParenOffset) {
      parenTokenIdx = i;
      break;
    }
  }
  if (parenTokenIdx < 0) {
    // The paren might not be its own token — fallback: scan chars but use exclusion set
    return resolveTargetAtParenFallback(text, openParenOffset, excludedOffsets);
  }

  // Walk backward from paren token to find identifier
  let nameIdx = -1;
  let memberOperator: '->' | '.' | null = null;
  let receiverEndIdx = -1;

  for (let i = parenTokenIdx - 1; i >= 0; i--) {
    const t = tokens[i]!.text.trim();
    if (t === '' || /\s/.test(t)) continue;

    if (t === '->' || t === '.') {
      memberOperator = t as '->' | '.';
      continue;
    }

    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) {
      if (nameIdx < 0) {
        nameIdx = i;
      } else if (memberOperator) {
        receiverEndIdx = i;
        break;
      }
      continue;
    }
    break;
  }

  if (nameIdx < 0) {
    return resolveTargetAtParenFallback(text, openParenOffset, excludedOffsets);
  }

  const name = tokens[nameIdx]!.text.trim();
  if (!name || CONTROL_KEYWORDS.has(name)) {
    return null;
  }

  let receiverStart = nameIdx;
  if (memberOperator && receiverEndIdx >= 0) {
    receiverStart = receiverEndIdx;
  }

  let expression: string;
  if (memberOperator === null) {
    expression = name;
  } else {
    // Reconstruct expression from receiver through member operator to name
    let expr = '';
    for (let i = receiverStart; i <= nameIdx; i++) {
      expr += tokens[i]!.text.trim();
      if (i < nameIdx) expr += '.';
    }
    expression = expr.replace(/\s+/g, '');
  }

  return {
    name,
    expression,
    isMemberCall: memberOperator !== null,
    memberOperator,
  };
}

/** Fallback char-based target resolution when tokens don't cleanly align. */
function resolveTargetAtParenFallback(
  text: string,
  openParen: number,
  _excludedOffsets: Set<number>
): ResolvedCallTarget | null {
  let i = openParen - 1;
  while (i >= 0 && /\s/.test(text[i] ?? '')) {
    i -= 1;
  }
  if (i < 0 || !/[a-zA-Z_]/.test(text[i]!)) {
    return null;
  }

  let nameStart = i;
  while (nameStart >= 0 && /[a-zA-Z0-9_]/.test(text[nameStart]!)) {
    nameStart -= 1;
  }
  nameStart += 1;

  const name = text.slice(nameStart, i + 1);
  if (!name || CONTROL_KEYWORDS.has(name)) {
    return null;
  }

  const beforeName = skipWhitespaceLeft(text, nameStart - 1);
  let memberOperator: '->' | '.' | null = null;
  let receiverStart = nameStart;

  if (beforeName >= 0 && text[beforeName] === '.') {
    memberOperator = '.';
    let j = skipWhitespaceLeft(text, beforeName - 1);
    while (j >= 0 && /[a-zA-Z0-9_.]/.test(text[j] ?? '')) {
      j -= 1;
    }
    receiverStart = j + 1;
  } else if (beforeName >= 1 && text[beforeName] === '>' && text[beforeName - 1] === '-') {
    memberOperator = '->';
    let j = skipWhitespaceLeft(text, beforeName - 2);
    while (j >= 0 && /[a-zA-Z0-9_.\-<>]/.test(text[j] ?? '')) {
      if (text[j] === '>' && j > 0 && text[j - 1] === '-') {
        j -= 2;
        continue;
      }
      j -= 1;
    }
    receiverStart = j + 1;
  }

  const expression =
    memberOperator === null ? name : text.slice(receiverStart, i + 1).replace(/\s+/g, '');

  return {
    name,
    expression,
    isMemberCall: memberOperator !== null,
    memberOperator,
  };
}

function skipWhitespaceLeft(text: string, index: number): number {
  let i = index;
  while (i >= 0 && /\s/.test(text[i] ?? '')) {
    i -= 1;
  }
  return i;
}

function computeActiveParameter(
  text: string,
  openParen: number,
  offset: number,
  excludedOffsets: Set<number>
): number {
  let parameterIndex = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = openParen + 1; i < offset; i++) {
    if (excludedOffsets.has(i)) {
      continue;
    }

    const char = text[i]!;
    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')' && parenDepth > 0) {
      parenDepth -= 1;
    } else if (char === '[') {
      bracketDepth += 1;
    } else if (char === ']' && bracketDepth > 0) {
      bracketDepth -= 1;
    } else if (char === '{') {
      braceDepth += 1;
    } else if (char === '}' && braceDepth > 0) {
      braceDepth -= 1;
    } else if (char === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      parameterIndex += 1;
    }
  }

  return parameterIndex;
}

export function resolveCallContextAtOffset(
  text: string,
  offset: number,
  tokens: PikeToken[]
): ResolvedCallContext | null {
  const excludedOffsets = buildExcludedOffsetSet(text, tokens);
  if (offset < 0 || offset > text.length || excludedOffsets.has(offset)) {
    return null;
  }

  const lines = text.split('\n');
  let depth = 0;
  for (let i = offset - 1; i >= 0; i--) {
    if (excludedOffsets.has(i)) {
      continue;
    }

    const char = text[i]!;
    if (char === ')') {
      depth += 1;
    } else if (char === '(') {
      if (depth > 0) {
        depth -= 1;
        continue;
      }

      const target = resolveTargetAtParen(tokens, text, lines, i, excludedOffsets);
      if (!target) {
        continue;
      }

      return {
        target,
        openParen: i,
        closeParen: null,
        activeParameter: computeActiveParameter(text, i, offset, excludedOffsets),
        argumentRanges: [],
      };
    }
  }

  return null;
}

export function collectCallContexts(text: string, tokens: PikeToken[]): ResolvedCallContext[] {
  const excludedOffsets = buildExcludedOffsetSet(text, tokens);
  const openCalls: OpenCallState[] = [];
  const resolved: ResolvedCallContext[] = [];

  const lines = text.split('\n');

  for (let i = 0; i < text.length; i++) {
    if (excludedOffsets.has(i)) {
      continue;
    }

    const char = text[i]!;
    const top = openCalls[openCalls.length - 1];

    if (char === '[' && top) {
      top.bracketDepth += 1;
      continue;
    }

    if (char === ']' && top && top.bracketDepth > 0) {
      top.bracketDepth -= 1;
      continue;
    }

    if (char === '{' && top) {
      top.braceDepth += 1;
      continue;
    }

    if (char === '}' && top && top.braceDepth > 0) {
      top.braceDepth -= 1;
      continue;
    }

    if (char === '(') {
      const target = resolveTargetAtParen(tokens, text, lines, i, excludedOffsets);
      if (target) {
        openCalls.push({
          target,
          openParen: i,
          argumentStart: i + 1,
          argumentRanges: [],
          nonCallParenDepth: 0,
          bracketDepth: 0,
          braceDepth: 0,
        });
      } else if (top) {
        top.nonCallParenDepth += 1;
      }
      continue;
    }

    if (char === ',') {
      if (top && top.nonCallParenDepth === 0 && top.bracketDepth === 0 && top.braceDepth === 0) {
        const range = trimRange(text, top.argumentStart, i);
        if (range) {
          top.argumentRanges.push(range);
        }
        top.argumentStart = i + 1;
      }
      continue;
    }

    if (char === ')' && top) {
      if (top.nonCallParenDepth > 0) {
        top.nonCallParenDepth -= 1;
        continue;
      }

      const lastRange = trimRange(text, top.argumentStart, i);
      if (lastRange) {
        top.argumentRanges.push(lastRange);
      }

      resolved.push({
        target: top.target,
        openParen: top.openParen,
        closeParen: i,
        activeParameter: 0,
        argumentRanges: top.argumentRanges,
      });
      openCalls.pop();
    }
  }

  return resolved;
}
