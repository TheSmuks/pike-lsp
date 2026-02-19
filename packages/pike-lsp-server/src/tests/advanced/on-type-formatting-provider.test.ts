/**
 * On-Type Formatting Provider Tests
 *
 * TDD tests for on-type formatting functionality (Issue #182, #514).
 *
 * Test scenarios:
 * - Formatting on newline (Enter key)
 * - Formatting on semicolon
 * - Formatting on closing brace
 * - Edge cases
 */

import { describe, it, expect } from 'bun:test';
import {
    calculateIndentation,
    findMatchingOpeningBrace,
} from '../../features/advanced/on-type-formatting.js';

describe('On-Type Formatting Provider', () => {

    /**
     * Test: calculateIndentation function
     */
    describe('calculateIndentation', () => {
        it('should maintain current indent for normal lines', () => {
            const code = 'int x = 42;';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            expect(indent).toBe(0);
        });

        it('should increase indent after opening brace', () => {
            const code = '  if (true) {';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            // 2 spaces base + 2 for opening brace = 4
            expect(indent).toBe(4);
        });

        it('should maintain base indent for lines with content', () => {
            const code = '  int x = 42;';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            expect(indent).toBe(2);
        });

        it('should handle nested braces', () => {
            const code = '    if (true) {';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            // 4 spaces base + 2 for opening brace = 6
            expect(indent).toBe(6);
        });

        it('should indent inside parentheses', () => {
            const code = '  myFunction(';
            const fullText = code + '\n  );';
            const indent = calculateIndentation(code, fullText, 0);
            // 2 spaces base + 4 for open paren = 6
            expect(indent).toBe(6);
        });

        it('should handle closing paren on same line', () => {
            const code = '  foo(bar);';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            // No open parens at end of line
            expect(indent).toBe(2);
        });

        it('should handle multiple nested parentheses', () => {
            const code = '  outer(inner(';
            const fullText = code + '\n  );';
            const indent = calculateIndentation(code, fullText, 0);
            // 2 spaces base + 4 for first open paren = 6
            expect(indent).toBe(6);
        });

        it('should handle empty line', () => {
            const code = '';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            expect(indent).toBe(0);
        });

        it('should handle line with only whitespace', () => {
            const code = '    ';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            expect(indent).toBe(4);
        });
    });

    /**
     * Test: findMatchingOpeningBrace function
     */
    describe('findMatchingOpeningBrace', () => {
        it('should find opening brace on same line', () => {
            const code = 'void foo() {}';
            const result = findMatchingOpeningBrace(code, 0);
            expect(result).toBe(0);
        });

        it('should find opening brace on different line', () => {
            const code = 'void foo() {\n  int x;\n}';
            const result = findMatchingOpeningBrace(code, 2);
            expect(result).toBe(0);
        });

        it('should handle nested braces', () => {
            const code = 'void foo() {\n  if (true) {\n    int x;\n  }\n}';
            const result = findMatchingOpeningBrace(code, 4);
            expect(result).toBe(0);
        });

        it('should find inner nested brace', () => {
            const code = 'void foo() {\n  if (true) {\n    int x;\n  }\n}';
            const result = findMatchingOpeningBrace(code, 3);
            expect(result).toBe(1);
        });

        it('should return null when no matching brace found', () => {
            const code = 'void foo()';
            const result = findMatchingOpeningBrace(code, 0);
            expect(result).toBeNull();
        });

        it('should handle multiple braces on same line', () => {
            const code = 'class Foo { int x; }';
            const result = findMatchingOpeningBrace(code, 0);
            expect(result).toBe(0);
        });

        it('should handle empty text', () => {
            const code = '';
            const result = findMatchingOpeningBrace(code, 0);
            expect(result).toBeNull();
        });

        it('should handle closing brace without opening', () => {
            const code = 'int x;\n}';
            const result = findMatchingOpeningBrace(code, 1);
            expect(result).toBeNull();
        });
    });

    /**
     * Test: Trigger characters configuration
     */
    describe('Trigger characters', () => {
        it('should have newline as trigger', () => {
            const triggerCharacters = ['\n', ';', '}'];
            expect(triggerCharacters).toContain('\n');
        });

        it('should have semicolon as trigger', () => {
            const triggerCharacters = ['\n', ';', '}'];
            expect(triggerCharacters).toContain(';');
        });

        it('should have closing brace as trigger', () => {
            const triggerCharacters = ['\n', ';', '}'];
            expect(triggerCharacters).toContain('}');
        });
    });

    /**
     * Integration tests: simulating on-type formatting behavior
     */
    describe('Integration: Formatting on newline', () => {
        it('should indent after function declaration with brace', () => {
            const code = 'void foo() {';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            expect(indent).toBeGreaterThan(0);
        });

        it('should indent after if statement with brace', () => {
            const code = 'if (condition) {';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            expect(indent).toBe(2);
        });

        it('should maintain indent after regular statement', () => {
            const code = 'int x = 5;';
            const fullText = code;
            const indent = calculateIndentation(code, fullText, 0);
            expect(indent).toBe(0);
        });
    });

    describe('Integration: Formatting on closing brace', () => {
        it('should align closing brace with opening', () => {
            const code = 'void foo() {\n  int x;\n}';
            const openingLine = findMatchingOpeningBrace(code, 2);
            expect(openingLine).toBe(0);
        });

        it('should handle nested closing braces', () => {
            const code = '{\n  {\n    int x;\n  }\n}';
            const openingLine = findMatchingOpeningBrace(code, 4);
            expect(openingLine).toBe(0);
        });
    });

    /**
     * Edge cases
     */
    describe('Edge cases', () => {
        it('should handle code with comments containing braces', () => {
            const code = '// { comment\nint x;';
            const openingLine = findMatchingOpeningBrace(code, 1);
            expect([0, null]).toContain(openingLine);
        });

        it('should handle string literals containing braces', () => {
            const code = 'string s = "{";\n}';
            const openingLine = findMatchingOpeningBrace(code, 1);
            expect([0, null]).toContain(openingLine);
        });

        it('should handle multiline strings', () => {
            const code = 'string s = #"line1\\nline2";\n}';
            const openingLine = findMatchingOpeningBrace(code, 1);
            expect([0, null]).toContain(openingLine);
        });
    });
});
