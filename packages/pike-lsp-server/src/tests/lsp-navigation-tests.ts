/**
 * Behavioral tests for LSP navigation features
 * Tests definition, usages, and Ctrl+Click functionality
 */

import { test, describe } from 'bun:test';
import * as assert from 'node:assert';
import { PikeBridge } from '@pike-lsp/pike-bridge';

interface PikeSymbol {
    name: string;
    kind: string;
    position?: { line: number; file?: string };
    classname?: string;
}

describe('Definition and Usage Navigation', async () => {
    const bridge = new PikeBridge({});

    test('setup: start bridge', async () => {
        await bridge.start();
    });

    test('extracts class member variables', async () => {
        const code = `
class State {
  protected int x;
  string name;
  void test() {}
}
`;
        const result = await bridge.parse(code, 'test.pike');

        // Verify member variables are extracted
        const symbols = result.symbols as PikeSymbol[];
        const variableX = symbols.find(s => s.name === 'x' && s.kind === 'variable');
        const variableName = symbols.find(s => s.name === 'name' && s.kind === 'variable');
        const methodTest = symbols.find(s => s.name === 'test' && s.kind === 'method');

        assert.ok(variableX, 'Variable x should be extracted');
        assert.ok(variableName, 'Variable name should be extracted');
        assert.ok(methodTest, 'Method test should be extracted');

        // Verify positions
        assert.ok(variableX.position && variableX.position.line > 0, 'Variable x should have valid line');
        assert.ok(variableName.position && variableName.position.line > 0, 'Variable name should have valid line');

        console.log('✓ Class member variables extracted correctly');
    });

    test('extracts inherit statements', async () => {
        const code = `
inherit Stdio.File;
inherit OtherClass;

class Child {
  inherit ParentClass;
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const symbols = result.symbols as PikeSymbol[];
        const inherits = symbols.filter(s => s.kind === 'inherit');
        assert.ok(inherits.length >= 2, 'Should have at least 2 inherit symbols');

        console.log(`✓ Extracted ${inherits.length} inherit statements`);
    });

    test('extracts nested class members', async () => {
        const code = `
class Outer {
  int outerVar;
  
  class Inner {
    string innerVar;
  }
}
`;
        const result = await bridge.parse(code, 'test.pike');
        const symbols = result.symbols as PikeSymbol[];

        const outerVar = symbols.find(s => s.name === 'outerVar' && s.kind === 'variable');
        assert.ok(outerVar, 'Should extract outerVar');

        console.log(`✓ Extracted ${symbols.length} total symbols from nested structure`);
    });

    test('symbol positions allow definition navigation', async () => {
        const code = `
int globalVar = 5;

class HasVar {
  string memberVar;
}
`;
        const result = await bridge.parse(code, 'test.pike');
        const symbols = result.symbols as PikeSymbol[];

        // Check that symbols have valid positions for navigation
        for (const symbol of symbols) {
            if (symbol.position) {
                assert.ok(symbol.position.line >= 0, `${symbol.name} should have valid line`);
            }
        }

        // Check specific symbols
        const globalVar = symbols.find(s => s.name === 'globalVar' && s.kind === 'variable');
        const memberVar = symbols.find(s => s.name === 'memberVar' && s.kind === 'variable');

        assert.ok(globalVar, 'globalVar should be extracted');
        assert.ok(memberVar, 'memberVar should be extracted');

        console.log('✓ Symbol positions valid for definition navigation');
    });

    test('teardown: stop bridge', async () => {
        await bridge.stop();
    });
});
