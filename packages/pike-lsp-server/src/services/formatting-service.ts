import { ErrorCodes, ResponseError, TextEdit } from 'vscode-languageserver/node.js';
import { INDENT_PATTERNS } from '../utils/regex-patterns.js';

export interface FormattingOptions {
  tabSize?: number;
  insertSpaces?: boolean;
}

export class FormattingService {
  validateFormattingOptions(options: FormattingOptions): void {
    const { tabSize, insertSpaces } = options;

    if (tabSize !== undefined) {
      if (typeof tabSize !== 'number') {
        throw new ResponseError(
          ErrorCodes.InvalidParams,
          `tabSize must be a number, got: ${typeof tabSize}`
        );
      }
      if (tabSize < 1 || tabSize > 16) {
        throw new ResponseError(
          ErrorCodes.InvalidParams,
          `tabSize must be between 1 and 16, got: ${tabSize}`
        );
      }
    }

    if (insertSpaces !== undefined && typeof insertSpaces !== 'boolean') {
      throw new ResponseError(
        ErrorCodes.InvalidParams,
        `insertSpaces must be a boolean, got: ${typeof insertSpaces}`
      );
    }
  }

  formatDocument(text: string, options: FormattingOptions): TextEdit[] {
    this.validateFormattingOptions(options);

    const tabSize = options.tabSize ?? 4;
    const insertSpaces = options.insertSpaces ?? true;
    const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

    return formatPikeCode(text, indent, 0);
  }

  formatRange(
    text: string,
    startLine: number,
    endLine: number,
    options: FormattingOptions
  ): TextEdit[] {
    this.validateFormattingOptions(options);

    const tabSize = options.tabSize ?? 4;
    const insertSpaces = options.insertSpaces ?? true;
    const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

    const edits = computeIndentEdits(text, indent, 0);
    return edits.filter(
      edit => edit.range.start.line >= startLine && edit.range.start.line <= endLine
    );
  }
}

export function formatPikeCode(text: string, indent: string, startLine = 0): TextEdit[] {
  return computeIndentEdits(text, indent, startLine);
}

function computeIndentEdits(text: string, indent: string, startLine: number): TextEdit[] {
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
      const currentIndent = originalLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

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

    if (switchBaseLevel !== null && switchBaseLevel > 0 && isCaseLabel) {
      currentLevel = switchBaseLevel;
      caseExtraIndent = true;
    } else if (caseExtraIndent) {
      if (switchBaseLevel !== null && switchBaseLevel > 0) {
        currentLevel = switchBaseLevel + 1;
      } else {
        currentLevel++;
      }
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
    const currentIndent = originalLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

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
          switchBaseLevel = trackingLevel - 1;
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
