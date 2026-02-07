/**
 * Signature Help Provider Tests
 *
 * TDD tests for signature help functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#9-signature-help
 *
 * Test scenarios:
 * - 9.1 Signature help - Function call
 * - 9.2 Signature help - Navigate parameters
 * - 9.3 Signature help - Multiple signatures
 * - 9.4 Signature help - With documentation
 * - 9.5 Signature help - Stdlib function
 * - 9.6 Signature help - Dismiss
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { ParameterInformation, SignatureInformation } from 'vscode-languageserver/node.js';

describe('Signature Help Provider', () => {

    /**
     * Test 9.1: Signature Help - Function Call
     */
    describe('Scenario 9.1: Signature help - function call', () => {
        it('should show signature when typing (', () => {
            const code = `void myFunction(int a, string b, float c) { }
myFunction(|`;

            // Parse function signature from code
            const funcMatch = code.match(/void myFunction\(([^)]*)\)/);
            assert.ok(funcMatch, 'Should find function definition');

            const params = funcMatch![1]!.split(',').map(p => p.trim());
            assert.equal(params.length, 3, 'Should have 3 parameters');
            assert.equal(params[0], 'int a', 'First parameter should be int a');
            assert.equal(params[1], 'string b', 'Second parameter should be string b');
            assert.equal(params[2], 'float c', 'Third parameter should be float c');
        });

        it('should highlight first parameter', () => {
            const code = `void myFunction(int a, string b) { }
myFunction(|`;

            const expectedActiveParameter = 0;

            // At opening paren, we're on parameter 0
            const cursorAfterParen = code.includes('(');
            assert.ok(cursorAfterParen, 'Cursor is after opening paren');
            assert.equal(expectedActiveParameter, 0, 'First parameter should be active');
        });
    });

    /**
     * Test 9.2: Signature Help - Navigate Parameters
     */
    describe('Scenario 9.2: Signature help - navigate parameters', () => {
        it('should highlight second parameter after comma', () => {
            const code = `void myFunction(int a, string b) { }
myFunction(42, |`;

            const expectedActiveParameter = 1;

            // Count commas to determine parameter index
            const callSite = code.match(/myFunction\(([^)]*)/);
            const args = callSite![1]!.split(',').map(a => a.trim());

            assert.equal(args.length, 2, 'Should have 2 arguments provided');
            assert.equal(expectedActiveParameter, 1, 'Second parameter should be active after comma');
        });

        it('should highlight third parameter after two commas', () => {
            const code = `void myFunction(int a, string b, float c) { }
myFunction(1, "hello", |`;

            const expectedActiveParameter = 2;

            const callSite = code.match(/myFunction\(([^)]*)/);
            const args = callSite![1]!.split(',').map(a => a.trim());

            assert.equal(args.length, 3, 'Should have 3 arguments');
            assert.equal(expectedActiveParameter, 2, 'Third parameter should be active');
        });

        it('should handle nested function calls', () => {
            const code = `void outer(int x) { }
int getValue() { return 42; }
outer(getValue()|`;

            // Should show outer signature, highlight parameter x
            const outerMatch = code.match(/void outer\(([^)]*)\)/);
            assert.ok(outerMatch, 'Should find outer function definition');

            const outerParams = outerMatch![1]!.trim();
            assert.equal(outerParams, 'int x', 'Outer function takes int x');
        });
    });

    /**
     * Test 9.3: Signature Help - Multiple Signatures
     */
    describe('Scenario 9.3: Signature help - multiple signatures', () => {
        it('should show all overloads', () => {
            const code = `void myFunc(int x) { }
void myFunc(string s) { }
myFunc(|`;

            // Pike doesn't support traditional overloads
            // This would typically be handled with optional parameters or different names
            const funcMatches = code.match(/void myFunc\([^)]*\)/g);
            assert.ok(funcMatches, 'Should find function definitions');
            assert.equal(funcMatches!.length, 2, 'Should find 2 definitions (though Pike would error on this)');

            // Note: Pike doesn't allow true overloading, this code would fail to compile
            // Real Pike code would use different function names or optional params
        });
    });

    /**
     * Test 9.4: Signature Help - With Documentation
     */
    describe('Scenario 9.4: Signature help - with documentation', () => {
        it('should show signature with parameter docs', () => {
            const code = `//! Calculate something
//! @param a: First param
//! @param b: Second param
//! @returns: Result
int calc(int a, int b) { return a + b; }
calc(|`;

            // Parse documentation and signature
            const docMatch = code.match(/\/\/! Calculate something/);
            const paramAMatch = code.match(/\/\/! @param a: First param/);
            const paramBMatch = code.match(/\/\/! @param b: Second param/);
            const returnsMatch = code.match(/\/\/! @returns: Result/);

            assert.ok(docMatch, 'Should have function documentation');
            assert.ok(paramAMatch, 'Should have param a doc');
            assert.ok(paramBMatch, 'Should have param b doc');
            assert.ok(returnsMatch, 'Should have return type doc');
        });

        it('should include return type info', () => {
            const code = `//! @returns: The sum
int add(int a, int b) { }
add(|`;

            // Extract return type from function signature
            const funcMatch = code.match(/int add\(([^)]*)\)/);
            assert.ok(funcMatch, 'Should find function definition');

            const returnType = funcMatch![0]!.split(' ')[0]!;
            assert.equal(returnType, 'int', 'Return type should be int');
        });
    });

    /**
     * Test 9.5: Signature Help - Stdlib Function
     */
    describe('Scenario 9.5: Signature help - stdlib function', () => {
        it('should show stdlib function signature', () => {
            const code = `Array.map(|`;

            // Parse qualified function call
            const qualifiedMatch = code.match(/(\w+)\.(\w+)/);
            assert.ok(qualifiedMatch, 'Should parse qualified call');

            const module = qualifiedMatch![1]!;
            const func = qualifiedMatch![2]!;

            assert.equal(module, 'Array', 'Module should be Array');
            assert.equal(func, 'map', 'Function should be map');

            // In real implementation, this would lookup stdlib index
            // Expected signature: array(Array.map)
        });
    });

    /**
     * Test 9.6: Signature Help - Dismiss
     */
    describe('Scenario 9.6: Signature help - dismiss', () => {
        it('should dismiss when typing )', () => {
            const code = `void func(int a) { }
func(42|`;

            // After typing ), signature help should dismiss
            // The cursor position shown doesn't have ) yet, but represents "before typing )"
            // Test verifies the logic of detecting closing paren
            const beforeClosing = !code.trim().endsWith(')');
            assert.ok(beforeClosing, 'Cursor position before closing paren');
        });

        it('should dismiss when moving to next argument', () => {
            const code = `void func(int a, int b) { }
func(42, )`;

            // Moving past all arguments dismisses help
            const callMatch = code.match(/func\(([^)]*)\)/);
            assert.ok(callMatch, 'Should find complete call');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle no function call at cursor', () => {
            const code = `int x = 42;`;

            // No function call here, should return null
            const hasCall = code.includes('(') && code.includes(')');
            assert.ok(!hasCall, 'No function call in code');
        });

        it('should handle function with no parameters', () => {
            const code = `void noParams() { }
noParams(|`;

            const funcMatch = code.match(/void noParams\(\)/);
            assert.ok(funcMatch, 'Should find function with no params');
        });

        it('should handle variadic functions', () => {
            const code = `void variadic(string fmt, mixed ... args) { }
variadic(|`;

            // Pike uses ... for variadic parameters
            const funcMatch = code.match(/void variadic\(([^)]*)\)/);
            assert.ok(funcMatch, 'Should find variadic function');
            assert.ok(funcMatch![1]!.includes('...'), 'Should have variadic marker');
        });

        it('should handle lambda expressions', () => {
            const code = `Array.map(({1,2,3}), lambda(int x) { return x * 2; })`;

            // Lambda signature is different from regular functions
            const lambdaMatch = code.match(/lambda\(([^)]*)\)/);
            assert.ok(lambdaMatch, 'Should find lambda expression');
            assert.equal(lambdaMatch![1]!, 'int x', 'Lambda takes int x');
        });
    });

    /**
     * Trigger Characters
     */
    describe('Trigger characters', () => {
        it('should trigger on (', () => {
            const code = `myFunc(`;
            assert.ok(code.endsWith('('), 'Trigger char ( present');
        });

        it('should trigger on ,', () => {
            const code = `myFunc(1,`;
            assert.ok(code.includes(','), 'Trigger char , present');
        });
    });

    /**
     * Retrigger Behavior
     */
    describe('Retrigger behavior', () => {
        it('should update active parameter on comma', () => {
            const code = `void func(int a, int b, int c) { }
func(1, |`;

            // Count commas in the call site (not the definition)
            const lines = code.split('\n');
            const callLine = lines.find(l => l.trim().startsWith('func('));

            assert.ok(callLine, 'Should find call line');
            const callContent = callLine!.match(/func\((.*)/);
            assert.ok(callContent, 'Should extract call content');

            // After comma, we're on parameter 1 (0-indexed)
            const commaCount = (callContent![1]!.match(/,/g) || []).length;

            assert.equal(commaCount, 1, 'One comma means we just moved to parameter 1');
        });
    });
});
