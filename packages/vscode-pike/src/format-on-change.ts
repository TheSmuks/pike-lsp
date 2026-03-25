type PositionLike = { line: number; character: number };
type ChangeLike = {
  range: { start: PositionLike; end: PositionLike };
  rangeLength: number;
  text: string;
};
type ChangeEventLike = {
  document: { lineCount: number };
  contentChanges: ChangeLike[];
};

export type FormattingWindow = {
  startLine: number;
  endLine: number;
};

function countNewlines(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === '\n') {
      count++;
    }
  }
  return count;
}

export function isIndentationSensitiveChange(event: ChangeEventLike): boolean {
  for (const change of event.contentChanges) {
    if (change.text.length === 0 && change.rangeLength === 0) {
      continue;
    }

    if (countNewlines(change.text) > 0) {
      return true;
    }

    if (change.range.start.line !== change.range.end.line) {
      return true;
    }

    if (change.range.start.character === 0 && change.range.end.character === 0) {
      return true;
    }
  }

  return false;
}

export function computeFormattingWindow(event: ChangeEventLike): FormattingWindow {
  const documentLineCount = event.document.lineCount;
  let minLine = Number.MAX_SAFE_INTEGER;
  let maxLine = 0;

  for (const change of event.contentChanges) {
    minLine = Math.min(minLine, change.range.start.line);

    const addedLines = countNewlines(change.text);
    const touchedEnd = Math.max(change.range.end.line, change.range.start.line + addedLines);
    maxLine = Math.max(maxLine, touchedEnd + 1);
  }

  if (minLine === Number.MAX_SAFE_INTEGER) {
    minLine = 0;
  }

  const startLine = Math.max(0, minLine - 1);
  const endLine = Math.min(documentLineCount - 1, maxLine + 1);

  return {
    startLine,
    endLine,
  };
}
