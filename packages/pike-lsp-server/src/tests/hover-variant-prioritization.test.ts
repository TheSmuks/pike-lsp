import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import { buildHoverContent } from '../features/utils/hover-builder.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

describe('Hover - Variant Prioritization', () => {
  it('shows main signature with variants grouped below', () => {
    const mainSignature: PikeSymbol = {
      name: 'generate_key',
      kind: 'method',
      modifiers: [],
      type: {
        kind: 'function',
        returnType: { kind: 'program' },
        argTypes: [{ kind: 'int', min: '128', max: '65536' }, { kind: 'mixed' }],
      },
    };

    const variantSignature: PikeSymbol = {
      name: 'generate_key',
      kind: 'method',
      modifiers: ['variant'],
      type: {
        kind: 'function',
        returnType: { kind: 'program' },
        argTypes: [{ kind: 'int' }, { kind: 'function' }],
      },
    };

    const hover = buildHoverContent(
      {
        ...mainSignature,
        variants: [variantSignature],
      } as PikeSymbol,
      'Crypto.RSA'
    );

    assert.ok(hover, 'Should build hover content');
    assert.strictEqual(
      hover,
      [
        '```pike',
        'program generate_key(int(128..65536) arg0, mixed arg1)',
        '```',
        '',
        '### Variants',
        '',
        '```pike',
        'program generate_key(int arg0, function : mixed arg1)',
        '```',
        '',
        '[Online Documentation](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Crypto/RSA/generate_key.html)',
      ].join('\n')
    );
  });

  it('shows normal function signature without variants section', () => {
    const symbol: PikeSymbol = {
      name: 'my_function',
      kind: 'method',
      modifiers: [],
      type: {
        kind: 'function',
        returnType: { kind: 'int' },
        argTypes: [{ kind: 'string' }, { kind: 'int' }],
      },
    };

    const hover = buildHoverContent(symbol);

    assert.ok(hover, 'Should build hover content');
    assert.strictEqual(
      hover,
      ['```pike', 'int my_function(string arg0, int arg1)', '```'].join('\n')
    );
    assert.ok(
      !hover!.includes('### Variants'),
      'Should not add variants section when there are no variants'
    );
  });
});
