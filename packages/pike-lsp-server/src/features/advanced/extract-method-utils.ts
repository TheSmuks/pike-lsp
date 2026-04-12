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
 * The caller is responsible for stripping comments/strings first.
 * Uses indexOf + char-level word-boundary check instead of RegExp.
 */
export function isIdentPresent(code: string, ident: string): boolean {
  if (ident.length === 0) return false;

  let pos = 0;
  while (true) {
    const idx = code.indexOf(ident, pos);
    if (idx === -1) return false;

    // Check character before — must not be a word char
    if (idx > 0 && isWordChar(code.charAt(idx - 1))) {
      pos = idx + 1;
      continue;
    }

    // Check character after — must not be a word char
    const after = idx + ident.length;
    if (after < code.length && isWordChar(code.charAt(after))) {
      pos = idx + 1;
      continue;
    }

    return true;
  }
}

function isWordChar(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_'
  );
}

// ---------------------------------------------------------------------------
// Pike literal recognizers
// ---------------------------------------------------------------------------

function isHexDigit(ch: string): boolean {
  return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
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
