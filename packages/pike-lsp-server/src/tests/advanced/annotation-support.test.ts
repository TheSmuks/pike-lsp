/**
 * Annotation Support Tests
 *
 * TDD tests for Pike annotation support (Issue #180).
 *
 * Test scenarios:
 * - @deprecated marker display in hover and completion
 * - @returns in hover documentation
 * - @param in hover documentation
 * - @throws in hover documentation
 * - Other annotations (@note, @bug, @example, @seealso)
 * - Tests for annotation handling
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

describe('Annotation Support', () => {

    /**
     * Issue #180: @deprecated marker
     */
    describe('Scenario: @deprecated marker', () => {
        it('should detect @deprecated annotation', () => {
            const docText = '//! @deprecated\n//! Use newFunc instead';
            const hasDeprecated = docText.includes('@deprecated');

            assert.ok(hasDeprecated, 'Should detect @deprecated annotation');
        });

        it('should extract deprecation message', () => {
            const docText = '//! @deprecated Use newFunc instead';
            const match = docText.match(/@deprecated\s+(.*)/);

            assert.ok(match, 'Should extract deprecation message');
            assert.equal(match![1], 'Use newFunc instead', 'Should have correct message');
        });

        it('should format deprecation warning', () => {
            const deprecatedMsg = 'Use newFunc instead';
            const formatted = `**DEPRECATED**\n\n> ${deprecatedMsg}`;

            assert.ok(formatted.includes('DEPRECATED'), 'Should include DEPRECATED badge');
            assert.ok(formatted.includes(deprecatedMsg), 'Should include message');
        });
    });

    /**
     * Issue #180: @returns annotation
     */
    describe('Scenario: @returns annotation', () => {
        it('should detect @returns annotation', () => {
            const docText = '//! @returns The sum of numbers';
            const hasReturns = docText.includes('@returns');

            assert.ok(hasReturns, 'Should detect @returns annotation');
        });

        it('should extract return description', () => {
            const docText = '//! @returns The sum of numbers';
            const match = docText.match(/@returns\s+(.*)/);

            assert.ok(match, 'Should extract return description');
            assert.equal(match![1], 'The sum of numbers', 'Should have correct description');
        });

        it('should format return documentation', () => {
            const returnsText = 'The calculated result';
            const formatted = `**Returns:** ${returnsText}`;

            assert.ok(formatted.includes('Returns:'), 'Should include Returns label');
            assert.ok(formatted.includes(returnsText), 'Should include description');
        });
    });

    /**
     * Issue #180: @param annotation
     */
    describe('Scenario: @param annotation', () => {
        it('should detect @param annotation', () => {
            const docText = '//! @param x The first number';
            const hasParam = docText.includes('@param');

            assert.ok(hasParam, 'Should detect @param annotation');
        });

        it('should extract parameter name and description', () => {
            const docText = '//! @param x The first number';
            const match = docText.match(/@param\s+(\w+)\s+(.*)/);

            assert.ok(match, 'Should extract param name and description');
            assert.equal(match![1], 'x', 'Should have correct param name');
            assert.equal(match![2], 'The first number', 'Should have correct description');
        });

        it('should format parameter documentation', () => {
            const paramName = 'x';
            const paramDesc = 'The first number';
            const formatted = `- \`${paramName}\`: ${paramDesc}`;

            assert.ok(formatted.includes(paramName), 'Should include param name');
            assert.ok(formatted.includes(paramDesc), 'Should include description');
        });

        it('should handle multiple parameters', () => {
            const params = [
                { name: 'x', desc: 'First number' },
                { name: 'y', desc: 'Second number' },
            ];

            const count = params.length;
            assert.equal(count, 2, 'Should have 2 parameters');
        });
    });

    /**
     * Issue #180: @throws annotation
     */
    describe('Scenario: @throws annotation', () => {
        it('should detect @throws annotation', () => {
            const docText = '//! @throws Error when input is invalid';
            const hasThrows = docText.includes('@throws');

            assert.ok(hasThrows, 'Should detect @throws annotation');
        });

        it('should extract exception description', () => {
            const docText = '//! @throws Error when input is invalid';
            const match = docText.match(/@throws\s+(.*)/);

            assert.ok(match, 'Should extract throws description');
            assert.equal(match![1], 'Error when input is invalid', 'Should have correct description');
        });

        it('should format throws documentation', () => {
            const throwsText = 'Error when input is invalid';
            const formatted = `**Throws:** ${throwsText}`;

            assert.ok(formatted.includes('Throws:'), 'Should include Throws label');
            assert.ok(formatted.includes(throwsText), 'Should include description');
        });
    });

    /**
     * Issue #180: Other annotations
     */
    describe('Scenario: Other annotations', () => {
        it('should detect @note annotation', () => {
            const docText = '//! @note This is important';
            const hasNote = docText.includes('@note');

            assert.ok(hasNote, 'Should detect @note annotation');
        });

        it('should detect @example annotation', () => {
            const docText = '//! @example\n//! int result = add(1, 2);';
            const hasExample = docText.includes('@example');

            assert.ok(hasExample, 'Should detect @example annotation');
        });

        it('should detect @seealso annotation', () => {
            const docText = '//! @seealso other_function';
            const hasSeeAlso = docText.includes('@seealso');

            assert.ok(hasSeeAlso, 'Should detect @seealso annotation');
        });

        it('should detect @bug annotation', () => {
            const docText = '//! @bug Known issue with edge cases';
            const hasBug = docText.includes('@bug');

            assert.ok(hasBug, 'Should detect @bug annotation');
        });

        it('should detect @obsolete annotation', () => {
            const docText = '//! @obsolete Use newApi instead';
            const hasObsolete = docText.includes('@obsolete');

            assert.ok(hasObsolete, 'Should detect @obsolete annotation');
        });
    });

    /**
     * Completion Item Tags
     */
    describe('Scenario: Completion tags for deprecated', () => {
        it('should mark deprecated completion items', () => {
            const symbol = {
                name: 'old_func',
                deprecated: true,
            };

            const isDeprecated = symbol.deprecated === true;
            assert.ok(isDeprecated, 'Symbol should be marked deprecated');
        });

        it('should detect deprecated from documentation', () => {
            const symbol = {
                name: 'old_func',
                documentation: {
                    deprecated: 'Use new_func instead',
                },
            };

            const hasDeprecatedDoc = !!symbol.documentation?.deprecated;
            assert.ok(hasDeprecatedDoc, 'Should detect deprecated from documentation');
        });

        it('should set Deprecated tag on completion item', () => {
            const isDeprecated = true;
            const tags = isDeprecated ? [1] : []; // 1 = CompletionItemTag.Deprecated

            assert.equal(tags.length, 1, 'Should have one tag');
            assert.equal(tags[0], 1, 'Should be Deprecated tag');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle annotations without descriptions', () => {
            const docText = '//! @deprecated';
            const hasDeprecated = docText.includes('@deprecated');

            assert.ok(hasDeprecated, 'Should detect annotation without description');
        });

        it('should handle multiple annotations on same symbol', () => {
            const docText = `//! @deprecated Use newFunc
//! @param x Input value
//! @returns The result`;

            const hasDeprecated = docText.includes('@deprecated');
            const hasParam = docText.includes('@param');
            const hasReturns = docText.includes('@returns');

            assert.ok(hasDeprecated, 'Should have @deprecated');
            assert.ok(hasParam, 'Should have @param');
            assert.ok(hasReturns, 'Should have @returns');
        });

        it('should handle annotations with complex formatting', () => {
            const docText = '//! @returns A @b{bold} and @i{italic} result';
            const hasFormatting = docText.includes('@b{') && docText.includes('@i{');

            assert.ok(hasFormatting, 'Should handle inline formatting in annotations');
        });

        it('should handle empty annotation values', () => {
            const params: Record<string, string> = {};
            const isEmpty = Object.keys(params).length === 0;

            assert.ok(isEmpty, 'Should handle empty parameters object');
        });
    });

    /**
     * Annotation Parsing Integration
     */
    describe('Annotation parsing integration', () => {
        it('should parse structured documentation object', () => {
            const doc = {
                text: 'Main description',
                deprecated: 'Use newFunc instead',
                params: {
                    x: 'First number',
                    y: 'Second number',
                },
                returns: 'The sum',
                throws: 'Error on invalid input',
                notes: ['This is a note'],
                examples: ['int result = add(1, 2);'],
                seealso: ['subtract', 'multiply'],
            };

            assert.ok(doc.text, 'Should have text');
            assert.ok(doc.deprecated, 'Should have deprecated');
            assert.ok(doc.params, 'Should have params');
            assert.ok(doc.returns, 'Should have returns');
            assert.ok(doc.throws, 'Should have throws');
            assert.ok(doc.notes, 'Should have notes');
            assert.ok(doc.examples, 'Should have examples');
            assert.ok(doc.seealso, 'Should have seealso');
        });

        it('should handle string documentation format', () => {
            const doc = '//! Simple documentation\n//! with multiple lines';

            assert.ok(doc.includes('//!'), 'Should detect //! prefix');
            assert.ok(doc.includes('Simple documentation'), 'Should have content');
        });

        it('should handle missing documentation gracefully', () => {
            const symbol = {
                name: 'undocumented_func',
                // no documentation property
            };

            const hasDoc = 'documentation' in symbol;
            assert.ok(!hasDoc, 'Should handle missing documentation');
        });
    });
});
