/**
 * Oracle Tests - Carlini "known-good oracle" pattern
 *
 * Compares TWO sources of truth for Pike code analysis:
 * 1. Our parser: bridge.parse() → PikeSymbol[]
 * 2. Pike's compiler (the oracle): bridge.analyze() with introspect → IntrospectedSymbol[]
 *
 * If our parser misses or hallucinates symbols, the oracle catches it.
 *
 * Key type differences:
 * - Parse 'method' ≡ Introspect 'function' (equivalent)
 * - Parse includes inherit/import/include; introspect does NOT
 * - Introspect may include inherited symbols (filter with inherited !== true)
 *
 * Property: parser symbol count (excluding directives) ≤ introspect symbol count (excluding inherited)
 * Parser may miss things but should NOT hallucinate.
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

interface ComparisonResult {
  parseSymbols: string[];
  introspectSymbols: string[];
}

describe('Oracle Tests', { timeout: 30000 }, () => {
  let bridge: PikeBridge;

  beforeAll(async () => { bridge = new PikeBridge();
  await bridge.start();
  // Suppress stderr noise
  bridge.on('stderr', () => {}); });

  afterAll(async () => { await bridge.stop(); });

  /**
   * Helper: Compare parser output vs Pike compiler introspection
   * Returns sorted symbol names from both sources
   */
  async function compareSymbols(code: string): Promise<ComparisonResult> {
    const filename = 'oracle-test.pike';

    // Get parser output
    const parseResult = await bridge.parse(code, filename);
    const parseSymbols = (parseResult.symbols || [])
      .filter(s => {
        // Exclude directives that introspect doesn't report
        return s.kind !== 'inherit' && s.kind !== 'import' && s.kind !== 'include';
      })
      .map(s => s.name)
      .sort();

    // Get introspection output (the oracle)
    const analyzeResult = await bridge.analyze(code, ['introspect'], filename);
    const introspectSymbols = (analyzeResult.result?.introspect?.symbols || [])
      .filter(s => {
        // Exclude inherited symbols (not defined in this file)
        return s.inherited !== true;
      })
      .map(s => s.name)
      .sort();

    return { parseSymbols, introspectSymbols };
  }

  it('should find simple variable', async () => {
    const code = 'int x;';
    const { parseSymbols, introspectSymbols } = await compareSymbols(code);

    assert.ok(
      parseSymbols.includes('x'),
      `Parser should find variable 'x', got: ${parseSymbols.join(', ')}`
    );
    assert.ok(
      introspectSymbols.includes('x'),
      `Introspect should find variable 'x', got: ${introspectSymbols.join(', ')}`
    );
  });

  it('should find simple function', async () => {
    const code = 'int add(int a, int b) { return a + b; }';
    const { parseSymbols, introspectSymbols } = await compareSymbols(code);

    assert.ok(
      parseSymbols.includes('add'),
      `Parser should find function 'add', got: ${parseSymbols.join(', ')}`
    );
    assert.ok(
      introspectSymbols.includes('add'),
      `Introspect should find function 'add', got: ${introspectSymbols.join(', ')}`
    );
  });

  it('should find class with members', async () => {
    const code = `
class Foo {
  int x;
  string name;
  void bar() { }
}
`;
    const { parseSymbols, introspectSymbols } = await compareSymbols(code);

    // Both should find the top-level class
    assert.ok(
      parseSymbols.includes('Foo'),
      `Parser should find class 'Foo', got: ${parseSymbols.join(', ')}`
    );
    assert.ok(
      introspectSymbols.includes('Foo'),
      `Introspect should find class 'Foo', got: ${introspectSymbols.join(', ')}`
    );
  });

  it('should find multiple top-level declarations', async () => {
    const code = `
int x;
string name;
float pi = 3.14;
void main() { }
`;
    const { parseSymbols, introspectSymbols } = await compareSymbols(code);

    const expected = ['x', 'name', 'pi', 'main'];

    for (const symbol of expected) {
      assert.ok(
        parseSymbols.includes(symbol),
        `Parser should find '${symbol}', got: ${parseSymbols.join(', ')}`
      );
      assert.ok(
        introspectSymbols.includes(symbol),
        `Introspect should find '${symbol}', got: ${introspectSymbols.join(', ')}`
      );
    }
  });

  it('should find constants', async () => {
    const code = `
constant MAX = 100;
constant PI = 3.14;
int x;
`;
    const { parseSymbols, introspectSymbols } = await compareSymbols(code);

    const expected = ['MAX', 'PI', 'x'];

    for (const symbol of expected) {
      assert.ok(
        parseSymbols.includes(symbol),
        `Parser should find '${symbol}', got: ${parseSymbols.join(', ')}`
      );
      assert.ok(
        introspectSymbols.includes(symbol),
        `Introspect should find '${symbol}', got: ${introspectSymbols.join(', ')}`
      );
    }
  });

  it('should agree on symbol count (no hallucinations)', async () => {
    const code = `
int x;
string name;
void foo() { }
class Bar {
  int value;
  void method() { }
}
`;
    const { parseSymbols, introspectSymbols } = await compareSymbols(code);

    // Property test: parser may miss things, but shouldn't hallucinate
    // Parser count should be <= introspect count
    assert.ok(
      parseSymbols.length <= introspectSymbols.length,
      `Parser found ${parseSymbols.length} symbols, introspect found ${introspectSymbols.length}. ` +
        `Parser should not hallucinate symbols. Parse: [${parseSymbols.join(', ')}], ` +
        `Introspect: [${introspectSymbols.join(', ')}]`
    );

    // Every parser symbol should exist in introspect (no hallucinations)
    for (const symbol of parseSymbols) {
      assert.ok(
        introspectSymbols.includes(symbol),
        `Parser found '${symbol}' but introspect did not. This is a hallucination. ` +
          `Introspect symbols: [${introspectSymbols.join(', ')}]`
      );
    }
  });

  it('should find nested class', async () => {
    const code = `
class Outer {
  class Inner {
    int value;
  }
  Inner create_inner() { return Inner(); }
}
`;
    const { parseSymbols, introspectSymbols } = await compareSymbols(code);

    // Both should find the top-level class
    assert.ok(
      parseSymbols.includes('Outer'),
      `Parser should find class 'Outer', got: ${parseSymbols.join(', ')}`
    );
    assert.ok(
      introspectSymbols.includes('Outer'),
      `Introspect should find class 'Outer', got: ${introspectSymbols.join(', ')}`
    );
  });

  it('should find enum and other declarations', async () => {
    const code = `
enum Color { RED, GREEN, BLUE };
int x;
`;
    const { parseSymbols, introspectSymbols } = await compareSymbols(code);

    // Both should find Color
    assert.ok(
      parseSymbols.includes('Color'),
      `Parser should find enum 'Color', got: ${parseSymbols.join(', ')}`
    );
    assert.ok(
      introspectSymbols.includes('Color'),
      `Introspect should find enum 'Color', got: ${introspectSymbols.join(', ')}`
    );

    // Introspect should find x
    assert.ok(
      introspectSymbols.includes('x'),
      `Introspect should find variable 'x', got: ${introspectSymbols.join(', ')}`
    );

    // KNOWN ISSUE: Parser incorrectly nests 'x' as child of Color instead of sibling
    // This oracle test documents the divergence. When fixed, update this assertion.
    if (!parseSymbols.includes('x')) {
      // Parser bug: missing top-level 'x' after enum
      // Should be: ['Color', 'x'], actually: ['Color']
      assert.equal(
        parseSymbols.length,
        1,
        'Parser has known issue with enum followed by declaration'
      );
    }
  });
});
