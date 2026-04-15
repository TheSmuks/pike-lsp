import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import {
  computeContentHash,
  computeLineHashes,
  stripLineComments,
  computeSemanticLineHash,
} from '../services/document-cache.js';

describe('computeContentHash', () => {
  it('returns a zero-padded 8-character hex string', () => {
    const hash = computeContentHash('hello');
    assert.match(hash, /^[0-9a-f]{8}$/, `Expected 8-char hex, got "${hash}"`);
  });

  it('returns the same hash for identical content', () => {
    assert.strictEqual(computeContentHash('int x;'), computeContentHash('int x;'));
  });

  it('returns different hashes for different content', () => {
    assert.notStrictEqual(computeContentHash('int x;'), computeContentHash('int y;'));
  });

  it('handles empty string', () => {
    const hash = computeContentHash('');
    assert.match(hash, /^[0-9a-f]{8}$/);
  });

  it('handles Unicode content', () => {
    const hash = computeContentHash('/* 日本語 */ int main();');
    assert.match(hash, /^[0-9a-f]{8}$/);
  });

  it('handles content with only whitespace', () => {
    const hash = computeContentHash('   \n\t\n   ');
    assert.match(hash, /^[0-9a-f]{8}$/);
  });

  it('produces FNV-1a known-value for empty string', () => {
    // FNV-1a 32-bit of "" is the offset basis 2166136261 = 0x811c9dc5
    assert.strictEqual(computeContentHash(''), '811c9dc5');
  });

  it('produces FNV-1a known-value for single character "a"', () => {
    // hash = (0x811c9dc5 ^ 0x61) * 0x01000193 = 0xe40c292c
    assert.strictEqual(computeContentHash('a'), 'e40c292c');
  });
});

describe('computeLineHashes', () => {
  it('returns one hash per line', () => {
    const hashes = computeLineHashes('a\nb\nc');
    assert.strictEqual(hashes.length, 3);
  });

  it('returns a single hash for content with no newlines', () => {
    const hashes = computeLineHashes('single line');
    assert.strictEqual(hashes.length, 1);
  });

  it('returns a single-element array for empty string (empty line hash)', () => {
    const hashes = computeLineHashes('');
    assert.strictEqual(hashes.length, 1);
    // FNV-1a of empty string
    assert.strictEqual(hashes[0], 2166136261);
  });

  it('returns identical hashes for semantically identical lines', () => {
    const content = 'int x;  // comment\nint x;';
    const hashes = computeLineHashes(content);
    // Both lines strip to "int x;" — same semantic hash
    assert.strictEqual(hashes[0], hashes[1]);
  });

  it('returns different hashes for semantically different lines', () => {
    const content = 'int x;\nint y;';
    const hashes = computeLineHashes(content);
    assert.notStrictEqual(hashes[0], hashes[1]);
  });

  it('produces correct number of elements for trailing newline', () => {
    // "a\n" splits into ["a", ""] — two lines
    const hashes = computeLineHashes('a\n');
    assert.strictEqual(hashes.length, 2);
  });
});

describe('stripLineComments', () => {
  it('strips content after //', () => {
    assert.strictEqual(stripLineComments('int x; // a comment'), 'int x;');
  });

  it('trims whitespace from the result', () => {
    assert.strictEqual(stripLineComments('  int x;  '), 'int x;');
  });

  it('returns empty string for a comment-only line', () => {
    assert.strictEqual(stripLineComments('// just a comment'), '');
  });

  it('returns the line unchanged when no comment marker is present', () => {
    assert.strictEqual(stripLineComments('int x;'), 'int x;');
  });

  it('returns empty string for empty input', () => {
    assert.strictEqual(stripLineComments(''), '');
  });

  it('handles whitespace-only input', () => {
    assert.strictEqual(stripLineComments('   '), '');
  });

  it('does not strip // inside a string literal (known bug — pending fix)', () => {
    // stripLineComments uses indexOf('//') naively and does not track string state.
    // This test documents the bug: the // inside the string is treated as a comment marker.
    const result = stripLineComments('string s = "http://example.com";');
    // Current buggy behavior: strips everything after the first //
    assert.strictEqual(
      result,
      'string s = "http:', // bug: comment marker inside string literal is not ignored
      'Expected buggy behavior — // inside string literal is incorrectly treated as comment'
    );
  });

  it('does not strip // inside a single-quoted Pike char literal (known bug — pending fix)', () => {
    const result = stripLineComments("int c = '//'; // actual comment");
    // Current buggy behavior: strips after the first //
    assert.strictEqual(
      result,
      "int c = '", // bug: comment marker inside char literal is not ignored
      'Expected buggy behavior — // inside char literal is incorrectly treated as comment'
    );
  });
});

describe('computeSemanticLineHash', () => {
  it('ignores trailing comments', () => {
    const h1 = computeSemanticLineHash('int x; // comment');
    const h2 = computeSemanticLineHash('int x;');
    assert.strictEqual(h1, h2);
  });

  it('ignores leading/trailing whitespace', () => {
    const h1 = computeSemanticLineHash('  int x;  ');
    const h2 = computeSemanticLineHash('int x;');
    assert.strictEqual(h1, h2);
  });

  it('returns the same value as FNV-1a of the stripped line', () => {
    const line = 'int x; // comment';
    const expected = computeContentHash('int x;');
    // computeSemanticLineHash returns the raw number, computeContentHash returns hex string
    const actual = computeSemanticLineHash(line).toString(16).padStart(8, '0');
    assert.strictEqual(actual, expected);
  });

  it('returns the empty-string FNV-1a hash for a comment-only line', () => {
    const hash = computeSemanticLineHash('// only comment');
    // After stripping: "" → FNV-1a("") = 0x811c9dc5 = 2166136261
    assert.strictEqual(hash, 2166136261);
  });

  it('returns different hashes for semantically different lines', () => {
    const h1 = computeSemanticLineHash('int x;');
    const h2 = computeSemanticLineHash('int y;');
    assert.notStrictEqual(h1, h2);
  });

  it('returns zero-padded FNV-1a for empty string input', () => {
    const hash = computeSemanticLineHash('');
    assert.strictEqual(hash, 2166136261); // FNV-1a("")
  });
});
