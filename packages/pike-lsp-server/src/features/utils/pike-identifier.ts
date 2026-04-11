/**
 * Pike Identifier Utilities
 *
 * Common utilities for parsing and handling Pike identifiers.
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Range, Position } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * Result from getWordRangeAtPosition
 */
export interface WordRangeResult {
  word: string;
  range: Range;
}

/**
 * Check if a character is a valid start of a Pike identifier.
 * Pike identifiers start with a letter or underscore only.
 *
 * @param char - Single character to check
 * @returns true if char can start a Pike identifier
 */
export function isPikeIdentifierStart(char: string): boolean {
  // First character: letter or underscore only
  return /^[a-zA-Z_]$/.test(char);
}

/**
 * Check if a character is valid within a Pike identifier.
 * Pike identifier characters are letters, digits, or underscores.
 *
 * @param char - Single character to check
 * @returns true if char is valid in a Pike identifier
 */
export function isPikeIdentifierChar(char: string): boolean {
  // Subsequent characters: letter, digit, or underscore
  return /^[a-zA-Z0-9_]$/.test(char);
}

/**
 * Get word and range at position in document.
 * Respects Pike identifier rules for boundary detection.
 *
 * @param document - The text document
 * @param position - Position in the document
 * @returns Object with word and range, or null if no identifier found
 */
export function getWordRangeAtPosition(
  document: TextDocument,
  position: { line: number; character: number }
): WordRangeResult | null {
  const text = document.getText();
  const offset = document.offsetAt(position);

  if (offset < 0 || offset >= text.length) {
    return null;
  }

  let start = offset;
  let end = offset;

  // Scan backward to find identifier start
  // Must respect Pike identifier rules: first char must be letter or underscore
  while (start > 0) {
    const prevChar = text[start - 1] ?? '';
    if (!isPikeIdentifierChar(prevChar)) {
      // Not an identifier character - we found a boundary
      break;
    }
    // Check if this would be a valid identifier start
    if (start === offset || isPikeIdentifierStart(text[start] ?? '')) {
      start--;
    } else {
      // This character is an identifier char but the one at 'start' isn't valid start
      // This means we hit a digit prefix like "123abc" - we should stop before the digit
      break;
    }
  }

  // Verify the start is actually a valid identifier start
  if (start < text.length && !isPikeIdentifierStart(text[start] ?? '')) {
    // The character at 'start' isn't valid (e.g., a digit)
    // We're likely on an invalid identifier - return null or try to find valid part
    // For now, return null to avoid false matches on invalid identifiers
    return null;
  }

  // Scan forward to find identifier end
  while (end < text.length && isPikeIdentifierChar(text[end] ?? '')) {
    end++;
  }

  if (start === end) {
    return null;
  }

  const word = text.slice(start, end);

  // Convert offsets back to positions
  const range = {
    start: document.positionAt(start),
    end: document.positionAt(end),
  };

  return { word, range };
}

/**
 * Get just the word string at a document position.
 * Wrapper around getWordRangeAtPosition that returns only the word.
 *
 * @param document - The text document
 * @param position - Position in the document
 * @returns The word at position, or null if no identifier found
 */
export function getWordAtPosition(
  document: TextDocument,
  position: { line: number; character: number }
): string | null {
  const result = getWordRangeAtPosition(document, position);
  return result?.word ?? null;
}

/**
 * Get word at position using generic word boundary detection.
 * Uses /\w/ regex which matches any word character (letters, digits, underscore).
 * This is the generic version for backwards compatibility.
 *
 * @param document - The text document
 * @param position - Position in the document
 * @returns The word at position, or null if no word found
 */
export function getWordAtPositionGeneric(
  document: TextDocument,
  position: { line: number; character: number }
): string | null {
  const text = document.getText();
  const offset = document.offsetAt(position);

  if (offset < 0 || offset >= text.length) {
    return null;
  }

  let start = offset;
  let end = offset;

  while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
    start--;
  }

  while (end < text.length && /\w/.test(text[end] ?? '')) {
    end++;
  }

  const word = text.slice(start, end);
  return word || null;
}

/**
 * Extract the word (identifier) at the given text offset.
 * Respects Pike identifier rules for boundary detection.
 *
 * @param text - The full document text
 * @param offset - Character offset in the text
 * @returns Object with word and offsets, or null if no identifier found
 */
export function getWordAtOffset(
  text: string,
  offset: number
): { word: string; startOffset: number; endOffset: number } | null {
  if (offset < 0 || offset >= text.length) {
    return null;
  }

  const mockDocument = {
    getText: () => text,
    offsetAt: (pos: { line: number; character: number }) => pos.character,
    positionAt: (o: number) => ({ line: 0, character: o }),
  } as unknown as TextDocument;

  const result = getWordRangeAtPosition(mockDocument, { line: 0, character: offset });
  if (!result) {
    return null;
  }

  const startOffset = mockDocument.offsetAt(result.range.start);
  const endOffset = mockDocument.offsetAt(result.range.end);

  return {
    word: result.word,
    startOffset,
    endOffset,
  };
}

/**
 * Extract the word at the given text offset using generic word boundary detection.
 * Uses /\w/ regex which matches any word character (letters, digits, underscore).
 * This is the generic version for backwards compatibility.
 *
 * @param text - The full document text
 * @param offset - Character offset in the text
 * @returns Object with word and offsets, or null if no word found
 */
export function getWordAtOffsetGeneric(
  text: string,
  offset: number
): { word: string; startOffset: number; endOffset: number } | null {
  if (offset < 0 || offset >= text.length) {
    return null;
  }

  let start = offset;
  let end = offset;

  while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
    start--;
  }

  while (end < text.length && /\w/.test(text[end] ?? '')) {
    end++;
  }

  if (start === end) {
    return null;
  }

  return {
    word: text.slice(start, end),
    startOffset: start,
    endOffset: end,
  };
}

/**
 * Get word at offset in text using generic word boundary detection.
 * Uses /\w/ regex which matches any word character.
 * Returns empty string if no word found (for backwards compatibility with completion.ts).
 *
 * @param text - The text
 * @param offset - Character offset in the text
 * @returns The word at offset, or empty string if not found
 */
export function getWordAtOffsetString(text: string, offset: number): string {
  if (offset < 0 || offset >= text.length) {
    return '';
  }

  let start = offset;
  while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
    start--;
  }

  let end = offset;
  while (end < text.length && /\w/.test(text[end] ?? '')) {
    end++;
  }

  return text.slice(start, end);
}

/**
 * Find symbol at given position in document by extracting word and searching symbols.
 *
 * @param symbols - Array of symbols to search
 * @param position - Position in the document
 * @param document - The text document (optional, for word extraction)
 * @returns The matching symbol, or null if not found
 */
export function findSymbolAtPosition(
  symbols: PikeSymbol[],
  position: Position,
  document?: TextDocument
): PikeSymbol | null {
  if (!document) {
    return null;
  }

  const text = document.getText();
  const offset = document.offsetAt(position);

  let start = offset;
  let end = offset;

  while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
    start--;
  }
  while (end < text.length && /\w/.test(text[end] ?? '')) {
    end++;
  }

  const word = text.slice(start, end);
  if (!word) {
    return null;
  }

  for (const symbol of symbols) {
    if (symbol.name === word) {
      return symbol;
    }

    if (symbol.kind === 'inherit' || symbol.kind === 'import' || symbol.kind === 'include') {
      const classname = symbol.classname?.replace(/['"]/g, '');
      // Check if classname matches word or part of it (e.g. Stdio in Stdio.File)
      if (classname === word || (classname && classname.includes(word))) {
        return symbol;
      }
    }
  }

  return null;
}
