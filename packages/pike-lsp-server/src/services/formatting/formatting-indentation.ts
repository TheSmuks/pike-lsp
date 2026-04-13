import { TextEdit } from 'vscode-languageserver/node.js';
import { LEADING_WHITESPACE } from '../../utils/leading-whitespace.js';

/**
 * Compute indentation edits for Pike source text.
 *
 * Tracks brace/parenthesis depth, Pike multi-line literals `([`/`]`),
 * switch/case indentation levels, multiline comments, and multiline
 * strings (`#"..."#`).  Braceless control-flow statements (`if`, `while`,
 * `for`, `foreach`, `do`, `else`) increase indentation for the next
 * non-empty line.
 */
export function computeIndentEdits(text: string, indent: string, startLine: number): TextEdit[] {
  const lines = text.split('\n');
  const edits: TextEdit[] = [];

  const indentStack: number[] = [0];
  let pendingIndent = false;
  let inMultilineComment = false;
  let inMultilineString = false;
  let switchBaseLevel: number | null = null;
  let caseExtraIndent = false;

  const controlKeywords = ['if', 'else', 'while', 'for', 'foreach', 'do'];

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i] ?? '';
    const trimmed = originalLine.trim();

    if (trimmed.length === 0) {
      if (pendingIndent) {
        pendingIndent = false;
      }
      continue;
    }

    if (trimmed.startsWith('#"') && !trimmed.endsWith('"#')) {
      inMultilineString = true;
    } else if (trimmed.endsWith('"#')) {
      inMultilineString = false;
    }

    if (inMultilineString) {
      continue;
    }

    if (trimmed.startsWith('/*')) {
      inMultilineComment = true;
    }

    const isCommentEnd = trimmed.endsWith('*/') || trimmed.includes('*/');

    if (inMultilineComment || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      let commentIndentLevel = indentStack[indentStack.length - 1] ?? 0;
      if (pendingIndent) {
        commentIndentLevel++;
      }
      if (caseExtraIndent) {
        commentIndentLevel++;
      }
      const expectedIndent = indent.repeat(commentIndentLevel);
      const currentIndent = originalLine.match(LEADING_WHITESPACE)?.[1] ?? '';

      if (currentIndent !== expectedIndent && !trimmed.startsWith('//!')) {
        edits.push({
          range: {
            start: { line: startLine + i, character: 0 },
            end: { line: startLine + i, character: currentIndent.length },
          },
          newText: expectedIndent,
        });
      }

      if (isCommentEnd) {
        inMultilineComment = false;
      }
      continue;
    }

    const isCaseLabel = /^(case\s+[^:]+|default\s*):/.test(trimmed);

    let currentLevel = indentStack[indentStack.length - 1] ?? 0;

    const hadPendingIndent = pendingIndent;
    if (pendingIndent) {
      currentLevel++;
      pendingIndent = false;
    }

    if (/^switch\s*\(/.test(trimmed) && switchBaseLevel === null) {
      switchBaseLevel = -1;
    }

    if (switchBaseLevel !== null && switchBaseLevel >= 0 && isCaseLabel) {
      // Case labels at switchBaseLevel + 1 (same level as switch statement)
      currentLevel = switchBaseLevel + 1;
      caseExtraIndent = true;
    } else if (caseExtraIndent && switchBaseLevel !== null && switchBaseLevel >= 0) {
      // Case body at switchBaseLevel + 2
      currentLevel = switchBaseLevel + 2;
      if (!isCaseLabel) {
        caseExtraIndent = false;
      }
    }

    if (
      trimmed.startsWith('}') ||
      trimmed.startsWith(')') ||
      trimmed.startsWith('])') ||
      trimmed.startsWith('>)')
    ) {
      currentLevel = Math.max(0, currentLevel - 1);
    }

    if (trimmed.startsWith('}') && switchBaseLevel !== null) {
      switchBaseLevel = null;
      caseExtraIndent = false;
    }

    const expectedIndent = indent.repeat(currentLevel);
    const currentIndent = originalLine.match(LEADING_WHITESPACE)?.[1] ?? '';

    if (currentIndent !== expectedIndent) {
      edits.push({
        range: {
          start: { line: startLine + i, character: 0 },
          end: { line: startLine + i, character: currentIndent.length },
        },
        newText: expectedIndent,
      });
    }

    let trackingLevel = indentStack[indentStack.length - 1] ?? 0;
    if (hadPendingIndent) {
      trackingLevel++;
    }

    // Scan for structural braces outside strings/comments/multiline literals.
    // Uses a lightweight line scanner (same approach as ignored-ranges fallback)
    // so this stays synchronous — no bridge dependency needed.
    const braceCount = countStructuralBraces(originalLine);
    trackingLevel += braceCount.opens;
    for (let b = 0; b < braceCount.opens; b++) {
      indentStack.push(trackingLevel);
      if (switchBaseLevel === -1) {
        switchBaseLevel = trackingLevel - 2;
      }
    }
    for (let b = 0; b < braceCount.closes; b++) {
      indentStack.pop();
      trackingLevel = indentStack[indentStack.length - 1] ?? 0;
    }

    // Pike multi-line literal delimiters ([( / ]), (< / >))
    const literalCount = countStructuralPikeLiterals(originalLine);
    trackingLevel += literalCount.opens;
    for (let l = 0; l < literalCount.opens; l++) {
      indentStack.push(trackingLevel);
    }
    for (let l = 0; l < literalCount.closes; l++) {
      indentStack.pop();
      trackingLevel = indentStack[indentStack.length - 1] ?? 0;
    }

    const isBracelessControl = controlKeywords.some(keyword => {
      const pattern = new RegExp(`^(}\\s*)?${keyword}\\b.*\\)$`);
      return pattern.test(trimmed) && !trimmed.endsWith('{');
    });

    if (isBracelessControl || trimmed === 'else' || trimmed === '} else') {
      pendingIndent = true;
    }
  }

  return edits;
}

/**
 * Build ignored character ranges on a single line for strings, comments,
 * and Pike multi-line strings. Same lightweight approach as ignored-ranges.ts
 * fallback, but for a single line (no state tracking across lines).
 */
function buildLineIgnoredRanges(line: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let pos = 0;
  while (pos < line.length) {
    // // line comment
    if (line[pos] === '/' && line[pos + 1] === '/') {
      ranges.push({ start: pos, end: line.length });
      break;
    }
    // /* block comment
    if (line[pos] === '/' && line[pos + 1] === '*') {
      const closeIdx = line.indexOf('*/', pos + 2);
      if (closeIdx >= 0) {
        ranges.push({ start: pos, end: closeIdx + 2 });
        pos = closeIdx + 2;
        continue;
      }
      ranges.push({ start: pos, end: line.length });
      break;
    }
    // #" Pike multi-line string
    if (line[pos] === '#' && line[pos + 1] === '"') {
      const closeIdx = line.indexOf('"#', pos + 2);
      if (closeIdx >= 0) {
        ranges.push({ start: pos, end: closeIdx + 2 });
        pos = closeIdx + 2;
        continue;
      }
      ranges.push({ start: pos, end: line.length });
      break;
    }
    // Regular string
    if (line[pos] === '"') {
      const closeIdx = line.indexOf('"', pos + 1);
      if (closeIdx >= 0) {
        ranges.push({ start: pos, end: closeIdx + 1 });
        pos = closeIdx + 1;
        continue;
      }
      ranges.push({ start: pos, end: line.length });
      break;
    }
    // Single-quoted string
    if (line[pos] === "'") {
      const closeIdx = line.indexOf("'", pos + 1);
      if (closeIdx >= 0) {
        ranges.push({ start: pos, end: closeIdx + 1 });
        pos = closeIdx + 1;
        continue;
      }
      ranges.push({ start: pos, end: line.length });
      break;
    }
    pos++;
  }
  return ranges;
}

/** Check if a position falls inside any ignored range. */
function isIgnored(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some(r => pos >= r.start && pos < r.end);
}

/** Count structural { and } outside strings/comments. */
function countStructuralBraces(line: string): { opens: number; closes: number } {
  const ranges = buildLineIgnoredRanges(line);
  let opens = 0;
  let closes = 0;
  for (let i = 0; i < line.length; i++) {
    if (isIgnored(i, ranges)) continue;
    if (line[i] === '{') opens++;
    else if (line[i] === '}') closes++;
  }
  return { opens, closes };
}

/** Count Pike multi-line literal delimiters ([( / ]), (< / >)) outside strings/comments. */
function countStructuralPikeLiterals(line: string): { opens: number; closes: number } {
  const ranges = buildLineIgnoredRanges(line);
  let opens = 0;
  let closes = 0;
  for (let i = 0; i < line.length; i++) {
    if (isIgnored(i, ranges)) continue;
    if (line[i] === '(' && (line[i + 1] === '[' || line[i + 1] === '<')) {
      opens++;
      i++; // skip the [ or <
    } else if (line[i] === ']' && line[i + 1] === ')') {
      closes++;
      i++;
    } else if (line[i] === '>' && line[i + 1] === ')') {
      closes++;
      i++;
    }
  }
  return { opens, closes };
}
