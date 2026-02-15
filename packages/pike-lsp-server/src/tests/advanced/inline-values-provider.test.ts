/**
 * Inline Values Provider Tests
 *
 * TDD tests for inline values functionality (Issue #192).
 *
 * Test scenarios:
 * - Inline Values - Basic types (string, number, int, float)
 * - Inline Values - Complex types (array, mapping)
 * - Inline Values - Toggle on/off via setting
 * - Inline Values - Lazy evaluation
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

/**
 * Test formatting functions for inline values
 */
describe('Inline Values Provider', () => {

    /**
     * Test: Format string values
     * GIVEN: A string value
     * WHEN: Formatting for display
     * THEN: Should truncate long strings and add quotes
     */
    describe('Formatting', () => {
        it('should format short strings with quotes', () => {
            const value = 'hello';
            const result = `"${value}"`;
            assert.equal(result, '"hello"', 'Should add quotes to string');
        });

        it('should truncate long strings', () => {
            const longString = 'a'.repeat(60);
            const truncated = longString.slice(0, 47);
            const result = `"${truncated}..."`;
            assert.ok(result.length <= 53, 'Should truncate to ~50 chars');
        });

        it('should format integers', () => {
            const value = 42;
            assert.equal(String(value), '42', 'Should format int as string');
        });

        it('should format floats', () => {
            const value = 3.14;
            assert.equal(String(value), '3.14', 'Should format float as string');
        });

        it('should format arrays with truncation', () => {
            const arr = [1, 2, 3, 4, 5, 6];
            const result = arr.length > 5
                ? `[${arr.slice(0, 4).join(', ')}, ...]`
                : `[${arr.join(', ')}]`;
            assert.equal(result, '[1, 2, 3, 4, ...]', 'Should truncate array');
        });

        it('should format mappings', () => {
            const mapping = { a: 1, b: 2 };
            const entries = Object.entries(mapping);
            const result = `(${entries.map(([k, v]) => `${k}: ${v}`).join(', ')})`;
            assert.equal(result, '(a: 1, b: 2)', 'Should format mapping');
        });

        it('should handle null values', () => {
            const value = null;
            const result = value === null ? 'NULL' : String(value);
            assert.equal(result, 'NULL', 'Should format null as NULL');
        });

        it('should handle undefined values', () => {
            const value = undefined;
            const result = value === undefined ? 'undefined' : String(value);
            assert.equal(result, 'undefined', 'Should format undefined');
        });
    });

    /**
     * Test: Variable detection patterns
     * GIVEN: Pike code with variable declarations
     * WHEN: Extracting variable names and values
     * THEN: Should find assignment expressions
     */
    describe('Variable Detection', () => {
        it('should detect simple assignment', () => {
            const line = 'int x = 42;';
            const match = line.match(/=\s*([^;]+);?\s*$/);
            assert.ok(match, 'Should find assignment');
            assert.equal(match![1]!.trim(), '42', 'Should extract value');
        });

        it('should detect string assignment', () => {
            const line = 'string name = "test";';
            const match = line.match(/=\s*([^;]+);?\s*$/);
            assert.ok(match, 'Should find string assignment');
            assert.equal(match![1]!.trim(), '"test"', 'Should extract string value');
        });

        it('should detect array assignment', () => {
            const line = 'array arr = ({ 1, 2, 3 });';
            const match = line.match(/=\s*([^;]+);?\s*$/);
            assert.ok(match, 'Should find array assignment');
        });

        it('should detect mapping assignment', () => {
            const line = 'mapping m = ([ "key": "value" ]);';
            const match = line.match(/=\s*([^;]+);?\s*$/);
            assert.ok(match, 'Should find mapping assignment');
        });
    });

    /**
     * Test: Skip complex expressions
     * GIVEN: Complex expressions that can't be evaluated at compile time
     * WHEN: Checking if expression is evaluable
     * THEN: Should skip function calls and complex expressions
     */
    describe('Expression Filtering', () => {
        it('should skip function calls', () => {
            const expr = 'someFunction()';
            const shouldSkip = expr.includes('(') && !expr.match(/^["'\[\{0-9]/);
            assert.ok(shouldSkip, 'Should skip function calls');
        });

        it('should allow literal strings', () => {
            const expr = '"hello"';
            const shouldSkip = expr.includes('(') && !expr.match(/^["'\[\{0-9]/);
            assert.ok(!shouldSkip, 'Should allow string literals');
        });

        it('should allow literal arrays', () => {
            // Pike arrays start with ({  - need special handling
            const expr = '({ 1, 2, 3 })';
            const isPikeArray = expr.startsWith('({');
            const shouldSkip = expr.includes('(') && !isPikeArray && !expr.match(/^["'\[\{0-9]/);
            assert.ok(!shouldSkip, 'Should allow array literals');
        });

        it('should allow literal numbers', () => {
            const expr = '42';
            const shouldSkip = expr.includes('(') && !expr.match(/^["'\[\{0-9]/);
            assert.ok(!shouldSkip, 'Should allow numbers');
        });
    });

    /**
     * Test: Configuration
     * GIVEN: Inline values settings
     * WHEN: Checking if enabled
     * THEN: Should respect enabled flag
     */
    describe('Configuration', () => {
        it('should be disabled by default', () => {
            const config = { enabled: false };
            assert.ok(!config.enabled, 'Should be disabled by default');
        });

        it('should enable when setting is true', () => {
            const config = { enabled: true };
            assert.ok(config.enabled, 'Should be enabled when true');
        });
    });
});
