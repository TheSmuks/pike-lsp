import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  hasOnlyValidSymbolPositions,
  isPositionWithinDocument,
  assertInvariant,
} from './invariants.js';
import { cacheEntryArbitrary, textDocumentArbitrary } from './generators.js';

describe('Property Invariant: symbol positions valid', () => {
  it('keeps all cached symbol positions within document bounds', () => {
    const validEntryArbitrary = textDocumentArbitrary().chain(document =>
      cacheEntryArbitrary(document).map(entry => ({ document, entry }))
    );

    assertInvariant(
      'symbol-positions-valid',
      fc.property(validEntryArbitrary, ({ document, entry }) => {
        assert.equal(hasOnlyValidSymbolPositions(document.getText(), entry), true);
      })
    );
  });

  it('detects out-of-bounds symbol positions', () => {
    assertInvariant(
      'symbol-positions-detect-invalid',
      fc.property(textDocumentArbitrary(), document => {
        const text = document.getText();
        const invalid = {
          line: text.split('\n').length + 2,
          character: 0,
        };

        assert.equal(isPositionWithinDocument(text, invalid), false);
      })
    );
  });
});
