/// <reference path="./bun-test.d.ts" />

import { describe, expect, test } from 'bun:test';
import { computeFormattingWindow, isIndentationSensitiveChange } from '../format-on-change';

function makeChangeEvent(changes: Array<{ startLine: number; startChar: number; endLine: number; endChar: number; text: string; rangeLength?: number }>, lineCount = 20): any {
  return {
    document: { lineCount, uri: { toString: () => 'file:///test.pike' }, languageId: 'pike' },
    contentChanges: changes.map(change => ({
      range: {
        start: { line: change.startLine, character: change.startChar },
        end: { line: change.endLine, character: change.endChar },
      },
      rangeLength: change.rangeLength ?? 1,
      text: change.text,
    })),
  };
}

describe('format-on-change helpers', () => {
  test('detects newline insertion as indentation-sensitive', () => {
    const event = makeChangeEvent([
      { startLine: 4, startChar: 12, endLine: 4, endChar: 12, text: '\n', rangeLength: 0 },
    ]);
    expect(isIndentationSensitiveChange(event)).toBe(true);
  });

  test('detects multiline replacement as indentation-sensitive', () => {
    const event = makeChangeEvent([
      { startLine: 7, startChar: 0, endLine: 8, endChar: 3, text: 'a\nb' },
    ]);
    expect(isIndentationSensitiveChange(event)).toBe(true);
  });

  test('ignores simple same-line character edits', () => {
    const event = makeChangeEvent([
      { startLine: 3, startChar: 5, endLine: 3, endChar: 6, text: 'x' },
    ]);
    expect(isIndentationSensitiveChange(event)).toBe(false);
  });

  test('computes expanded formatting window around changed lines', () => {
    const event = makeChangeEvent([
      { startLine: 10, startChar: 0, endLine: 10, endChar: 0, text: '\n' },
    ], 30);

    const range = computeFormattingWindow(event);
    expect(range.startLine).toBe(9);
    expect(range.endLine).toBe(13);
  });

  test('caps formatting window to document bounds', () => {
    const event = makeChangeEvent([
      { startLine: 0, startChar: 0, endLine: 0, endChar: 0, text: '\n' },
    ], 2);

    const range = computeFormattingWindow(event);
    expect(range.startLine).toBe(0);
    expect(range.endLine).toBe(1);
  });
});
