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

    const braceRegex = /[{}]/g;
    let match: RegExpExecArray | null = braceRegex.exec(originalLine);
    while (match !== null) {
      if (match[0] === '{') {
        trackingLevel++;
        indentStack.push(trackingLevel);
        if (switchBaseLevel === -1) {
          switchBaseLevel = trackingLevel - 2;
        }
      } else if (match[0] === '}') {
        indentStack.pop();
        trackingLevel = indentStack[indentStack.length - 1] ?? 0;
      }
      match = braceRegex.exec(originalLine);
    }

    const pikeLiteralRegex = /(\(\[|\(<|\]\)|>\))/g;
    match = pikeLiteralRegex.exec(originalLine);
    while (match !== null) {
      if (match[0] === '([' || match[0] === '(<') {
        trackingLevel++;
        indentStack.push(trackingLevel);
      } else {
        indentStack.pop();
        trackingLevel = indentStack[indentStack.length - 1] ?? 0;
      }
      match = pikeLiteralRegex.exec(originalLine);
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
