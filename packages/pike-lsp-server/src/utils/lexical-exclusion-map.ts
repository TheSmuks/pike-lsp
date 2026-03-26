interface Range {
  start: number;
  end: number;
}

export interface LexicalExclusionMap {
  isCommentPosition(line: number, character: number): boolean;
  isCommentOrStringPosition(line: number, character: number): boolean;
  isCommentOffset(offset: number): boolean;
  isCommentOrStringOffset(offset: number): boolean;
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function toOffset(
  lineStarts: number[],
  line: number,
  character: number,
  textLength: number
): number {
  if (line < 0 || line >= lineStarts.length) {
    return -1;
  }
  const offset = lineStarts[line]! + Math.max(0, character);
  return Math.min(offset, textLength);
}

function isInRanges(ranges: Range[], offset: number): boolean {
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

export function createLexicalExclusionMap(text: string): LexicalExclusionMap {
  const commentRanges: Range[] = [];
  const stringRanges: Range[] = [];
  const lineStarts = buildLineStarts(text);

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
      commentRanges.push({ start, end: i });
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
      if (i > text.length) {
        i = text.length;
      }
      commentRanges.push({ start, end: i });
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
      stringRanges.push({ start, end: i });
      continue;
    }

    i += 1;
  }

  return {
    isCommentOffset(offset: number): boolean {
      if (offset < 0) {
        return false;
      }
      return isInRanges(commentRanges, offset);
    },
    isCommentOrStringOffset(offset: number): boolean {
      if (offset < 0) {
        return false;
      }
      return isInRanges(commentRanges, offset) || isInRanges(stringRanges, offset);
    },
    isCommentPosition(line: number, character: number): boolean {
      const offset = toOffset(lineStarts, line, character, text.length);
      if (offset < 0) {
        return false;
      }
      return isInRanges(commentRanges, offset);
    },
    isCommentOrStringPosition(line: number, character: number): boolean {
      const offset = toOffset(lineStarts, line, character, text.length);
      if (offset < 0) {
        return false;
      }
      return isInRanges(commentRanges, offset) || isInRanges(stringRanges, offset);
    },
  };
}
