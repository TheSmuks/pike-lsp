/**
 * Text Utilities
 *
 * Shared utilities for text manipulation in the LSP server.
 * Provides canonical implementations for common operations that were
 * previously duplicated across multiple feature handlers.
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Range } from 'vscode-languageserver/node.js';

/**
 * Result from extracting a word at a position.
 */
export interface WordAtPosition {
  /** The extracted word */
  word: string;
  /** Byte offset of the word start */
  startOffset: number;
  /** Byte offset of the word end */
  endOffset: number;
}

/**
 * Extract the word (identifier) at the given text offset.
 * Uses word-character matching (\w equivalent) for boundary detection.
 *
 * This is the canonical implementation — prefer this over inline extraction.
 *
 * @param text - The full document text
 * @param offset - Character offset in the text
 * @returns Word info or null if no word found at offset
 */
export function getWordAtOffset(text: string, offset: number): WordAtPosition | null {
  if (offset < 0 || offset >= text.length) {
    return null;
  }

  let start = offset;
  let end = offset;

  // Expand backwards to find word boundary
  while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
    start--;
  }

  // Expand forwards to find word boundary
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
 * Extract the word at a document position using offset-based extraction.
 *
 * @param document - The text document
 * @param position - Position in the document (0-based)
 * @returns Word info or null if no word found
 */
export function getWordAtPosition(
  document: TextDocument,
  position: { line: number; character: number }
): WordAtPosition | null {
  const text = document.getText();
  const offset = document.offsetAt(position);
  return getWordAtOffset(text, offset);
}

/**
 * Get just the word string at a document position.
 * Convenience wrapper for cases that only need the word.
 *
 * @param document - The text document
 * @param position - Position in the document
 * @returns The word at position, or null
 */
export function getWordString(
  document: TextDocument,
  position: { line: number; character: number }
): string | null {
  const result = getWordAtPosition(document, position);
  return result?.word ?? null;
}

/**
 * Convert word extraction result to an LSP Range.
 *
 * @param document - The text document for position conversion
 * @param wordInfo - The word extraction result
 * @returns LSP Range corresponding to the word
 */
export function wordToRange(document: TextDocument, wordInfo: WordAtPosition): Range {
  return {
    start: document.positionAt(wordInfo.startOffset),
    end: document.positionAt(wordInfo.endOffset),
  };
}

/**
 * Check if a character is a word character (letters, digits, underscore).
 * This is the explicit version of the /\w/ regex for performance-critical paths.
 */
export function isWordChar(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}
