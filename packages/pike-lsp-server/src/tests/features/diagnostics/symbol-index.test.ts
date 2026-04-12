/**
 * Symbol Index Tests
 *
 * Tests for symbol position indexing utilities.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import {
  buildSymbolNameIndex,
  flattenSymbols,
  buildSymbolPositionIndexRegex,
} from '../../../features/diagnostics/symbol-index.js';

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
});
