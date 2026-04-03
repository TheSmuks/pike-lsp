interface OffsetRange {
  start: number;
  end: number;
}

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

function isIdentifierChar(char: string | undefined): boolean {
  return !!char && /[a-zA-Z0-9_]/.test(char);
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

function buildExclusionRanges(text: string): OffsetRange[] {
  const ranges: OffsetRange[] = [];

  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    const next = i + 1 < text.length ? text[i + 1]! : '';

    if (char === '/' && next === '/') {
      const start = i;
      i += 2;
      while (i < text.length && text[i] !== '\n') {
        i += 1;
      }
      ranges.push({ start, end: i });
      continue;
    }

    if (char === '/' && next === '*') {
      const start = i;
      i += 2;
      while (i + 1 < text.length) {
        if (text[i] === '*' && text[i + 1] === '/') {
          i += 2;
          break;
        }
        i += 1;
      }
      ranges.push({ start, end: i });
      continue;
    }

    if (char === '#' && next === '"') {
      const start = i;
      i += 2;
      while (i + 1 < text.length) {
        if (text[i] === '"' && text[i + 1] === '#') {
          i += 2;
          break;
        }
        i += 1;
      }
      ranges.push({ start, end: i });
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      const start = i;
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      ranges.push({ start, end: i });
      continue;
    }

    i += 1;
  }

  return ranges;
}

function isExcludedOffset(ranges: OffsetRange[], offset: number): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const range = ranges[mid]!;
    if (offset < range.start) {
      hi = mid - 1;
    } else if (offset >= range.end) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

function skipWhitespaceLeft(text: string, index: number): number {
  let i = index;
  while (i >= 0 && /\s/.test(text[i] ?? '')) {
    i -= 1;
  }
  return i;
}

function resolveTargetAtParen(text: string, openParen: number): ResolvedCallTarget | null {
  let i = skipWhitespaceLeft(text, openParen - 1);
  if (i < 0 || !isIdentifierChar(text[i])) {
    return null;
  }

  let nameStart = i;
  while (nameStart >= 0 && isIdentifierChar(text[nameStart])) {
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
      if (text[j] === '>' && text[j - 1] === '-') {
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

function computeActiveParameter(
  text: string,
  openParen: number,
  offset: number,
  exclusionRanges: OffsetRange[]
): number {
  let parameterIndex = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = openParen + 1; i < offset; i++) {
    if (isExcludedOffset(exclusionRanges, i)) {
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
  offset: number
): ResolvedCallContext | null {
  const exclusionRanges = buildExclusionRanges(text);
  if (offset < 0 || offset > text.length || isExcludedOffset(exclusionRanges, offset)) {
    return null;
  }

  let depth = 0;
  for (let i = offset - 1; i >= 0; i--) {
    if (isExcludedOffset(exclusionRanges, i)) {
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

      const target = resolveTargetAtParen(text, i);
      if (!target) {
        continue;
      }

      return {
        target,
        openParen: i,
        closeParen: null,
        activeParameter: computeActiveParameter(text, i, offset, exclusionRanges),
        argumentRanges: [],
      };
    }
  }

  return null;
}

export function collectCallContexts(text: string): ResolvedCallContext[] {
  const exclusionRanges = buildExclusionRanges(text);
  const openCalls: OpenCallState[] = [];
  const resolved: ResolvedCallContext[] = [];

  for (let i = 0; i < text.length; i++) {
    if (isExcludedOffset(exclusionRanges, i)) {
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
      const target = resolveTargetAtParen(text, i);
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
