import { TextEdit } from 'vscode-languageserver/node.js';
import { LEADING_WHITESPACE } from '../../utils/leading-whitespace.js';

/**
 * Transform braces from same-line to new-line style.
 *
 * When a line ends with `)` followed by `{`, move the `{` to a new line
 * with the same indentation as the preceding line.
 */
export function applyBraceStyleTransformation(text: string, startLine: number): TextEdit[] {
  const edits: TextEdit[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed.startsWith('{') && i > 0) {
      const prevLine = lines[i - 1] ?? '';

      if (/^\s*\)\s*$/.test(prevLine) || /\)\s*\{\s*$/.test(prevLine)) {
        const braceIndex = prevLine.lastIndexOf('{');
        if (braceIndex !== -1) {
          edits.push({
            range: {
              start: { line: startLine + i - 1, character: braceIndex },
              end: { line: startLine + i - 1, character: prevLine.length },
            },
            newText: '',
          });

          const currentIndent = line.match(LEADING_WHITESPACE)?.[1] ?? '';
          const prevIndent = prevLine.match(LEADING_WHITESPACE)?.[1] ?? '';

          if (currentIndent !== prevIndent) {
            edits.push({
              range: {
                start: { line: startLine + i, character: 0 },
                end: { line: startLine + i, character: currentIndent.length },
              },
              newText: prevIndent,
            });
          }
        }
      }
    }
  }

  return edits;
}

/**
 * Add spaces around binary operators that lack them.
 *
 * Skips unary +/- after 'e'/'E' (scientific notation) and
 * increment/decrement operators (++, --).
 */
export function applyOperatorSpacing(text: string, startLine: number): TextEdit[] {
  const edits: TextEdit[] = [];
  const lines = text.split('\n');

  const operatorPattern = /([a-zA-Z0-9_\])])([+*\-/%=<>!&|]+)([a-zA-Z0-9_\[(])/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let match: RegExpExecArray | null;
    const lineEdits: Array<{ start: number; end: number; newText: string }> = [];

    while ((match = operatorPattern.exec(line)) !== null) {
      const operator = match[2];
      if (!operator) continue;

      if (/^[\-+]+$/.test(operator) && match.index > 0) {
        const prevChar = line[match.index - 1];
        if (prevChar === 'e' || prevChar === 'E') {
          continue;
        }
      }

      if (!operator.includes('++') && !operator.includes('--')) {
        const before = match.index + (match[1]?.length ?? 0);
        const after = before + operator.length;

        if (line[before - 1] !== ' ' && line[after] !== ' ') {
          lineEdits.push({
            start: before,
            end: before,
            newText: ' ',
          });
          lineEdits.push({
            start: after,
            end: after,
            newText: ' ',
          });
        }
      }
    }

    for (const edit of lineEdits.reverse()) {
      edits.push({
        range: {
          start: { line: startLine + i, character: edit.start },
          end: { line: startLine + i, character: edit.end },
        },
        newText: edit.newText,
      });
    }
  }

  return edits;
}

/**
 * Break lines that exceed the maximum allowed length.
 *
 * Prefers breaking at whitespace; falls back to breaking at the
 * column limit when no suitable whitespace is found.
 */
export function applyLineLengthLimit(
  text: string,
  startLine: number,
  maxLineLength: number
): TextEdit[] {
  const edits: TextEdit[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.length > maxLineLength) {
      const leadingWhitespace = line.match(LEADING_WHITESPACE)?.[1] ?? '';

      let breakPoint = maxLineLength;
      while (breakPoint > leadingWhitespace.length && line[breakPoint] !== ' ') {
        breakPoint--;
      }

      if (breakPoint <= leadingWhitespace.length) {
        breakPoint = maxLineLength;
      }

      edits.push({
        range: {
          start: { line: startLine + i, character: breakPoint },
          end: { line: startLine + i, character: breakPoint },
        },
        newText: '\n' + leadingWhitespace,
      });
    }
  }

  return edits;
}

/**
 * Deduplicate and sort edits by position (line, then character).
 * Later edits at the same position silently overwrite earlier ones.
 */
export function mergeAndSortEdits(edits: TextEdit[]): TextEdit[] {
  const seen = new Set<string>();
  const unique: TextEdit[] = [];

  for (const edit of edits) {
    const key = `${edit.range.start.line}:${edit.range.start.character}-${edit.range.end.line}:${edit.range.end.character}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(edit);
    }
  }

  return unique.sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.range.start.character - b.range.start.character;
  });
}
