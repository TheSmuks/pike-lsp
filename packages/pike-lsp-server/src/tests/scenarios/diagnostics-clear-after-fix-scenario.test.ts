/**
 * Scenario test for: Diagnostics should clear after fixing errors
 *
 * Proves that when a user fixes a syntax error, the diagnostic
 * should be cleared (not persist).
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { classifyChange } from '../../features/diagnostics/change-detection.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import type { DocumentCacheEntry } from '../../core/types.js';

/**
 * Creates a minimal cache entry for testing
 */
function makeEntry(
  code: string,
  options: {
    version?: number;
    diagnostics?: Array<{ message: string; severity: number }>;
    parseFailed?: boolean;
    isStale?: boolean;
    symbolPositions?: Map<string, unknown>;
  } = {}
): DocumentCacheEntry {
  return {
    version: options.version ?? 1,
    symbols: [],
    diagnostics: options.diagnostics ?? [],
    symbolPositions: options.symbolPositions ?? new Map(),
    symbolNames: new Map(),
    contentHash: computeContentHash(code),
    lineHashes: computeLineHashes(code),
    analysisState: {
      isStale: options.isStale ?? false,
      parseFailed: options.parseFailed ?? false,
    },
  };
}

describe('Scenario: Diagnostics clear after fix', () => {
  it('should NOT skip validation when previous parse failed (errors exist)', () => {
    const brokenCode = `int main() {
  int x = 42
  return 0;
}`;

    const cachedEntry = makeEntry(brokenCode, {
      parseFailed: true,
    });

    const fixedCode = `int main() {
  int x = 42;
  return 0;
}`;

    const document = TextDocument.create('file:///test.pike', 'pike', 2, fixedCode);
    const result = classifyChange(document, undefined, cachedEntry);

    console.log('=== Fix: Added semicolon ===');
    console.log('parseFailed:', cachedEntry.analysisState?.parseFailed);
    console.log('Classification:', result);

    assert.equal(
      result.canSkip,
      false,
      `When previous parse failed, canSkip must be false. Got: ${JSON.stringify(result)}`
    );
  });

  it('should NOT skip validation when previous diagnostics had errors', () => {
    const brokenCode = 'int x = ;';
    const cachedEntry = makeEntry(brokenCode, {
      parseFailed: true,
    });

    const fixedCode = 'int x = 1;';

    const document = TextDocument.create('file:///test.pike', 'pike', 2, fixedCode);
    const result = classifyChange(document, undefined, cachedEntry);

    console.log('\n=== Fix: Fixed syntax error ===');
    console.log('Classification:', result);

    assert.equal(
      result.canSkip,
      false,
      `When previous had errors, canSkip must be false. Got: ${JSON.stringify(result)}`
    );
  });

  it('should allow skipping when previous parse succeeded and content unchanged', () => {
    const code = `int main() {
  return 0;
}`;

    const cachedEntry = makeEntry(code, {
      parseFailed: false,
    });

    const changedCode = `int main() {
  return 0;
}`;

    const document = TextDocument.create('file:///test.pike', 'pike', 2, changedCode);
    const result = classifyChange(document, undefined, cachedEntry);

    console.log('\n=== Whitespace/minor change ===');
    console.log('parseFailed:', cachedEntry.analysisState?.parseFailed);
    console.log('Classification:', result);

    assert.equal(
      result.canSkip,
      true,
      `When no previous errors and content unchanged, can skip. Got: ${JSON.stringify(result)}`
    );
  });

  it('should clear diagnostics when code is fixed', () => {
    const brokenCode = 'int x = ;';
    const fixedCode = 'int x = 1;';

    const cachedEntry = makeEntry(brokenCode, {
      parseFailed: true,
    });

    const document = TextDocument.create('file:///test.pike', 'pike', 2, fixedCode);
    const result = classifyChange(document, undefined, cachedEntry);

    console.log('\n=== Critical test: Fixed code should trigger revalidation ===');
    console.log('Classification:', result);

    assert.equal(
      result.canSkip,
      false,
      'CRITICAL: When previous parse failed, canSkip MUST be false so we re-validate and clear errors'
    );
  });
});
