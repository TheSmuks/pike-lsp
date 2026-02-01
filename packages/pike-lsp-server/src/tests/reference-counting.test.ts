/**
 * Reference Counting Tests
 *
 * TDD tests for fixing reference count to exclude definitions.
 * Issue: Functions with no references show "1 reference" because the definition is counted.
 *
 * Root Cause: The buildSymbolPositionIndex function in diagnostics.ts includes ALL token
 * occurrences, including the definition itself. Code lens then displays this count.
 *
 * Fix: When building symbol positions, exclude positions that match the symbol's definition location.
 *
 * Run with: bun test src/tests/reference-counting.test.ts
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import type { PikeSymbol, PikeToken } from '@pike-lsp/pike-bridge';

// ============================================================================
// Test Setup
// ============================================================================

let bridge: PikeBridge;

before(async () => {
    bridge = new PikeBridge();
    await bridge.start();
});

after(async () => {
    if (bridge) {
        await bridge.stop();
    }
});

// ============================================================================
// Helper Functions (mimic diagnostics.ts logic)
// ============================================================================

/**
 * Count symbol occurrences from tokens (current buggy behavior).
 * This matches what buildSymbolPositionIndex currently does - it counts ALL occurrences.
 */
function countAllOccurrences(tokens: PikeToken[], symbolName: string): number {
    return tokens.filter((t: PikeToken) => t.text === symbolName).length;
}

/**
 * Count symbol occurrences excluding definition (expected behavior).
 * This is what buildSymbolPositionIndex SHOULD do.
 */
function countOccurrencesExcludingDefinition(
    tokens: PikeToken[],
    symbolName: string,
    definitionLine: number
): number {
    return tokens.filter((t: PikeToken) =>
        t.text === symbolName && t.line !== definitionLine
    ).length;
}

// ============================================================================
// Tests
// ============================================================================

describe('Reference Counting - Definition Exclusion', () => {

    /**
     * Test: Demonstrate the bug - unused function shows 1 reference
     * GIVEN: A function defined but never called
     * WHEN: Tokens are counted for the function name
     * THEN: Current code counts 1 (definition), should be 0
     */
    it('BUG: unused function shows 1 reference instead of 0', async () => {
        const code = `int unused_function() {
    return 42;
}

int main() {
    return 0;
}`;

        const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

        assert.ok(result.result, 'Should have analysis result');
        assert.ok(result.result?.parse, 'Should have parse data');

        // Get symbols from parse (has location info)
        const symbols = result.result?.parse?.symbols || [];
        const unusedFunc = symbols.find((s: PikeSymbol) => s.name === 'unused_function');

        assert.ok(unusedFunc, 'Should find unused_function symbol');
        assert.ok(unusedFunc?.name, 'Symbol should have name');

        // Get tokens
        const tokens = result.result?.tokenize?.tokens || [];
        assert.ok(tokens.length > 0, 'Should have tokens');

        // Current behavior (BUGGY): counts definition
        const currentCount = countAllOccurrences(tokens, 'unused_function');

        // Expected behavior (FIXED): excludes definition
        const definitionLine = unusedFunc.line || 1; // Parse symbols have line number
        const expectedCount = countOccurrencesExcludingDefinition(
            tokens,
            'unused_function',
            definitionLine
        );

        // This demonstrates the bug:
        // Current implementation counts the definition, so unused_function shows 1 reference
        assert.equal(currentCount, 1, 'BUG: Currently counts definition as reference');

        // This is what we want after the fix:
        assert.equal(expectedCount, 0, 'FIXED: Should have 0 references for unused function');

        console.log(`  BUG: currentCount=${currentCount} (includes definition)`);
        console.log(`  FIX: expectedCount=${expectedCount} (excludes definition at line ${definitionLine})`);
    });

    /**
     * Test: Function called once should show 1 reference
     * GIVEN: A function defined and called once
     * WHEN: Tokens are counted
     * THEN: Should show 1 (the call), not 2 (call + definition)
     */
    it('BUG: function with 1 call shows 2 references instead of 1', async () => {
        const code = `int used_function() {
    return 42;
}

int main() {
    return used_function();
}`;

        const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

        assert.ok(result.result, 'Should have analysis result');
        assert.ok(result.result?.parse, 'Should have parse data');

        const symbols = result.result?.parse?.symbols || [];
        const usedFunc = symbols.find((s: PikeSymbol) => s.name === 'used_function');

        assert.ok(usedFunc, 'Should find used_function symbol');

        const tokens = result.result?.tokenize?.tokens || [];

        const currentCount = countAllOccurrences(tokens, 'used_function');
        const definitionLine = usedFunc?.line || 1;
        const expectedCount = countOccurrencesExcludingDefinition(
            tokens,
            'used_function',
            definitionLine
        );

        // Demonstrates the bug: counts 2 (definition + 1 call)
        assert.equal(currentCount, 2, 'BUG: Currently counts definition + references');

        // After fix: should be 1 (just the call)
        assert.equal(expectedCount, 1, 'FIXED: Should count only the call');

        console.log(`  BUG: currentCount=${currentCount} (includes definition)`);
        console.log(`  FIX: expectedCount=${expectedCount} (excludes definition at line ${definitionLine})`);
    });

    /**
     * Test: Multiple references should be counted correctly
     */
    it('BUG: function with 3 calls shows 4 references instead of 3', async () => {
        const code = `int helper() {
    return 1;
}

int main() {
    int x = helper();
    int y = helper();
    int z = helper();
    return x + y + z;
}`;

        const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

        assert.ok(result.result, 'Should have analysis result');

        const symbols = result.result?.parse?.symbols || [];
        const helper = symbols.find((s: PikeSymbol) => s.name === 'helper');

        assert.ok(helper, 'Should find helper symbol');

        const tokens = result.result?.tokenize?.tokens || [];

        const currentCount = countAllOccurrences(tokens, 'helper');
        const definitionLine = helper?.line || 1;
        const expectedCount = countOccurrencesExcludingDefinition(
            tokens,
            'helper',
            definitionLine
        );

        assert.equal(currentCount, 4, 'BUG: Counts definition + 3 calls');
        assert.equal(expectedCount, 3, 'FIXED: Counts only the 3 calls');

        console.log(`  BUG: currentCount=${currentCount} (includes definition)`);
        console.log(`  FIX: expectedCount=${expectedCount} (excludes definition at line ${definitionLine})`);
    });

    /**
     * Test: Top-level variable declarations should be excluded
     */
    it('BUG: top-level variable with 1 use shows 2 occurrences instead of 1', async () => {
        const code = `int global_var = 5;

int main() {
    return global_var;
}`;

        const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

        assert.ok(result.result, 'Should have analysis result');

        // Find global_var in parse tree
        const symbols = result.result?.parse?.symbols || [];
        const globalVar = symbols.find((s: PikeSymbol) => s.name === 'global_var');

        assert.ok(globalVar, 'Should find global_var symbol');

        const tokens = result.result?.tokenize?.tokens || [];

        const currentCount = countAllOccurrences(tokens, 'global_var');
        const definitionLine = globalVar?.line || 1;
        const expectedCount = countOccurrencesExcludingDefinition(
            tokens,
            'global_var',
            definitionLine
        );

        assert.equal(currentCount, 2, 'BUG: Counts declaration + 1 use');
        assert.equal(expectedCount, 1, 'FIXED: Counts only the use');

        console.log(`  BUG: currentCount=${currentCount} (includes declaration)`);
        console.log(`  FIX: expectedCount=${expectedCount} (excludes declaration at line ${definitionLine})`);
    });

    /**
     * Test: Class method definitions should be excluded
     * NOTE: This test demonstrates that nested symbols (class methods) don't have line info
     * in the parse tree. We'll need to detect the definition line from tokens.
     */
    it('BUG: unused method shows 1 reference instead of 0', async () => {
        const code = `class MyClass {
    void my_method() {
        // implementation
    }
}

int main() {
    return 0;
}`;

        const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

        assert.ok(result.result, 'Should have analysis result');

        const tokens = result.result?.tokenize?.tokens || [];

        // Find my_method tokens
        const myMethodTokens = tokens.filter((t: PikeToken) => t.text === 'my_method');

        // The first occurrence is the definition (class method declaration)
        const currentCount = myMethodTokens.length;

        // Definition line is the first token's line
        const definitionLine = myMethodTokens[0]?.line || 1;
        const expectedCount = countOccurrencesExcludingDefinition(
            tokens,
            'my_method',
            definitionLine
        );

        assert.equal(currentCount, 1, 'BUG: Counts method definition');
        assert.equal(expectedCount, 0, 'FIXED: Method has 0 references');

        console.log(`  BUG: currentCount=${currentCount} (includes definition at line ${definitionLine})`);
        console.log(`  FIX: expectedCount=${expectedCount} (excludes definition)`);
    });
});
