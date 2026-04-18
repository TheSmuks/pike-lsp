import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { buildSymbolPositionIndex } from '../features/diagnostics/symbol-index.js';
import type { PikeSymbol, PikeToken } from '@pike-lsp/pike-bridge';

type TokenizeBridge = { tokenize: (text: string) => Promise<PikeToken[]> };

function makeSymbol(name: string, kind: string, defLine: number): PikeSymbol {
  return {
    name,
    kind,
    position: { file: 'test.pike', line: defLine },
  } as PikeSymbol;
}

describe('buildSymbolPositionIndex: tokenize-only bridge', () => {
  it('uses bridge.tokenize when pre-computed tokens are empty', async () => {
    const text = 'int foo();\nint x = foo();\n';
    const symbols = [makeSymbol('foo', 'method', 1)];
    const bridgeTokens: PikeToken[] = [
      { text: 'foo', line: 1, character: 4, file: 'test.pike' } as PikeToken,
      { text: 'foo', line: 2, character: 8, file: 'test.pike' } as PikeToken,
    ];
    const bridge: TokenizeBridge = {
      tokenize: async () => bridgeTokens,
    };

    const index = await buildSymbolPositionIndex(text, symbols, [], bridge);

    const positions = index.get('foo');
    assert.ok(positions !== undefined);
    assert.strictEqual(positions!.length, 1);
    assert.strictEqual(positions![0]!.line, 1);
    assert.strictEqual(positions![0]!.character, 8);
  });

  it('returns empty index when bridge.tokenize throws', async () => {
    const text = 'int foo();\nint x = foo();\n';
    const symbols = [makeSymbol('foo', 'method', 1)];
    const bridge: TokenizeBridge = {
      tokenize: async () => {
        throw new Error('bridge crashed');
      },
    };

    const index = await buildSymbolPositionIndex(text, symbols, [], bridge);

    assert.strictEqual(index.size, 0);
  });

  it('returns empty index when no tokens and no bridge provided', async () => {
    const text = 'int foo();\nint x = foo();\n';
    const symbols = [makeSymbol('foo', 'method', 1)];

    const index = await buildSymbolPositionIndex(text, symbols, []);

    assert.strictEqual(index.size, 0);
  });

  it('prefers pre-computed tokens over bridge.tokenize', async () => {
    const text = 'int foo();\nint x = foo();\n';
    const symbols = [makeSymbol('foo', 'method', 1)];
    const precomputedTokens: PikeToken[] = [
      { text: 'foo', line: 1, character: 4, file: 'test.pike' } as PikeToken,
      { text: 'foo', line: 2, character: 8, file: 'test.pike' } as PikeToken,
    ];
    let tokenizeCalled = false;
    const bridge: TokenizeBridge = {
      tokenize: async () => {
        tokenizeCalled = true;
        return [];
      },
    };

    const index = await buildSymbolPositionIndex(text, symbols, precomputedTokens, bridge);

    assert.strictEqual(tokenizeCalled, false);
    const positions = index.get('foo');
    assert.ok(positions !== undefined);
    assert.strictEqual(positions!.length, 1);
    assert.strictEqual(positions![0]!.line, 1);
  });

  it('does not call findOccurrences on the bridge object', async () => {
    const text = 'int foo();\nint x = foo();\n';
    const symbols = [makeSymbol('foo', 'method', 1)];
    const bridgeTokens: PikeToken[] = [
      { text: 'foo', line: 2, character: 8, file: 'test.pike' } as PikeToken,
    ];

    // Bridge with findOccurrences that would throw if called — proves it's not invoked
    const bridge = {
      findOccurrences: async () => {
        throw new Error('findOccurrences should not be called');
      },
      tokenize: async () => bridgeTokens,
    } as unknown as TokenizeBridge;

    // Should not throw — findOccurrences is never called
    const index = await buildSymbolPositionIndex(text, symbols, [], bridge);

    const positions = index.get('foo');
    assert.ok(positions !== undefined);
    assert.strictEqual(positions!.length, 1);
    assert.strictEqual(positions![0]!.character, 8);
  });
});
