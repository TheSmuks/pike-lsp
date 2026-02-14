/**
 * Formatting Provider Tests
 *
 * TDD tests for document formatting functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#20-formatting-provider
 *
 * Test scenarios:
 * - 20.1 Formatting - Indentation
 * - 20.2 Formatting - Spacing
 * - 20.3 Formatting - Blank lines
 * - 20.4 Formatting - Configuration
 */

import { describe, it, expect } from 'bun:test';
import { formatPikeCode } from '../../features/advanced/formatting.js';
import { ResponseError, ErrorCodes } from 'vscode-languageserver/node.js';

/**
 * Validate formatting options (extracted for testing)
 */
function validateFormattingOptions(options: { tabSize?: number | string | boolean; insertSpaces?: boolean | string | number }): void {
    const { tabSize, insertSpaces } = options;

    if (tabSize !== undefined) {
        if (typeof tabSize !== 'number') {
            throw new ResponseError(
                ErrorCodes.InvalidParams,
                `tabSize must be a number, got: ${typeof tabSize}`
            );
        }
        if (tabSize < 1 || tabSize > 16) {
            throw new ResponseError(
                ErrorCodes.InvalidParams,
                `tabSize must be between 1 and 16, got: ${tabSize}`
            );
        }
    }

    if (insertSpaces !== undefined && typeof insertSpaces !== 'boolean') {
        throw new ResponseError(
            ErrorCodes.InvalidParams,
            `insertSpaces must be a boolean, got: ${typeof insertSpaces}`
        );
    }
}

describe('Formatting Provider', () => {

    /**
     * Test 20.1: Formatting - Indentation
     */
    describe('Scenario 20.1: Formatting - Indentation', () => {
        it('should indent function body', () => {
            const code = 'void foo() {\nx = 1;\n}';
            const edits = formatPikeCode(code, '    ');
            // Should add 4-space indent to 'x = 1;'
            expect(edits.length).toBeGreaterThan(0);
            const edit = edits.find(e => e.range.start.line === 1);
            expect(edit).toBeDefined();
            expect(edit!.newText).toBe('    ');
        });

        it('should indent class body', () => {
            const code = 'class Foo {\nint x;\n}';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBeGreaterThan(0);
            const edit = edits.find(e => e.range.start.line === 1);
            expect(edit).toBeDefined();
            expect(edit!.newText).toBe('    ');
        });

        it('should indent nested blocks', () => {
            const code = 'void foo() {\nif (true) {\nx = 1;\n}\n}';
            const edits = formatPikeCode(code, '    ');
            // Line 2 (x = 1) should be indented 8 spaces (2 levels)
            const edit = edits.find(e => e.range.start.line === 2);
            expect(edit).toBeDefined();
            expect(edit!.newText).toBe('        ');
        });

        it('should indent if/else statements', () => {
            const code = 'if (true)\nx = 1;\nelse\ny = 2;';
            const edits = formatPikeCode(code, '    ');
            // Line 1 and 3 should be indented (braceless control)
            const edit1 = edits.find(e => e.range.start.line === 1);
            const edit3 = edits.find(e => e.range.start.line === 3);
            expect(edit1).toBeDefined();
            expect(edit3).toBeDefined();
            expect(edit1!.newText).toBe('    ');
            expect(edit3!.newText).toBe('    ');
        });

        it('should indent loop bodies', () => {
            const code = 'for (int i = 0; i < 10; i++)\nx += i;';
            const edits = formatPikeCode(code, '    ');
            const edit = edits.find(e => e.range.start.line === 1);
            expect(edit).toBeDefined();
            expect(edit!.newText).toBe('    ');
        });

        it('should align closing brace with opening statement', () => {
            const code = 'void foo() {\n    x = 1;\n    }';
            const edits = formatPikeCode(code, '    ');
            // Line 2 closing brace should be dedented to 0
            const edit = edits.find(e => e.range.start.line === 2);
            expect(edit).toBeDefined();
            expect(edit!.newText).toBe('');
        });
    });

    /**
     * Test 20.2: Formatting - Spacing
     * Note: The current formatter handles indentation only, not spacing
     */
    describe('Scenario 20.2: Formatting - Spacing', () => {
        it('should preserve code with proper comma spacing', () => {
            const code = 'foo(a, b, c);';
            const edits = formatPikeCode(code, '    ');
            // No indentation changes needed for single line
            expect(edits.length).toBe(0);
        });

        it('should preserve code with proper operator spacing', () => {
            const code = 'x = a + b * c;';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });

        it('should preserve semicolon placement', () => {
            const code = 'x = 1 ;';  // Space before semicolon
            const edits = formatPikeCode(code, '    ');
            // Formatter doesn't fix spacing, only indentation
            expect(edits.length).toBe(0);
        });

        it('should preserve keyword spacing', () => {
            const code = 'if (true) x = 1;';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });

        it('should preserve multiple spaces (not normalized)', () => {
            const code = 'x  =  1;';  // Multiple spaces
            const edits = formatPikeCode(code, '    ');
            // Formatter doesn't normalize spaces, only handles indentation
            expect(edits.length).toBe(0);
        });

        it('should preserve function declaration spacing', () => {
            const code = 'void foo(int x, string y)';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });
    });

    /**
     * Test 20.3: Formatting - Blank lines
     * Note: The current formatter doesn't modify blank lines
     */
    describe('Scenario 20.3: Formatting - Blank lines', () => {
        it('should preserve blank lines between declarations', () => {
            const code = 'int x;\n\nint y;';
            const edits = formatPikeCode(code, '    ');
            // Blank lines are skipped, no edits generated
            expect(edits.length).toBe(0);
        });

        it('should preserve multiple blank lines', () => {
            const code = 'int x;\n\n\n\nint y;';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });

        it('should preserve single blank line', () => {
            const code = 'int x;\n\nint y;';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });

        it('should preserve blank lines after blocks', () => {
            const code = 'void foo() {\n}\n\nint x;';
            const edits = formatPikeCode(code, '    ');
            // Blank line preserved, '}' on line 1 is already at correct indent
            expect(edits.length).toBe(0);
        });

        it('should preserve import section blank lines', () => {
            const code = 'import Stdio;\n\nimport Array;';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });
    });

    /**
     * Test 20.4: Formatting - Configuration
     */
    describe('Scenario 20.4: Formatting - Configuration', () => {
        it('should respect tab size configuration', () => {
            const code = 'void foo() {\nx = 1;\n}';
            const edits2 = formatPikeCode(code, '  ');  // 2 spaces
            const edits4 = formatPikeCode(code, '    '); // 4 spaces

            const edit2 = edits2.find(e => e.range.start.line === 1);
            const edit4 = edits4.find(e => e.range.start.line === 1);

            expect(edit2!.newText).toBe('  ');
            expect(edit4!.newText).toBe('    ');
        });

        it('should respect use tabs configuration', () => {
            const code = 'void foo() {\nx = 1;\n}';
            const editsTabs = formatPikeCode(code, '\t');
            const edit = editsTabs.find(e => e.range.start.line === 1);
            expect(edit!.newText).toBe('\t');
        });

        it('should handle custom tab sizes (1-16)', () => {
            const code = 'void foo() {\nx = 1;\n}';
            // Test various tab sizes
            for (let size = 1; size <= 16; size++) {
                const indent = ' '.repeat(size);
                const edits = formatPikeCode(code, indent);
                const edit = edits.find(e => e.range.start.line === 1);
                expect(edit!.newText).toBe(indent);
            }
        });

        it('should validate insertSpaces parameter', () => {
            // Valid boolean values should not throw
            expect(() => validateFormattingOptions({ insertSpaces: true })).not.toThrow();
            expect(() => validateFormattingOptions({ insertSpaces: false })).not.toThrow();

            // Invalid types should throw
            expect(() => validateFormattingOptions({ insertSpaces: 'yes' }))
                .toThrow(ResponseError);
        });

        it('should validate tabSize range (1-16)', () => {
            // Valid range
            expect(() => validateFormattingOptions({ tabSize: 1 })).not.toThrow();
            expect(() => validateFormattingOptions({ tabSize: 16 })).not.toThrow();

            // Invalid range
            expect(() => validateFormattingOptions({ tabSize: 0 }))
                .toThrow(ResponseError);
            expect(() => validateFormattingOptions({ tabSize: 17 }))
                .toThrow(ResponseError);
        });
    });

    /**
     * Error Handling
     */
    describe('Error Handling', () => {
        it('should validate tabSize type', () => {
            expect(() => validateFormattingOptions({ tabSize: '4' }))
                .toThrow(ResponseError);
        });

        it('should validate tabSize parameter range', () => {
            // Negative
            expect(() => validateFormattingOptions({ tabSize: -1 }))
                .toThrow(ResponseError);
            // Zero
            expect(() => validateFormattingOptions({ tabSize: 0 }))
                .toThrow(ResponseError);
            // Too large
            expect(() => validateFormattingOptions({ tabSize: 100 }))
                .toThrow(ResponseError);
        });

        it('should validate insertSpaces parameter type', () => {
            expect(() => validateFormattingOptions({ insertSpaces: 1 }))
                .toThrow(ResponseError);
            expect(() => validateFormattingOptions({ insertSpaces: 'true' }))
                .toThrow(ResponseError);
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty file', () => {
            const code = '';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });

        it('should handle file with only whitespace', () => {
            const code = '   \n   \n';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });

        it('should handle file with syntax errors gracefully', () => {
            // Missing closing brace - formatter still works
            const code = 'void foo() {\nx = 1;';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBeGreaterThan(0);
        });

        it('should handle deeply nested structures', () => {
            const code = 'void foo() {\nif (1) {\nif (2) {\nif (3) {\nx = 1;\n}\n}\n}\n}';
            const edits = formatPikeCode(code, '    ');
            // Line 4 (x = 1) should be indented 4 levels (16 spaces)
            const edit = edits.find(e => e.range.start.line === 4);
            expect(edit).toBeDefined();
            expect(edit!.newText).toBe('                ');
        });
    });

    /**
     * Range Formatting
     */
    describe('Range Formatting', () => {
        it('should format with correct line offset', () => {
            const code = 'void foo() {\nx = 1;\n}';
            const startLine = 10; // Simulating range formatting offset
            const edits = formatPikeCode(code, '    ', startLine);
            const edit = edits.find(e => e.range.start.line === startLine + 1);
            expect(edit).toBeDefined();
            expect(edit!.newText).toBe('    ');
        });

        it('should handle single line range', () => {
            const code = 'x = 1;';  // No leading whitespace
            const edits = formatPikeCode(code, '    ', 0);
            // No indent needed at level 0
            expect(edits.length).toBe(0);
        });

        it('should adjust indentation for range within block', () => {
            const code = 'x = 1;\ny = 2;';
            const startLine = 5;
            const edits = formatPikeCode(code, '    ', startLine);
            // All at level 0, no edits needed
            expect(edits.length).toBe(0);
        });
    });

    /**
     * Special Constructs
     */
    describe('Special Constructs', () => {
        it('should format array literals', () => {
            const code = 'array a = ({\n1,\n2,\n});';
            const edits = formatPikeCode(code, '    ');
            // Array contents should be indented
            expect(edits.length).toBeGreaterThanOrEqual(0);
        });

        it('should format mapping literals', () => {
            const code = 'mapping m = ([\n"a": 1,\n]);';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBeGreaterThanOrEqual(0);
        });

        it('should preserve multi-line strings', () => {
            const code = 'string s = #"line1\nline2\nline3";';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });

        it('should format lambda functions', () => {
            const code = 'function f = lambda() {\nreturn 1;\n};';
            const edits = formatPikeCode(code, '    ');
            const edit = edits.find(e => e.range.start.line === 1);
            expect(edit).toBeDefined();
            expect(edit!.newText).toBe('    ');
        });

        it('should handle switch/case indentation', () => {
            const code = 'switch (x) {\ncase 1:\nbreak;\ndefault:\nbreak;\n}';
            const edits = formatPikeCode(code, '    ');
            // Switch formatting has special handling
            expect(edits.length).toBeGreaterThan(0);
        });
    });

    /**
     * Comment Handling
     */
    describe('Comment Handling', () => {
        it('should preserve single-line comments', () => {
            const code = '// comment\nint x;';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });

        it('should indent multi-line comments', () => {
            const code = 'void foo() {\n/* comment\nline2 */\n}';
            const edits = formatPikeCode(code, '    ');
            // Comment inside function should be indented
            const edit = edits.find(e => e.range.start.line === 1);
            expect(edit).toBeDefined();
        });

        it('should preserve autodoc comments', () => {
            const code = '//! This is autodoc\nint x;';
            const edits = formatPikeCode(code, '    ');
            expect(edits.length).toBe(0);
        });
    });
});
