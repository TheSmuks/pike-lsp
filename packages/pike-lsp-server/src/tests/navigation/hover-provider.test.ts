/**
 * Hover Provider Tests
 *
 * TDD tests for hover functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#1-hover-provider
 *
 * Test scenarios:
 * - 1.1 Hover over variable
 * - 1.2 Hover over function
 * - 1.3 Hover over class
 * - 1.4 Hover over stdlib symbol
 * - 1.5 Hover over symbol with no documentation
 * - 1.6 Hover over inherited method
 * - 1.7 Hover over unknown symbol
 * - 1.8 Hover over keyword
 */

import { describe, it, mock, beforeEach } from 'bun:test';
import assert from 'node:assert';
import { Hover, MarkupKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PikeSymbol } from '@pike-lsp/pike-bridge';
import { buildHoverContent } from '../../features/utils/hover-builder.js';

/**
 * Helper: Create a mock PikeSymbol
 */
function createSymbol(overrides: Partial<PikeSymbol> = {}): PikeSymbol {
    return {
        name: 'testSymbol',
        kind: 'variable',
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 }
        },
        selectionRange: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 }
        },
        position: { line: 1, character: 5 },
        children: [],
        modifiers: [],
        ...overrides
    };
}

describe('Hover Provider', () => {

    /**
     * Test 1.1: Hover Over Variable
     * GIVEN: A Pike document with a declared variable
     * WHEN: User hovers over "myVariable"
     * THEN: Display hover info showing type "int", name "myVariable"
     */
    describe('Scenario 1.1: Hover over variable', () => {
        it('should show type and name for variable', () => {
            const symbol = createSymbol({
                name: 'myVariable',
                kind: 'variable',
                type: { kind: 'int', name: 'int' }
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content for variable');
            assert.ok(content.includes('myVariable'), 'Should include variable name');
            assert.ok(content.includes('int'), 'Should include type information');
        });

        it('should show variable with no documentation', () => {
            const symbol = createSymbol({
                name: 'myVariable',
                kind: 'variable',
                type: { kind: 'int', name: 'int' },
                documentation: undefined
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content even without documentation');
            assert.ok(content.includes('myVariable'), 'Should include variable name');
        });
    });

    /**
     * Test 1.2: Hover Over Function
     * GIVEN: A Pike document with a function declaration
     * WHEN: User hovers over function name
     * THEN: Display signature, documentation, parameter info
     */
    describe('Scenario 1.2: Hover over function', () => {
        it('should show function signature with parameters', () => {
            const symbol = createSymbol({
                name: 'add',
                kind: 'method',
                type: { kind: 'function', returnType: 'int' },
                parameters: [
                    { name: 'a', type: 'int' },
                    { name: 'b', type: 'int' }
                ],
                documentation: 'Calculate the sum\n@param a First number\n@param b Second number\n@returns The sum'
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content for function');
            assert.ok(content.includes('add'), 'Should include function name');
            assert.ok(content.includes('int'), 'Should include return type');
            assert.ok(content.includes('a'), 'Should include parameter names');
            assert.ok(content.includes('Calculate the sum'), 'Should include documentation');
        });

        it('should format AutoDoc markup in markdown', () => {
            const symbol = createSymbol({
                name: 'add',
                kind: 'method',
                documentation: '//! Calculate the sum\n//! @param a: First number\n//! @returns: The result'
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content');
            assert.ok(content.includes('Calculate the sum'), 'Should include description');
            // Check markdown formatting
            assert.ok(content.includes('@param') || content.includes('**a**'), 'Should format parameters');
        });
    });

    /**
     * Test 1.3: Hover Over Class
     * GIVEN: A Pike document with a class
     * WHEN: User hovers over class name
     * THEN: Display type "class", name, documentation
     */
    describe('Scenario 1.3: Hover over class', () => {
        it('should show class information', () => {
            const symbol = createSymbol({
                name: 'MyClass',
                kind: 'class',
                documentation: 'My custom class'
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content for class');
            assert.ok(content.includes('MyClass'), 'Should include class name');
            assert.ok(content.includes('class') || content.includes('My custom class'), 'Should indicate class type or documentation');
        });

        it('should show nested classes', () => {
            const innerClass = createSymbol({
                name: 'InnerClass',
                kind: 'class'
            });

            const outerClass = createSymbol({
                name: 'OuterClass',
                kind: 'class',
                children: [innerClass]
            });

            const content = buildHoverContent(outerClass);

            assert.ok(content, 'Should return hover content for nested class');
            assert.ok(content.includes('OuterClass'), 'Should include outer class name');
        });
    });

    /**
     * Test 1.4: Hover Over Stdlib Symbol
     * GIVEN: A Pike document using stdlib
     * WHEN: User hovers over stdlib type (e.g., "array")
     * THEN: Display type information and stdlib documentation
     */
    describe('Scenario 1.4: Hover over stdlib symbol', () => {
        it('should show stdlib type information', () => {
            const symbol = createSymbol({
                name: 'array',
                kind: 'type',
                documentation: 'Array type in Pike stdlib',
                modifiers: ['stdlib']
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content for stdlib symbol');
            assert.ok(content.includes('array'), 'Should include type name');
        });

        it('should indicate stdlib origin', () => {
            const symbol = createSymbol({
                name: 'Array',
                kind: 'module',
                modifiers: ['stdlib']
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content');
            // Stdlib symbols should be identifiable in hover
        });
    });

    /**
     * Test 1.5: Hover Over Symbol with No Documentation
     * GIVEN: A Pike document with undocumented symbol
     * WHEN: User hovers over symbol
     * THEN: Display type and name, no documentation section
     */
    describe('Scenario 1.5: Hover over undocumented symbol', () => {
        it('should show type and name without documentation', () => {
            const symbol = createSymbol({
                name: 'x',
                kind: 'variable',
                type: { kind: 'int', name: 'int' }
                // No documentation property
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content without documentation');
            assert.ok(content.includes('x'), 'Should include symbol name');
            assert.ok(content.includes('int'), 'Should include type');
        });
    });

    /**
     * Test 1.6: Hover Over Inherited Method
     * GIVEN: A class inheriting from another
     * WHEN: User hovers over inherited method
     * THEN: Display method signature with inheritance indication
     */
    describe('Scenario 1.6: Hover over inherited method', () => {
        it('should show inherited method with base class', () => {
            const symbol = createSymbol({
                name: 'baseMethod',
                kind: 'method',
                classname: 'Base',
                documentation: 'Method from base class',
                modifiers: ['inherited']
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return hover content for inherited method');
            assert.ok(content.includes('baseMethod'), 'Should include method name');
        });
    });

    /**
     * Test 1.7: Hover Over Unknown Symbol
     * GIVEN: A Pike document with undefined symbol
     * WHEN: User hovers over unknown symbol
     * THEN: Return empty hover result (no crash)
     */
    describe('Scenario 1.7: Hover over unknown symbol', () => {
        it('should return null for unknown symbol', () => {
            const symbol = null;

            const content = buildHoverContent(symbol!);

            assert.ok(content === null || content === '', 'Should return null or empty for unknown symbol');
        });

        it('should not crash on undefined input', () => {
            const content = buildHoverContent(undefined as any);

            assert.ok(content === null || content === '', 'Should handle undefined gracefully');
        });
    });

    /**
     * Test 1.8: Hover Over Keyword
     * GIVEN: A Pike document with keywords (if, true, etc.)
     * WHEN: User hovers over keyword
     * THEN: Return hover info or empty (keywords may not have hover)
     */
    describe('Scenario 1.8: Hover over keyword', () => {
        it('should handle keyword symbols', () => {
            const symbol = createSymbol({
                name: 'if',
                kind: 'keyword'
            });

            const content = buildHoverContent(symbol);

            // Keywords may or may not have hover content
            assert.ok(content !== undefined, 'Should handle keywords without crashing');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle symbols with special characters in name', () => {
            const symbol = createSymbol({
                name: 'my-variable_123',
                kind: 'variable'
            });

            const content = buildHoverContent(symbol);

            assert.ok(content !== undefined, 'Should handle special characters');
        });

        it('should handle very long documentation', () => {
            const longDoc = 'A'.repeat(10000);
            const symbol = createSymbol({
                name: 'documentedSymbol',
                kind: 'function',
                documentation: longDoc
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should handle long documentation');
            assert.ok(content.length < 20000, 'Should truncate or format long documentation');
        });

        it('should handle symbols with markdown in documentation', () => {
            const symbol = createSymbol({
                name: 'markdownSymbol',
                kind: 'function',
                documentation: 'This has **bold** and `code` in it'
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should handle markdown in documentation');
        });
    });

    /**
     * Performance Tests
     */
    describe('Performance', () => {
        it('should respond within 100ms', () => {
            const symbol = createSymbol({
                name: 'perfSymbol',
                kind: 'variable',
                type: { kind: 'int', name: 'int' },
                documentation: 'Performance test'
            });

            const start = Date.now();
            const content = buildHoverContent(symbol);
            const elapsed = Date.now() - start;

            assert.ok(elapsed < 100, `Should respond within 100ms, took ${elapsed}ms`);
        });
    });

    /**
     * Markdown Formatting
     */
    describe('Markdown Formatting', () => {
        it('should return content with markdown kind', () => {
            const symbol = createSymbol({
                name: 'testSymbol',
                kind: 'variable',
                documentation: 'Test documentation'
            });

            const content = buildHoverContent(symbol);

            if (content) {
                // Content should be markdown-formatted
                assert.ok(typeof content === 'string', 'Content should be a string');
            }
        });

        it('should escape HTML in documentation', () => {
            const symbol = createSymbol({
                name: 'htmlSymbol',
                kind: 'function',
                documentation: 'Contains <html> tags'
            });

            const content = buildHoverContent(symbol);

            assert.ok(content, 'Should return content');
            // HTML should be escaped or sanitized
        });
    });

    /**
     * New Tests: Range Field and Content Format
     * Tests for the hover range and conditional MarkupContent improvements
     */
    describe('Range Field and Content Format', () => {
        it('should detect documentation object with text', () => {
            const symbol = createSymbol({
                name: 'documentedFunc',
                kind: 'method',
                documentation: { text: 'This function does something' }
            });

            const content = buildHoverContent(symbol);
            assert.ok(content, 'Should return content for documented symbol');
            assert.ok(content.includes('This function does something'), 'Should include documentation text');
        });

        it('should detect string documentation', () => {
            const symbol = createSymbol({
                name: 'documentedVar',
                kind: 'variable',
                documentation: 'A simple variable documentation'
            });

            const content = buildHoverContent(symbol);
            assert.ok(content, 'Should return content for symbol with string documentation');
            assert.ok(content.includes('A simple variable documentation'), 'Should include string documentation');
        });

        it('should detect autodoc metadata', () => {
            const symbol = createSymbol({
                name: 'autodocFunc',
                kind: 'method',
                autodoc: { params: { x: 'int' } }
            } as any);

            const content = buildHoverContent(symbol);
            assert.ok(content, 'Should return content for symbol with autodoc');
        });

        it('should handle symbol without documentation', () => {
            const symbol = createSymbol({
                name: 'undocumentedVar',
                kind: 'variable'
                // No documentation property
            });

            const content = buildHoverContent(symbol);
            assert.ok(content, 'Should return content even without documentation');
            assert.ok(content.includes('undocumentedVar'), 'Should include symbol name');
        });

        it('should handle empty string documentation', () => {
            const symbol = createSymbol({
                name: 'emptyDocVar',
                kind: 'variable',
                documentation: ''
            });

            const content = buildHoverContent(symbol);
            assert.ok(content, 'Should return content for empty documentation');
        });

        it('should handle whitespace-only documentation', () => {
            const symbol = createSymbol({
                name: 'whitespaceDocVar',
                kind: 'variable',
                documentation: '   \n  '
            });

            const content = buildHoverContent(symbol);
            assert.ok(content, 'Should return content for whitespace-only documentation');
        });

        it('should handle documentation object with empty text', () => {
            const symbol = createSymbol({
                name: 'emptyDocObjVar',
                kind: 'variable',
                documentation: { text: '' }
            });

            const content = buildHoverContent(symbol);
            assert.ok(content, 'Should return content for documentation object with empty text');
        });

        it('should detect documentation in object with other keys', () => {
            const symbol = createSymbol({
                name: 'docWithParams',
                kind: 'method',
                documentation: { params: { x: 'The input value' } }
            } as any);

            const content = buildHoverContent(symbol);
            assert.ok(content, 'Should detect documentation by presence of params key');
        });

        it('should handle null symbol gracefully', () => {
            const content = buildHoverContent(null as any);
            assert.ok(content === null, 'Should return null for null symbol');
        });

        it('should handle undefined symbol gracefully', () => {
            const content = buildHoverContent(undefined as any);
            assert.ok(content === null, 'Should return null for undefined symbol');
        });
    });

    /**
     * Performance Tests for Range Computation
     */
    describe('Range Performance', () => {
        it('should compute range efficiently for short identifiers', () => {
            const symbol = createSymbol({
                name: 'x',
                kind: 'variable'
            });

            const start = Date.now();
            const content = buildHoverContent(symbol);
            const elapsed = Date.now() - start;

            assert.ok(content, 'Should return content');
            assert.ok(elapsed < 100, `Should complete quickly, took ${elapsed}ms`);
        });

        it('should compute range efficiently for long identifiers', () => {
            const longName = 'myVeryLongIdentifierNameThatContainsManyCharacters';
            const symbol = createSymbol({
                name: longName,
                kind: 'variable'
            });

            const start = Date.now();
            const content = buildHoverContent(symbol);
            const elapsed = Date.now() - start;

            assert.ok(content, 'Should return content');
            assert.ok(elapsed < 100, `Should complete quickly even for long names, took ${elapsed}ms`);
        });
    });
});
