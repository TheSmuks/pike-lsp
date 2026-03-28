import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { buildHoverContent } from '../../features/utils/hover-builder.js';
import { parseSnapshotFixture } from '../helpers/snapshot-fixture.js';

const { describe, expect, it } = require('bun:test');

function createSymbol(overrides: Record<string, unknown>): PikeSymbol {
  const base: Record<string, unknown> = {
    name: 'symbol',
    kind: 'variable',
    modifiers: [],
  };
  return { ...base, ...overrides } as unknown as PikeSymbol;
}

function normalizeSnapshotValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

describe('hover provider inline snapshots', () => {
  it('snapshots variable hover markdown', () => {
    const fixture = parseSnapshotFixture('int [|counter|] = $00;');
    const symbol = createSymbol({
      name: fixture.code.slice(fixture.ranges[0]!.start, fixture.ranges[0]!.end),
      kind: 'variable',
      type: { kind: 'int', name: 'int' },
      documentation: 'Current request count',
    });

    const hover = buildHoverContent(symbol);
    expect(normalizeSnapshotValue(hover)).toMatchInlineSnapshot(`
"\`\`\`pike
int counter
\`\`\`

---

Current request count"
`);
  });

  it('snapshots function hover markdown with autodoc tags', () => {
    const symbol = createSymbol({
      name: 'sum',
      kind: 'method',
      type: { kind: 'function', returnType: 'int' },
      parameters: [
        { name: 'left', type: 'int' },
        { name: 'right', type: 'int' },
      ],
      documentation:
        'Adds two values\n@param left left operand\n@param right right operand\n@returns sum',
    });

    const hover = buildHoverContent(symbol);
    expect(normalizeSnapshotValue(hover)).toMatchInlineSnapshot(`
"\`\`\`pike
int sum(int left, int right)
\`\`\`

---

Adds two values
@param left left operand
@param right right operand
@returns sum"
`);
  });

  it('snapshots class hover markdown', () => {
    const symbol = createSymbol({
      name: 'HttpClient',
      kind: 'class',
      documentation: 'Simple HTTP client wrapper',
    });

    const hover = buildHoverContent(symbol);
    expect(normalizeSnapshotValue(hover)).toMatchInlineSnapshot(`
"\`\`\`pike
class HttpClient
\`\`\`

---

Simple HTTP client wrapper"
`);
  });
});
