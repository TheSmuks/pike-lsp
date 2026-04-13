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
