import { ErrorCodes, ResponseError, TextEdit } from 'vscode-languageserver/node.js';

// Re-export types and profiles
export {
  type FormattingOptions,
  type FormattingProfile,
  PREDEFINED_PROFILES,
} from './formatting/formatting-profiles.js';

import {
  type FormattingOptions,
  type FormattingProfile,
  PREDEFINED_PROFILES,
} from './formatting/formatting-profiles.js';

import { computeIndentEdits } from './formatting/formatting-indentation.js';
import {
  applyBraceStyleTransformation,
  applyOperatorSpacing,
  applyLineLengthLimit,
  mergeAndSortEdits,
} from './formatting/formatting-transformations.js';

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

  private resolveProfile(options: FormattingOptions): FormattingProfile {
    return {
      ...this.currentProfile,
      maxLineLength: options.maxLineLength ?? this.currentProfile.maxLineLength,
      braceStyle: options.braceStyle ?? this.currentProfile.braceStyle,
      spaceAroundOperators:
        options.spaceAroundOperators ?? this.currentProfile.spaceAroundOperators,
      blankLinesBetweenFunctions:
        options.blankLinesBetweenFunctions ?? this.currentProfile.blankLinesBetweenFunctions,
    };
  }

  formatDocument(text: string, options: FormattingOptions): TextEdit[] {
    this.validateFormattingOptions(options);

    const tabSize = options.tabSize ?? 4;
    const insertSpaces = options.insertSpaces ?? true;
    const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

    const profile = this.resolveProfile(options);

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

    const profile = this.resolveProfile(options);

    const edits = formatPikeCodeWithProfile(text, indent, 0, profile);
    return edits.filter(
      edit => edit.range.start.line <= endLine && edit.range.end.line >= startLine
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
