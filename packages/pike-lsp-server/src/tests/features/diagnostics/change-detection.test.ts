import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { classifyChange } from '../../../features/diagnostics/change-detection.js';
import { applySkippedValidationCacheUpdate } from '../../../features/diagnostics/index.js';
import { computeContentHash, computeLineHashes } from '../../../services/document-cache.js';
import type { DocumentCacheEntry } from '../../../core/types.js';

function makeCachedEntry(text: string): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash: computeContentHash(text),
    lineHashes: computeLineHashes(text),
  };
}

function makeCachedEntryWithErrors(text: string, errorDiagnostics: unknown[]): DocumentCacheEntry {
  const entry = makeCachedEntry(text);
  entry.diagnostics = errorDiagnostics as DocumentCacheEntry['diagnostics'];
  entry.analysisState = { isStale: false, parseFailed: true };
  return entry;
}

describe('classifyChange', () => {
  // =========================================================================
  // REGRESSION: Syntax error diagnostics persist after edit
  // =========================================================================
  describe('Regression: parseFailed forces re-validation', () => {
    it('does not skip when previous parse had errors (parseFailed)', () => {
      const previousText = 'int x = ;\n'; // syntax error
      const currentText = 'int x = 1;\n'; // fixed
      const cachedEntry = makeCachedEntryWithErrors(previousText, [
        {
          message: 'Syntax error',
          severity: 1,
          range: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
          source: 'pike',
        },
      ]);

      const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

      const result = classifyChange(
        document,
        { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } },
        cachedEntry
      );

      expect(result.canSkip).toBe(false);
      expect(result.reason).toBe('previous_parse_failed');
    });

    it('does not skip when previous parse failed and edit is on different line', () => {
      const previousText = 'int a = 1;\nint x = ;\n'; // error on line 2
      const currentText = 'int a = 2;\nint x = ;\n'; // edit on line 1, error still on line 2
      const cachedEntry = makeCachedEntryWithErrors(previousText, [
        {
          message: 'Syntax error',
          severity: 1,
          range: { start: { line: 1, character: 8 }, end: { line: 1, character: 9 } },
          source: 'pike',
        },
      ]);

      const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

      const result = classifyChange(
        document,
        { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
        cachedEntry
      );

      expect(result.canSkip).toBe(false);
      expect(result.reason).toBe('previous_parse_failed');
    });

    it('does not skip when previous parse failed and only whitespace changed', () => {
      const previousText = 'int x = ;\n'; // syntax error
      const currentText = 'int x = ;   \n'; // only trailing whitespace added
      const cachedEntry = makeCachedEntryWithErrors(previousText, [
        {
          message: 'Syntax error',
          severity: 1,
          range: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
          source: 'pike',
        },
      ]);

      const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

      const result = classifyChange(
        document,
        { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
        cachedEntry
      );

      expect(result.canSkip).toBe(false);
      expect(result.reason).toBe('previous_parse_failed');
    });

    it('does not skip when parseFailed is true even with no change range (full document)', () => {
      const text = 'int x = ;\n';
      const cachedEntry = makeCachedEntryWithErrors(text, [
        {
          message: 'Syntax error',
          severity: 1,
          range: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
          source: 'pike',
        },
      ]);

      const document = TextDocument.create('file:///test.pike', 'pike', 2, text);

      const result = classifyChange(document, undefined, cachedEntry);

      expect(result.canSkip).toBe(false);
      expect(result.reason).toBe('previous_parse_failed');
    });

    it('does not skip when parseFailed is true with content_unchanged path', () => {
      const text = 'int x = ;\n';
      const cachedEntry = makeCachedEntryWithErrors(text, [
        {
          message: 'Syntax error',
          severity: 1,
          range: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
          source: 'pike',
        },
      ]);

      // No change range, same content — content hash matches, but parseFailed should block skip
      const document = TextDocument.create('file:///test.pike', 'pike', 2, text);

      const result = classifyChange(document, undefined, cachedEntry);

      expect(result.canSkip).toBe(false);
      expect(result.reason).toBe('previous_parse_failed');
    });

    it('does not skip after fixing error then making non-semantic edit on same line', () => {
      // Simulates: error fixed (parseFailed=false), then trailing whitespace added
      const previousText = 'int x = 1;\n'; // was fixed
      const currentText = 'int x = 1;   \n'; // trailing whitespace
      const cachedEntry = makeCachedEntry(previousText);
      cachedEntry.analysisState = { isStale: false, parseFailed: false };

      const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

      const result = classifyChange(
        document,
        { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
        cachedEntry
      );

      // After successful parse, whitespace-only change should skip
      expect(result.canSkip).toBe(true);
      expect(result.reason).toBe('semantic_unchanged');
    });

    it('handles undefined analysisState as parse-not-failed (can skip)', () => {
      const previousText = 'int x = 1;\n';
      const currentText = 'int x = 1;   \n';
      const cachedEntry = makeCachedEntry(previousText);
      // analysisState is undefined — treat as "no error"
      delete cachedEntry.analysisState;

      const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

      const result = classifyChange(
        document,
        { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
        cachedEntry
      );

      expect(result.canSkip).toBe(true);
    });

    it('handles isStale=true but parseFailed=false as safe to skip', () => {
      const previousText = 'int x = 1;\n';
      const currentText = 'int x = 1;   \n';
      const cachedEntry = makeCachedEntry(previousText);
      cachedEntry.analysisState = { isStale: true, parseFailed: false };

      const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

      const result = classifyChange(
        document,
        { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
        cachedEntry
      );

      expect(result.canSkip).toBe(true);
      expect(result.reason).toBe('semantic_unchanged');
    });
  });

  it('does not skip when a code line is deleted to empty text', () => {
    const previousText = 'int x = 1;\nint y = 2;\n';
    const currentText = 'int x = 1;\n\n';
    const cachedEntry = makeCachedEntry(previousText);
    const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

    const result = classifyChange(
      document,
      {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 10 },
      },
      cachedEntry
    );

    expect(result.canSkip).toBe(false);
  });

  it('does not skip when code is replaced with a comment', () => {
    const previousText = 'int x = 1;\nint y = 2;\n';
    const currentText = 'int x = 1;\n// int y = 2;\n';
    const cachedEntry = makeCachedEntry(previousText);
    const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

    const result = classifyChange(
      document,
      {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 10 },
      },
      cachedEntry
    );

    expect(result.canSkip).toBe(false);
  });

  it('skips when only trailing whitespace changes', () => {
    const previousText = 'int x = 1;\n';
    const currentText = 'int x = 1;   \n';
    const cachedEntry = makeCachedEntry(previousText);
    const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

    const result = classifyChange(
      document,
      {
        start: { line: 0, character: 10 },
        end: { line: 0, character: 10 },
      },
      cachedEntry
    );

    expect(result.canSkip).toBe(true);
    expect(result.reason).toBe('semantic_unchanged');
    expect(result.newLineHashes).toBe(cachedEntry.lineHashes);
  });

  it('does not skip when incremental edit changes total line count', () => {
    const previousText = 'int x = 1;\nint y = 2;\n';
    const currentText = 'int x = 1;\n';
    const cachedEntry = makeCachedEntry(previousText);
    const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

    const result = classifyChange(
      document,
      {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 10 },
      },
      cachedEntry
    );

    expect(result.canSkip).toBe(false);
    expect(result.reason).toBe('line_count_changed');
    expect(result.newLineHashes).toBeUndefined();
  });

  it('does not return line hashes when semantic content changed', () => {
    const previousText = 'int x = 1;\n';
    const currentText = 'int x = 2;\n';
    const cachedEntry = makeCachedEntry(previousText);
    const document = TextDocument.create('file:///test.pike', 'pike', 2, currentText);

    const result = classifyChange(
      document,
      {
        start: { line: 0, character: 8 },
        end: { line: 0, character: 9 },
      },
      cachedEntry
    );

    expect(result.canSkip).toBe(false);
    expect(result.reason).toBe('semantic_changed');
    expect(result.newLineHashes).toBeUndefined();
  });
});

describe('applySkippedValidationCacheUpdate', () => {
  it('updates cache version when skip classification has no newHash', () => {
    const previousText = 'int x = 1;\n';
    const cacheEntry = makeCachedEntry(previousText);
    const previousHash = cacheEntry.contentHash;

    applySkippedValidationCacheUpdate(cacheEntry, 2, {
      newLineHashes: cacheEntry.lineHashes,
    });

    expect(cacheEntry.version).toBe(2);
    expect(cacheEntry.contentHash).toBe(previousHash);
  });

  it('updates content and line hashes when provided', () => {
    const previousText = 'int x = 1;\n';
    const updatedText = 'int x = 10;\n';
    const cacheEntry = makeCachedEntry(previousText);
    const newHash = computeContentHash(updatedText);
    const newLineHashes = computeLineHashes(updatedText);

    applySkippedValidationCacheUpdate(cacheEntry, 3, {
      newHash,
      newLineHashes,
    });

    expect(cacheEntry.version).toBe(3);
    expect(cacheEntry.contentHash).toBe(newHash);
    expect(cacheEntry.lineHashes).toEqual(newLineHashes);
  });
});
