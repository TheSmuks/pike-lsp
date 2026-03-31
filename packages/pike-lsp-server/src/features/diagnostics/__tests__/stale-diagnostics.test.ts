import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { classifyChange } from '../change-detection.js';
import { computeContentHash, computeLineHashes } from '../../../services/document-cache.js';
import type { DocumentCacheEntry } from '../../../core/types.js';

function makeEntry(text: string, overrides?: Partial<DocumentCacheEntry>): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash: computeContentHash(text),
    lineHashes: computeLineHashes(text),
    analysisState: { isStale: false, parseFailed: false },
    ...overrides,
  };
}

function errorDiagnostic(line: number, message: string) {
  return {
    message,
    severity: 1 as const,
    range: {
      start: { line, character: 0 },
      end: { line, character: 10 },
    },
    source: 'pike',
  };
}

describe('Issue #1052: stale error diagnostics after modification', () => {
  it('should not skip when cache has error diagnostics and parse succeeded', () => {
    const text = 'int x = ;\n';
    const cachedEntry = makeEntry(text, {
      diagnostics: [errorDiagnostic(0, 'Syntax error')],
    });

    const doc = TextDocument.create('file:///test.pike', 'pike', 2, text);
    const result = classifyChange(doc, undefined, cachedEntry);

    assert.equal(result.canSkip, false);
    assert.equal(result.reason, 'has_error_diagnostics');
  });

  it('should not skip when error diagnostics exist and only whitespace changed', () => {
    const previous = 'int x = ;\n';
    const current = 'int x = ;   \n';
    const cachedEntry = makeEntry(previous, {
      diagnostics: [errorDiagnostic(0, 'Syntax error')],
    });

    const doc = TextDocument.create('file:///test.pike', 'pike', 2, current);
    const result = classifyChange(
      doc,
      { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
      cachedEntry
    );

    assert.equal(result.canSkip, false);
    assert.equal(result.reason, 'has_error_diagnostics');
  });

  it('should not skip when error diagnostics exist and edit is on a different line', () => {
    const previous = 'int a = 1;\nint x = ;\n';
    const current = 'int a = 2;\nint x = ;\n';
    const cachedEntry = makeEntry(previous, {
      diagnostics: [errorDiagnostic(1, 'Syntax error')],
    });

    const doc = TextDocument.create('file:///test.pike', 'pike', 2, current);
    const result = classifyChange(
      doc,
      { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
      cachedEntry
    );

    assert.equal(result.canSkip, false);
    assert.equal(result.reason, 'has_error_diagnostics');
  });

  it('should allow skipping when there are only warning diagnostics', () => {
    const previous = 'int x = 1;\n';
    const current = 'int x = 1;   \n';
    const cachedEntry = makeEntry(previous, {
      diagnostics: [
        {
          message: 'Unused variable',
          severity: 2,
          range: {
            start: { line: 0, character: 4 },
            end: { line: 0, character: 5 },
          },
          source: 'pike',
        },
      ],
    });

    const doc = TextDocument.create('file:///test.pike', 'pike', 2, current);
    const result = classifyChange(
      doc,
      { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
      cachedEntry
    );

    assert.equal(result.canSkip, true);
    assert.equal(result.reason, 'semantic_unchanged');
  });

  it('should allow skipping when diagnostics array is empty', () => {
    const previous = 'int x = 1;\n';
    const current = 'int x = 1;   \n';
    const cachedEntry = makeEntry(previous);

    const doc = TextDocument.create('file:///test.pike', 'pike', 2, current);
    const result = classifyChange(
      doc,
      { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
      cachedEntry
    );

    assert.equal(result.canSkip, true);
    assert.equal(result.reason, 'semantic_unchanged');
  });

  it('should not skip with error diagnostics even if semantic content unchanged on changed line', () => {
    const previous = 'int x = ;\n// comment\n';
    const current = 'int x = ;\n// comment changed\n';
    const cachedEntry = makeEntry(previous, {
      diagnostics: [errorDiagnostic(0, 'Syntax error')],
    });

    const doc = TextDocument.create('file:///test.pike', 'pike', 2, current);
    const result = classifyChange(
      doc,
      { start: { line: 1, character: 3 }, end: { line: 1, character: 10 } },
      cachedEntry
    );

    assert.equal(result.canSkip, false);
    assert.equal(result.reason, 'has_error_diagnostics');
  });
});
