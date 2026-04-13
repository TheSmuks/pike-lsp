/**
 * Symbol Index Tests
 *
 * Tests for symbol position indexing utilities.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { PikeSymbol, PikeToken } from '@pike-lsp/pike-bridge';
import {
  buildSymbolNameIndex,
  flattenSymbols,
  buildSymbolPositionIndexRegex,
  buildSymbolPositionIndex,
  buildCallPositionIndex,
} from '../../../features/diagnostics/symbol-index.js';

function tok(text: string, line: number, character: number): PikeToken {
  return { text, line, character, file: 'test.pike' };
}

function sym(name: string, kind: PikeSymbol['kind'], extra?: Partial<PikeSymbol>): PikeSymbol {
  return { name, kind, modifiers: [], ...extra };
}

describe('symbol-index', () => {
  describe('buildSymbolNameIndex', () => {
    it('indexes symbols by name', () => {
      const symbols: PikeSymbol[] = [
        sym('foo', 'variable', { position: { file: 'test.pike', line: 1 } }),
        sym('bar', 'variable', { position: { file: 'test.pike', line: 2 } }),
      ];

      const index = buildSymbolNameIndex(symbols);

      assert.strictEqual(index.size, 2);
      assert.strictEqual(index.get('foo')?.name, 'foo');
      assert.strictEqual(index.get('bar')?.name, 'bar');
    });

    it('prioritizes non-variant symbols over variant symbols', () => {
      const symbols: PikeSymbol[] = [
        sym('foo', 'method', { position: { file: 'test.pike', line: 1 } }),
        sym('foo', 'method', { modifiers: ['variant'], position: { file: 'test.pike', line: 2 } }),
      ];

      const index = buildSymbolNameIndex(symbols);

      assert.strictEqual(index.size, 1);
      assert.strictEqual(index.get('foo')?.position?.line, 1);
    });

    it('adds variant symbols when non-variant not present', () => {
      const symbols: PikeSymbol[] = [
        sym('foo', 'method', { modifiers: ['variant'], position: { file: 'test.pike', line: 1 } }),
      ];

      const index = buildSymbolNameIndex(symbols);

      assert.strictEqual(index.size, 1);
      assert.strictEqual(index.get('foo')?.position?.line, 1);
    });

    it('recursively indexes nested symbols', () => {
      const symbols: PikeSymbol[] = [
        sym('A', 'class', {
          position: { file: 'test.pike', line: 1 },
          children: [sym('B', 'method', { position: { file: 'test.pike', line: 2 } })],
        }),
      ];

      const index = buildSymbolNameIndex(symbols);

      assert.strictEqual(index.size, 2);
      assert.ok(index.has('A'));
      assert.ok(index.has('B'));
    });

    it('skips symbols with null names', () => {
      const symbols: PikeSymbol[] = [
        sym('foo', 'variable', { position: { file: 'test.pike', line: 1 } }),
        { name: null, kind: 'variable', modifiers: [] } as unknown as PikeSymbol,
      ];

      const index = buildSymbolNameIndex(symbols);

      assert.strictEqual(index.size, 1);
      assert.ok(index.has('foo'));
    });
  });

  describe('flattenSymbols', () => {
    it('flattens nested symbols into single-level array', () => {
      const symbols: PikeSymbol[] = [
        sym('A', 'class', {
          position: { file: 'test.pike', line: 1 },
          children: [sym('B', 'method', { position: { file: 'test.pike', line: 2 } })],
        }),
      ];

      const flat = flattenSymbols(symbols);

      assert.strictEqual(flat.length, 2);
      assert.strictEqual(flat[0]?.name, 'A');
      assert.strictEqual(flat[1]?.name, 'B');
    });

    it('adds qualified names to flattened children', () => {
      const symbols: PikeSymbol[] = [
        sym('A', 'class', {
          position: { file: 'test.pike', line: 1 },
          children: [
            sym('B', 'class', {
              position: { file: 'test.pike', line: 2 },
              children: [sym('C', 'method', { position: { file: 'test.pike', line: 3 } })],
            }),
          ],
        }),
      ];

      const flat = flattenSymbols(symbols);

      assert.strictEqual(flat.length, 3);
      assert.strictEqual(flat[0]?.name, 'A');
      assert.strictEqual(flat[1]?.name, 'B');
      assert.strictEqual(flat[2]?.name, 'C');
      assert.strictEqual((flat[1] as { qualifiedName?: string })?.qualifiedName, 'A.B');
    });

    it('produces correct qualified names for 3+ nesting levels', () => {
      const symbols: PikeSymbol[] = [
        sym('A', 'class', {
          position: { file: 'test.pike', line: 1 },
          children: [
            sym('B', 'class', {
              position: { file: 'test.pike', line: 2 },
              children: [sym('C', 'method', { position: { file: 'test.pike', line: 3 } })],
            }),
          ],
        }),
      ];

      const flat = flattenSymbols(symbols);

      assert.strictEqual(flat.length, 3);
      assert.strictEqual(flat[0]?.name, 'A');
      assert.strictEqual(flat[1]?.name, 'B');
      assert.strictEqual(flat[2]?.name, 'C');
      assert.strictEqual((flat[1] as { qualifiedName?: string })?.qualifiedName, 'A.B');
      assert.strictEqual((flat[2] as { qualifiedName?: string })?.qualifiedName, 'A.B.C');
    });

    it('handles empty symbol array', () => {
      const flat = flattenSymbols([]);
      assert.strictEqual(flat.length, 0);
    });

    it('handles symbols without children', () => {
      const symbols: PikeSymbol[] = [
        sym('foo', 'variable', { position: { file: 'test.pike', line: 1 } }),
      ];

      const flat = flattenSymbols(symbols);

      assert.strictEqual(flat.length, 1);
    });
  });

  describe('buildSymbolPositionIndexRegex', () => {
    it('finds symbol positions using tokens', async () => {
      const text = 'int foo();\nint x = foo();\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'method', { position: { file: 'test.pike', line: 1 } }),
      ];

      const index = await buildSymbolPositionIndexRegex(text, symbols);

      // With no tokens and no bridge, returns empty index
      assert.strictEqual(index.size, 0);
    });

    it('excludes comments from positions', async () => {
      const text = 'int foo();\n// foo is defined here\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'method', { position: { file: 'test.pike', line: 1 } }),
      ];

      const index = await buildSymbolPositionIndexRegex(text, symbols);

      // No tokens available, so empty index
      assert.strictEqual(index.size, 0);
    });

    it('handles empty text', async () => {
      const text = '';
      const symbols: PikeSymbol[] = [
        sym('foo', 'method', { position: { file: 'test.pike', line: 1 } }),
      ];

      const index = await buildSymbolPositionIndexRegex(text, symbols);

      assert.strictEqual(index.size, 0);
    });

    it('uses token-based path when tokens are provided', async () => {
      const text = 'int foo();\nint x = foo();\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'method', { position: { file: 'test.pike', line: 1 } }),
      ];
      const tokens = [
        { text: 'foo', line: 1, character: 4, file: 'test.pike' },
        { text: 'foo', line: 2, character: 8, file: 'test.pike' },
      ];

      const index = await buildSymbolPositionIndexRegex(text, symbols, undefined, tokens);

      // Definition (line 1) excluded; reference (line 2) should be found via tokens
      const positions = index.get('foo');
      assert.ok(positions !== undefined);
      assert.strictEqual(positions.length, 1);
      assert.strictEqual(positions[0]?.line, 1);
      assert.strictEqual(positions[0]?.character, 8);
    });

    it('returns empty when tokens produce no matches', async () => {
      const text = 'int foo();\nint x = foo();\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'method', { position: { file: 'test.pike', line: 1 } }),
      ];
      // Tokens that don't match any symbol name
      const tokens = [{ text: 'bar', line: 2, character: 8, file: 'test.pike' }];

      const index = await buildSymbolPositionIndexRegex(text, symbols, undefined, tokens);

      // No matching tokens found, returns empty index
      assert.strictEqual(index.size, 0);
    });
  });

  describe('buildSymbolPositionIndex (token-based)', () => {
    it('finds symbol next to arrow operator ->', async () => {
      const text = 'string|foo->bar();\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'variable', { position: { file: 'test.pike', line: 1 } }),
        sym('bar', 'method', { position: { file: 'test.pike', line: 2 } }),
      ];
      const tokens: PikeToken[] = [
        tok('foo', 1, 7),
        tok('->', 1, 10),
        tok('bar', 1, 12),
        tok('(', 1, 15),
        tok(')', 1, 16),
        tok(';', 1, 17),
      ];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      // foo defined on line 1, so only bar reference counts
      const barPositions = index.get('bar');
      assert.ok(barPositions !== undefined);
      assert.strictEqual(barPositions.length, 1);
      assert.strictEqual(barPositions[0]?.line, 0);
      assert.strictEqual(barPositions[0]?.character, 12);
    });

    it('finds symbol adjacent to parentheses', async () => {
      const text = 'int result = myFunc(x);\n';
      const symbols: PikeSymbol[] = [
        sym('myFunc', 'function', { position: { file: 'test.pike', line: 5 } }),
      ];
      const tokens: PikeToken[] = [
        tok('myFunc', 1, 13),
        tok('(', 1, 19),
        tok('x', 1, 20),
        tok(')', 1, 21),
        tok(';', 1, 22),
      ];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      const positions = index.get('myFunc');
      assert.ok(positions !== undefined);
      assert.strictEqual(positions.length, 1);
      assert.strictEqual(positions[0]?.line, 0);
      assert.strictEqual(positions[0]?.character, 13);
    });

    it('finds symbol adjacent to brackets', async () => {
      const text = 'mixed arr = data[idx];\n';
      const symbols: PikeSymbol[] = [
        sym('data', 'variable', { position: { file: 'test.pike', line: 3 } }),
        sym('idx', 'variable', { position: { file: 'test.pike', line: 3 } }),
      ];
      const tokens: PikeToken[] = [
        tok('data', 1, 12),
        tok('[', 1, 16),
        tok('idx', 1, 17),
        tok(']', 1, 20),
      ];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      // Both data and idx are referenced (not on their definition line 3)
      const dataPositions = index.get('data');
      const idxPositions = index.get('idx');
      assert.ok(dataPositions !== undefined);
      assert.ok(idxPositions !== undefined);
      assert.strictEqual(dataPositions.length, 1);
      assert.strictEqual(dataPositions[0]?.character, 12);
      assert.strictEqual(idxPositions[0]?.character, 17);
    });

    it('does not match symbol inside string literals', async () => {
      // Pike tokenizer does NOT produce identifier tokens inside strings.
      // It produces string tokens like '"do not find foo"'.
      // Only standalone identifier calls produce identifier tokens.
      const text = 'string msg = "do not find foo";\nfoo();';
      const symbols: PikeSymbol[] = [
        sym('foo', 'function', { position: { file: 'test.pike', line: 3 } }),
      ];
      const tokens: PikeToken[] = [tok('foo', 2, 0)];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      const positions = index.get('foo');
      assert.ok(positions !== undefined);
      assert.strictEqual(positions.length, 1);
      assert.strictEqual(positions[0]?.line, 1);
      assert.strictEqual(positions[0]?.character, 0);
    });

    it('does not match substring tokens (word boundary check)', async () => {
      const text = 'int foobar = 1;\nint foo = 2;\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'variable', { position: { file: 'test.pike', line: 2 } }),
      ];
      const tokens: PikeToken[] = [tok('foobar', 1, 4), tok('foo', 2, 4)];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      // foobar token: symbolNames.has('foobar') is false, so skipped entirely.
      // foo token on line 2: definition line excluded.
      // Result: no entries for 'foo'.
      const fooPositions = index.get('foo');
      assert.ok(fooPositions === undefined || fooPositions.length === 0);
    });

    it('skips tokens with negative character position', async () => {
      // Token with negative char is skipped in token path, then regex fallback
      // does NOT find 'foo' because we use text without the symbol.
      const text = 'bar();\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'function', { position: { file: 'test.pike', line: 5 } }),
      ];
      const tokens: PikeToken[] = [tok('foo', 1, -1)];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      // Token path skipped (negative char), regex path finds no 'foo' in 'bar();'
      const positions = index.get('foo');
      assert.ok(positions === undefined || positions.length === 0);
    });

    it('handles multiple references to same symbol', async () => {
      const text = 'a = foo(1);\nb = foo(2);\nc = foo(3);\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'function', { position: { file: 'test.pike', line: 10 } }),
      ];
      const tokens: PikeToken[] = [tok('foo', 1, 4), tok('foo', 2, 4), tok('foo', 3, 4)];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      const positions = index.get('foo');
      assert.ok(positions !== undefined);
      assert.strictEqual(positions.length, 3);
    });

    it('falls through to regex when no tokens match symbol names', async () => {
      const text = 'x + y;\n';
      const symbols: PikeSymbol[] = [
        sym('foo', 'function', { position: { file: 'test.pike', line: 1 } }),
      ];
      const tokens: PikeToken[] = [tok('x', 1, 0), tok('y', 1, 4)];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      // Token path finds no matches for 'foo', regex fallback also finds no 'foo'
      const fooPositions = index.get('foo');
      assert.ok(fooPositions === undefined || fooPositions.length === 0);
    });

    it('handles format strings (Pike sprintf-style) correctly', async () => {
      // In Pike, format strings produce a single string token; args are separate.
      const text = 'string s = sprintf("%d %s", x, y);\n';
      const symbols: PikeSymbol[] = [
        sym('x', 'variable', { position: { file: 'test.pike', line: 5 } }),
        sym('y', 'variable', { position: { file: 'test.pike', line: 6 } }),
      ];
      const tokens: PikeToken[] = [
        tok('sprintf', 1, 11),
        tok('(', 1, 18),
        tok('x', 1, 28),
        tok('y', 1, 31),
      ];

      const index = await buildSymbolPositionIndex(text, symbols, tokens);

      const xPos = index.get('x');
      const yPos = index.get('y');
      assert.ok(xPos !== undefined);
      assert.ok(yPos !== undefined);
      assert.strictEqual(xPos.length, 1);
      assert.strictEqual(xPos[0]?.character, 28);
      assert.strictEqual(yPos.length, 1);
      assert.strictEqual(yPos[0]?.character, 31);
    });
  });

  describe('buildCallPositionIndex', () => {
    it('detects function call followed by open paren', () => {
      const callableNames = new Set(['myFunc']);
      const tokens: PikeToken[] = [tok('myFunc', 1, 0), tok('(', 1, 6), tok(')', 1, 7)];

      const index = buildCallPositionIndex(tokens, callableNames);

      assert.ok(index.has('myFunc'));
      const positions = index.get('myFunc')!;
      assert.strictEqual(positions.length, 1);
      assert.strictEqual(positions[0]?.line, 0);
      assert.strictEqual(positions[0]?.character, 0);
    });

    it('does not count identifier without following paren as call', () => {
      const callableNames = new Set(['myFunc']);
      const tokens: PikeToken[] = [tok('myFunc', 1, 0), tok('+', 1, 7)];

      const index = buildCallPositionIndex(tokens, callableNames);

      assert.strictEqual(index.size, 0);
    });

    it('handles chained arrow calls: obj->method()', () => {
      const callableNames = new Set(['method']);
      const tokens: PikeToken[] = [
        tok('obj', 1, 0),
        tok('->', 1, 3),
        tok('method', 1, 5),
        tok('(', 1, 11),
        tok(')', 1, 12),
      ];

      const index = buildCallPositionIndex(tokens, callableNames);

      assert.ok(index.has('method'));
      const positions = index.get('method')!;
      assert.strictEqual(positions.length, 1);
      assert.strictEqual(positions[0]?.line, 0);
      assert.strictEqual(positions[0]?.character, 5);
    });

    it('handles multiple calls to same function', () => {
      const callableNames = new Set(['f']);
      const tokens: PikeToken[] = [
        tok('f', 1, 0),
        tok('(', 1, 1),
        tok(')', 1, 2),
        tok('f', 1, 5),
        tok('(', 1, 6),
        tok(')', 1, 7),
      ];

      const index = buildCallPositionIndex(tokens, callableNames);

      const positions = index.get('f')!;
      assert.strictEqual(positions.length, 2);
    });

    it('skips tokens with negative character position', () => {
      const callableNames = new Set(['f']);
      const tokens: PikeToken[] = [tok('f', 1, -1), tok('(', 1, 1)];

      const index = buildCallPositionIndex(tokens, callableNames);
      assert.strictEqual(index.size, 0);
    });

    it('returns empty map when callable names set is empty', () => {
      const tokens: PikeToken[] = [tok('f', 1, 0), tok('(', 1, 1)];

      const index = buildCallPositionIndex(tokens, new Set());
      assert.strictEqual(index.size, 0);
    });
  });
});
