import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { classifyChange } from '../../../features/diagnostics/change-detection.js';
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

describe('classifyChange', () => {
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
  });
});
