/**
 * Extract Method — utility helpers
 *
 * Character-level Pike literal recognizers and code-stripping utilities
 * used by extract-method.ts. Kept in a separate module to stay under the
 * 500-line file limit.
 */

// ---------------------------------------------------------------------------
// Code stripping
// ---------------------------------------------------------------------------

/**
 * Strip Pike string literals, line comments, and block comments from code.
 * Replaces their content with spaces while preserving line structure so that
 * identifier positions remain valid for word-boundary checks.
 *
 * This is a lightweight alternative to full Parser.Pike tokenization for the
 * narrow purpose of checking whether a known symbol name appears in actual
 * code vs. inside a comment or string literal.
 */
export function stripCodeContent(code: string): string {
  const chars = code.split('');
  let i = 0;

  while (i < chars.length) {
    // Block comment /* ... */
    if (chars[i] === '/' && chars[i + 1] === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) {
        chars[i] = ' ';
        i++;
      }
      if (i < chars.length) {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i += 2;
      }
      continue;
    }

    // Line comment //
    if (chars[i] === '/' && chars[i + 1] === '/') {
      while (i < chars.length && chars[i] !== '\n') {
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    // Multi-line string literal #"..."
    if (chars[i] === '#' && chars[i + 1] === '"') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < chars.length && chars[i] !== '"') {
        chars[i] = ' ';
        i++;
      }
      if (i < chars.length) {
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    // Regular string literal "..."
    if (chars[i] === '"') {
      chars[i] = ' ';
      i++;
      while (i < chars.length && chars[i] !== '"') {
        // Skip escaped characters
        if (chars[i] === '\\' && i + 1 < chars.length) {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          continue;
        }
        chars[i] = ' ';
        i++;
      }
      if (i < chars.length) {
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    // Single-quoted character literal
    if (chars[i] === "'") {
      chars[i] = ' ';
      i++;
      while (i < chars.length && chars[i] !== "'") {
        if (chars[i] === '\\' && i + 1 < chars.length) {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          continue;
        }
        chars[i] = ' ';
        i++;
      }
      if (i < chars.length) {
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    i++;
  }

  return chars.join('');
}

// ---------------------------------------------------------------------------
// Identifier presence check
// ---------------------------------------------------------------------------

/**
 * Test whether `ident` appears as a standalone identifier in `code`.
 * Uses token boundaries from `tokenizeCode` for correctness.
 */
export function isIdentPresent(_code: string, ident: string, tokens: CodeToken[]): boolean {
  if (ident.length === 0) return false;

  for (const tok of tokens) {
    if (tok.kind === 'identifier' && tok.text === ident) return true;
  }
  return false;
}
// ---------------------------------------------------------------------------
// Pike literal recognizers
// ---------------------------------------------------------------------------

function isHexDigit(ch: string): boolean {
  return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

function isWordChar(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_'
  );
}

/**
 * Recognise Pike integer literals:
 *   - Decimal: [1-9][0-9]*  or  0
 *   - Hex:     0[xX][0-9a-fA-F]+
 *   - Octal:   0[0-7]*
 *   - Optional leading minus sign
 */
export function isIntegerLiteral(s: string): boolean {
  let i = 0;
  if (i < s.length && s.charAt(i) === '-') i++;
  if (i >= s.length) return false;

  // Hex: 0x...
  if (
    s.charAt(i) === '0' &&
    i + 1 < s.length &&
    (s.charAt(i + 1) === 'x' || s.charAt(i + 1) === 'X')
  ) {
    i += 2;
    if (i >= s.length || !isHexDigit(s.charAt(i))) return false;
    while (i < s.length && isHexDigit(s.charAt(i))) i++;
    return i === s.length;
  }

  // Octal: 0[0-7]*
  if (s.charAt(i) === '0') {
    i++;
    while (i < s.length && s.charAt(i) >= '0' && s.charAt(i) <= '7') i++;
    return i === s.length;
  }

  // Decimal: [1-9][0-9]*
  if (s.charAt(i) >= '1' && s.charAt(i) <= '9') {
    i++;
    while (i < s.length && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
    return i === s.length;
  }

  return false;
}

/**
 * Recognise Pike float literals:
 *   - \d+\.\d+([eE][+-]?\d+)?
 *   - \d+[eE][+-]?\d+
 *   - Optional leading minus sign
 */
export function isFloatLiteral(s: string): boolean {
  let i = 0;
  if (i < s.length && s.charAt(i) === '-') i++;

  // Must start with digits
  if (i >= s.length || s.charAt(i) < '0' || s.charAt(i) > '9') return false;
  while (i < s.length && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
  if (i >= s.length) return false;

  // Decimal point
  if (s.charAt(i) === '.') {
    i++;
    // Must have digits after decimal point
    if (i >= s.length || s.charAt(i) < '0' || s.charAt(i) > '9') return false;
    while (i < s.length && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
  }

  // Optional exponent
  if (i < s.length && (s.charAt(i) === 'e' || s.charAt(i) === 'E')) {
    i++;
    if (i < s.length && (s.charAt(i) === '+' || s.charAt(i) === '-')) i++;
    if (i >= s.length || s.charAt(i) < '0' || s.charAt(i) > '9') return false;
    while (i < s.length && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
  }

  return i === s.length;
}

// ---------------------------------------------------------------------------
// Line indentation
// ---------------------------------------------------------------------------

/**
 * Extract leading whitespace from a line using char-level scan.
 */
export function getLeadingWhitespace(line: string): string {
  let end = 0;
  while (end < line.length && (line.charAt(end) === ' ' || line.charAt(end) === '\t')) {
    end++;
  }
  return line.substring(0, end);
}

// ---------------------------------------------------------------------------
// Lightweight Pike tokenizer
// ---------------------------------------------------------------------------

/** Token kinds produced by the lightweight Pike lexer. */
export type CodeTokenKind =
  | 'keyword'
  | 'identifier'
  | 'number'
  | 'string'
  | 'comment'
  | 'punctuation'
  | 'whitespace'
  | 'other';

/** A single token from `tokenizeCode`. */
export interface CodeToken {
  kind: CodeTokenKind;
  /** Start offset (inclusive) in the source string. */
  start: number;
  /** End offset (exclusive) in the source string. */
  end: number;
  /** The exact text slice from source[ start .. end ). */
  text: string;
}

const PIKE_KEYWORDS = new Set([
  'if',
  'else',
  'while',
  'for',
  'foreach',
  'do',
  'switch',
  'case',
  'default',
  'return',
  'break',
  'continue',
  'typeof',
  'catch',
  'gauge',
  'class',
  'inherit',
  'import',
  'constant',
  'enum',
  'typedef',
  'lambda',
  'inline',
  'private',
  'protected',
  'public',
  'static',
  'final',
  'nomask',
  'optional',
  'variant',
  'void',
  'mixed',
  'int',
  'float',
  'string',
  'array',
  'mapping',
  'multiset',
  'object',
  'function',
  'program',
  'sscanf',
  'global',
  'local',
  'auto',
]);

/**
 * Lightweight synchronous Pike lexer.
 * Produces an array of `CodeToken` covering the entire input.
 * Handles string literals, character literals, comments, numbers,
 * identifiers/keywords, and punctuation.
 */
export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let i = 0;

  while (i < code.length) {
    const start = i;
    const ch = code.charAt(i);

    // ---- Block comment /* ... */ ----
    if (ch === '/' && code.charAt(i + 1) === '*') {
      i += 2;
      while (i < code.length) {
        if (code.charAt(i) === '*' && code.charAt(i + 1) === '/') {
          i += 2;
          break;
        }
        i++;
      }
      tokens.push({ kind: 'comment', start, end: i, text: code.substring(start, i) });
      continue;
    }

    // ---- Line comment // ... ----
    if (ch === '/' && code.charAt(i + 1) === '/') {
      i += 2;
      while (i < code.length && code.charAt(i) !== '\n') {
        i++;
      }
      tokens.push({ kind: 'comment', start, end: i, text: code.substring(start, i) });
      continue;
    }

    // ---- Multi-line string #"..." ----
    if (ch === '#' && code.charAt(i + 1) === '"') {
      i += 2;
      while (i < code.length && code.charAt(i) !== '"') {
        i++;
      }
      if (i < code.length) i++;
      tokens.push({ kind: 'string', start, end: i, text: code.substring(start, i) });
      continue;
    }

    // ---- Regular string "..." ----
    if (ch === '"') {
      i++;
      while (i < code.length) {
        const sc = code.charAt(i);
        if (sc === '\\' && i + 1 < code.length) {
          i += 2;
          continue;
        }
        if (sc === '"') {
          i++;
          break;
        }
        i++;
      }
      tokens.push({ kind: 'string', start, end: i, text: code.substring(start, i) });
      continue;
    }

    // ---- Character literal '...' ----
    if (ch === "'") {
      i++;
      while (i < code.length) {
        const sc = code.charAt(i);
        if (sc === '\\' && i + 1 < code.length) {
          i += 2;
          continue;
        }
        if (sc === "'") {
          i++;
          break;
        }
        i++;
      }
      tokens.push({ kind: 'string', start, end: i, text: code.substring(start, i) });
      continue;
    }

    // ---- Number literal ----
    if (ch >= '0' && ch <= '9') {
      // Hex: 0x...
      if (ch === '0' && (code.charAt(i + 1) === 'x' || code.charAt(i + 1) === 'X')) {
        i += 2;
        while (i < code.length && isHexDigit(code.charAt(i))) {
          i++;
        }
      } else {
        while (i < code.length && code.charAt(i) >= '0' && code.charAt(i) <= '9') {
          i++;
        }
        // Decimal point
        if (i < code.length && code.charAt(i) === '.') {
          i++;
          while (i < code.length && code.charAt(i) >= '0' && code.charAt(i) <= '9') {
            i++;
          }
        }
        // Exponent
        if (i < code.length && (code.charAt(i) === 'e' || code.charAt(i) === 'E')) {
          i++;
          if (i < code.length && (code.charAt(i) === '+' || code.charAt(i) === '-')) {
            i++;
          }
          while (i < code.length && code.charAt(i) >= '0' && code.charAt(i) <= '9') {
            i++;
          }
        }
      }
      tokens.push({ kind: 'number', start, end: i, text: code.substring(start, i) });
      continue;
    }

    // ---- Whitespace ----
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      while (i < code.length) {
        const wc = code.charAt(i);
        if (wc !== ' ' && wc !== '\t' && wc !== '\n' && wc !== '\r') break;
        i++;
      }
      tokens.push({ kind: 'whitespace', start, end: i, text: code.substring(start, i) });
      continue;
    }

    // ---- Identifier / keyword ----
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      i++;
      while (i < code.length) {
        const ic = code.charAt(i);
        if (!isWordChar(ic)) break;
        i++;
      }
      const text = code.substring(start, i);
      const kind = PIKE_KEYWORDS.has(text) ? 'keyword' : 'identifier';
      tokens.push({ kind, start, end: i, text });
      continue;
    }

    // ---- Punctuation ----
    if (isPunctuation(ch)) {
      i++;
      tokens.push({ kind: 'punctuation', start, end: i, text: ch });
      continue;
    }

    // ---- Fallback ----
    i++;
    tokens.push({ kind: 'other', start, end: i, text: ch });
  }

  return tokens;
}

function isPunctuation(ch: string): boolean {
  return ';,.:(){}[]<>+-*/%=!&|^~?@'.includes(ch);
}
