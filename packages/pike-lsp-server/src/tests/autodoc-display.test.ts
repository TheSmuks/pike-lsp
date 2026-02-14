/**
 * Autodoc Display Tests
 *
 * Tests for autodoc display with edge cases including:
 * - this_program return type
 * - protected/private/static modifiers
 * - Complex type annotations
 * - Malformed autodoc
 * - Missing documentation
 *
 * Run with: node --test dist/tests/autodoc-display.test.js
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

/**
 * Flatten symbols tree - Pike returns nested children, but tests often need to search all symbols.
 */
function flattenSymbols(symbols: unknown[]): unknown[] {
    const result: unknown[] = [];
    for (const symbol of symbols) {
        result.push(symbol);
        const sym = symbol as Record<string, unknown>;
        const children = sym['children'] as unknown[] | undefined;
        if (children && children.length > 0) {
            result.push(...flattenSymbols(children));
        }
    }
    return result;
}

describe('Autodoc Display - Happy Path', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should display autodoc for basic function with //! docs', async () => {
        // Arrange
        const code = `
//! Adds two numbers together
//!
//! @param a First number to add
//! @param b Second number to add
//! @returns The sum of a and b
int add(int a, int b) {
    return a + b;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const addFunc = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'add') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(addFunc, 'add function should be found');
        assert.ok(addFunc!['documentation'], 'add should have documentation');
        const doc = addFunc!['documentation'] as Record<string, unknown>;
        assert.ok(doc['text'], 'documentation should have text');
        assert.strictEqual((doc['text'] as string).trim(), 'Adds two numbers together', 'text should match');
        assert.ok(doc['params'], 'documentation should have params');
        assert.ok((doc['params'] as Record<string, unknown>)['a'], 'param a should have description');
        assert.ok((doc['params'] as Record<string, unknown>)['b'], 'param b should have description');
        assert.ok(doc['returns'], 'documentation should have returns');
    });

    it('should display autodoc for class methods', async () => {
        // Arrange
        const code = `
//! Utility class for string operations
class StringHelper {
    //! Trims whitespace from both ends
    //!
    //! @param s The string to trim
    //! @returns The trimmed string
    string trim(string s) {
        return String.trim_all_whites(s);
    }
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const trimFunc = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'trim') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(trimFunc, 'trim function should be found');
        assert.ok(trimFunc!['documentation'], 'trim should have documentation');
        const doc = trimFunc!['documentation'] as Record<string, unknown>;
        assert.ok(doc['text'], 'documentation should have text');
    });
});

describe('Autodoc Display - Edge Cases', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should display autodoc for this_program return type', async () => {
        // Arrange
        const code = `
//! Creates a new instance
//!
//! @returns A new instance of this class
this_program create() {
    return this;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const createFunc = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'create') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(createFunc, 'create function should be found');
        assert.ok(createFunc!['documentation'], 'create should have documentation');
        const doc = createFunc!['documentation'] as Record<string, unknown>;
        assert.ok(doc['text'], 'documentation should have text');
    });

    it('should display autodoc for protected methods', async () => {
        // Arrange
        const code = `
//! Protected internal method
//!
//! @param data Internal data
protected void process_internal(mixed data) {
    // Internal processing
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'process_internal') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'process_internal function should be found');
        assert.ok(func!['documentation'], 'process_internal should have documentation');
        const doc = func!['documentation'] as Record<string, unknown>;
        assert.ok(doc['text'], 'documentation should have text');
    });

    it('should display autodoc for private methods', async () => {
        // Arrange
        const code = `
//! Private helper method
//!
//! @param value Value to validate
private bool is_valid(int value) {
    return value > 0;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'is_valid') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'is_valid function should be found');
        assert.ok(func!['documentation'], 'is_valid should have documentation');
    });

    it('should display autodoc for static methods', async () => {
        // Arrange
        const code = `
//! Static utility method
//!
//! @param input Input string
//! @returns Uppercase version
static string to_upper(string input) {
    return upper_case(input);
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'to_upper') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'to_upper function should be found');
        assert.ok(func!['documentation'], 'to_upper should have documentation');
    });

    it('should display autodoc for complex type annotations', async () => {
        // Arrange
        const code = `
//! Processes data with complex types
//!
//! @param items Array of mappings
//! @param mode Processing mode
//! @returns Processed data
array(mapping(string:int)) process_data(array(mapping(string:int)) items, string mode) {
    return items;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'process_data') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'process_data function should be found');
        assert.ok(func!['documentation'], 'process_data should have documentation');
        const doc = func!['documentation'] as Record<string, unknown>;
        assert.ok(doc['params'], 'documentation should have params');
    });

    it('should display autodoc for union types', async () => {
        // Arrange
        const code = `
//! Returns either string or int
//!
//! @param type Which type to return
//! @returns String or int value
string|int get_value(string type) {
    if (type == "string") return "hello";
    return 42;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'get_value') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'get_value function should be found');
        assert.ok(func!['documentation'], 'get_value should have documentation');
    });
});

describe('Autodoc Display - Error Cases', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should handle malformed autodoc gracefully', async () => {
        // Arrange
        const code = `
//! @param (no param name)
//! @returns (no description)
void broken_func() {
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'broken_func') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'broken_func should be found');
        // Parse succeeded without crashing - malformed autodoc is handled gracefully
        // The function exists, meaning the parser didn't crash on malformed @param
        assert.ok(result.symbols !== undefined, 'Parse returned valid symbols despite malformed autodoc');
    });

    it('should handle missing documentation', async () => {
        // Arrange
        const code = `
void no_doc_func() {
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'no_doc_func') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'no_doc_func should be found');
        assert.ok(!func!['documentation'] || Object.keys(func!['documentation'] as Record<string, unknown>).length === 0,
            'function without documentation should have empty or no documentation field');
    });

    it('should handle empty autodoc comment', async () => {
        // Arrange
        const code = `//
//!
void empty_doc_func() {
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'empty_doc_func') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'empty_doc_func should be found');
        // Empty autodoc comment (just //! with nothing) is handled gracefully
        // The function exists and parse succeeded
        assert.ok(result.symbols !== undefined, 'Parse returned valid symbols despite empty autodoc');
    });
});

describe('Autodoc Display - Regression Tests', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should find function with this_program modifier not in skip set', async () => {
        // This is a regression test for the bug where this_program was not in the skip set
        // causing extract_symbol_name to fail
        // Arrange
        const code = `
//! Returns this
this_program get_this() {
    return this;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'get_this') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'get_this function should be found');
        assert.strictEqual(func!['name'], 'get_this', 'function name should be correct (not include this_program)');
    });

    it('should find function with multiple modifiers including this_program', async () => {
        // Arrange
        const code = `
//! Static method returning this_program
static this_program create_instance() {
    return this;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);
        const func = allSymbols.find((s: unknown) => (s as Record<string, unknown>)['name'] === 'create_instance') as Record<string, unknown> | undefined;

        // Assert
        assert.ok(func, 'create_instance function should be found');
        assert.strictEqual(func!['name'], 'create_instance', 'function name should be correct');
    });
});
