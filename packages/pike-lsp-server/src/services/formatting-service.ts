import { ErrorCodes, ResponseError, TextEdit } from 'vscode-languageserver/node.js';
import { INDENT_PATTERNS } from '../utils/regex-patterns.js';

export interface FormattingOptions {
  tabSize?: number;
  insertSpaces?: boolean;
  maxLineLength?: number | undefined;
  braceStyle?: 'same-line' | 'new-line' | undefined;
  spaceAroundOperators?: boolean | undefined;
  blankLinesBetweenFunctions?: number | undefined;
}

export interface FormattingProfile {
  name: string;
  maxLineLength: number;
  braceStyle: 'same-line' | 'new-line';
  spaceAroundOperators: boolean;
  blankLinesBetweenFunctions: number;
}

export const PREDEFINED_PROFILES: Record<string, FormattingProfile> = {
  compact: {
    name: 'Compact',
    maxLineLength: 80,
    braceStyle: 'same-line',
    spaceAroundOperators: true,
    blankLinesBetweenFunctions: 1,
  },
  standard: {
    name: 'Standard',
    maxLineLength: 100,
    braceStyle: 'same-line',
    spaceAroundOperators: true,
    blankLinesBetweenFunctions: 1,
  },
  relaxed: {
    name: 'Relaxed',
    maxLineLength: 120,
    braceStyle: 'same-line',
    spaceAroundOperators: true,
    blankLinesBetweenFunctions: 1,
  },
  allman: {
    name: 'Allman Style',
    maxLineLength: 100,
    braceStyle: 'new-line',
    spaceAroundOperators: true,
    blankLinesBetweenFunctions: 1,
  },
};

export class FormattingService {
  private currentProfile: FormattingProfile;

  constructor() {
    const standard = PREDEFINED_PROFILES['standard'];
    if (!standard) {
      throw new Error('Standard profile not found');
    }
    this.currentProfile = standard;
  }

  setProfile(profile: FormattingProfile | string): void {
    if (typeof profile === 'string') {
      const predefined = PREDEFINED_PROFILES[profile];
      if (predefined) {
        this.currentProfile = predefined;
      } else {
        throw new ResponseError(ErrorCodes.InvalidParams, `Unknown formatting profile: ${profile}`);
      }
    } else {
      this.currentProfile = profile;
    }
  }

  getProfile(): FormattingProfile {
    return this.currentProfile;
  }

  validateFormattingOptions(options: FormattingOptions): void {
    const { tabSize, insertSpaces, maxLineLength, braceStyle } = options;

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

    if (maxLineLength !== undefined) {
      if (typeof maxLineLength !== 'number') {
        throw new ResponseError(
          ErrorCodes.InvalidParams,
          `maxLineLength must be a number, got: ${typeof maxLineLength}`
        );
      }
      if (maxLineLength < 0 || maxLineLength > 200) {
        throw new ResponseError(
          ErrorCodes.InvalidParams,
          `maxLineLength must be between 0 and 200, got: ${maxLineLength}`
        );
      }
    }

    if (braceStyle !== undefined) {
      if (braceStyle !== 'same-line' && braceStyle !== 'new-line') {
        throw new ResponseError(
          ErrorCodes.InvalidParams,
          `braceStyle must be 'same-line' or 'new-line', got: ${braceStyle}`
        );
      }
    }
  }

  formatDocument(text: string, options: FormattingOptions): TextEdit[] {
    this.validateFormattingOptions(options);

    const tabSize = options.tabSize ?? 4;
    const insertSpaces = options.insertSpaces ?? true;
    const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

    const profile: FormattingProfile = {
      ...this.currentProfile,
      maxLineLength: options.maxLineLength ?? this.currentProfile.maxLineLength,
      braceStyle: options.braceStyle ?? this.currentProfile.braceStyle,
      spaceAroundOperators:
        options.spaceAroundOperators ?? this.currentProfile.spaceAroundOperators,
      blankLinesBetweenFunctions:
        options.blankLinesBetweenFunctions ?? this.currentProfile.blankLinesBetweenFunctions,
    };

    return formatPikeCodeWithProfile(text, indent, 0, profile);
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

    const profile: FormattingProfile = {
      ...this.currentProfile,
      maxLineLength: options.maxLineLength ?? this.currentProfile.maxLineLength,
      braceStyle: options.braceStyle ?? this.currentProfile.braceStyle,
      spaceAroundOperators:
        options.spaceAroundOperators ?? this.currentProfile.spaceAroundOperators,
      blankLinesBetweenFunctions:
        options.blankLinesBetweenFunctions ?? this.currentProfile.blankLinesBetweenFunctions,
    };

    const edits = formatPikeCodeWithProfile(text, indent, 0, profile);
    return edits.filter(
      edit => edit.range.start.line >= startLine && edit.range.start.line <= endLine
    );
  }
}

export function formatPikeCode(text: string, indent: string, startLine = 0): TextEdit[] {
  return computeIndentEdits(text, indent, startLine);
}

export function formatPikeCodeWithProfile(
  text: string,
  indent: string,
  startLine: number,
  profile: FormattingProfile
): TextEdit[] {
  const edits = computeIndentEdits(text, indent, startLine);

  if (profile.braceStyle === 'new-line') {
    edits.push(...applyBraceStyleTransformation(text, startLine));
  }

  if (profile.spaceAroundOperators) {
    edits.push(...applyOperatorSpacing(text, startLine));
  }

  if (profile.maxLineLength > 0) {
    edits.push(...applyLineLengthLimit(text, startLine, profile.maxLineLength));
  }

  return mergeAndSortEdits(edits);
}

function applyBraceStyleTransformation(text: string, startLine: number): TextEdit[] {
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

          const currentIndent = line.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';
          const prevIndent = prevLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

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

function applyOperatorSpacing(text: string, startLine: number): TextEdit[] {
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

function applyLineLengthLimit(text: string, startLine: number, maxLineLength: number): TextEdit[] {
  const edits: TextEdit[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.length > maxLineLength) {
      const leadingWhitespace = line.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

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

function mergeAndSortEdits(edits: TextEdit[]): TextEdit[] {
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
