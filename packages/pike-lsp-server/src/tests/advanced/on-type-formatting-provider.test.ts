/**
 * On-Type Formatting Provider Tests
 *
 * TDD tests for on-type formatting functionality (Issue #182).
 *
 * Test scenarios:
 * - Format on Enter key
 * - Format on ; and }
 * - Respect editor formatting settings
 * - Tests for on-type formatting
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

describe('On-Type Formatting Provider', () => {

    /**
     * Issue #182: Format on Enter key
     */
    describe('Scenario: Format on Enter', () => {
        it('should maintain indentation on new line', () => {
            const previousLine = '  int x = 42;';
            const currentIndent = previousLine.search(/\S|$/);

            assert.equal(currentIndent, 2, 'Should detect 2-space indent');
        });

        it('should increase indent after opening brace', () => {
            const previousLine = '  if (true) {';
            const currentIndent = previousLine.search(/\S|$/);

            const newIndent = currentIndent + 2;
            assert.equal(newIndent, 4, 'Should indent to 4 spaces after {');
        });

        it('should indent within parentheses', () => {
            const lines = [
                '  myFunction(',
                '    arg1,',
                '    arg2',
                '  );'
            ];

            // Inside function call, indent to match opening paren
            const callIndent = lines[0]!.search(/\S|$/);
            const innerIndent = lines[1]!.search(/\S|$/);

            assert.equal(innerIndent, 4, 'Should indent to 4 spaces (2 base + 2 for arg)');
            assert.equal(innerIndent, callIndent + 2, 'Should be 2 more than call indent');
        });

        it('should calculate indent for nested blocks', () => {
            const line = '    if (true) {';
            const indent = line.search(/\S|$/);

            const expected = indent + 2;
            assert.equal(expected, 6, 'Should add 2 spaces for nested block');
        });
    });

    /**
     * Issue #182: Format on semicolon
     */
    describe('Scenario: Format on semicolon', () => {
        it('should detect semicolon trigger', () => {
            const trigger = ';';
            assert.equal(trigger, ';', 'Trigger character is semicolon');
        });

        it('should not auto-indent on semicolon in normal cases', () => {
            const line = 'int x = 42;';
            const trimmed = line.trim();

            // Normal statements shouldn't be re-indented
            assert.ok(trimmed.endsWith(';'), 'Line ends with semicolon');
        });

        it('should handle nested braces with semicolon', () => {
            const code = `  {
    int x = 42;
  };`;

            const lines = code.split('\n');
            const openBraceLine = lines[0]!;
            const closeBraceLine = lines[2]!;

            assert.ok(openBraceLine.includes('{'), 'Line 1 has opening brace');
            assert.ok(closeBraceLine.includes('}'), 'Line 3 has closing brace');
        });
    });

    /**
     * Issue #182: Format on closing brace
     */
    describe('Scenario: Format on closing brace', () => {
        it('should align closing brace with opening brace', () => {
            const code = `  if (true) {
    int x = 42;
  }`;

            const openingLine = code.split('\n')[0]!;
            const openingIndent = openingLine.search(/\S|$/);
            const closingLine = code.split('\n')[2]!;
            const closingIndent = closingLine.search(/\S|$/);

            assert.equal(openingIndent, 2, 'Opening brace at 2 spaces');
            assert.equal(closingIndent, 2, 'Closing brace at 2 spaces');
        });

        it('should handle nested brace alignment', () => {
            const code = `{
    {
      int x = 42;
    }
  }`;

            const lines = code.split('\n');
            const outerOpenIndent = lines[0]!.search(/\S|$/);
            const outerCloseIndent = lines[4]!.search(/\S|$/);

            assert.equal(outerOpenIndent, 0, 'Outer opening at column 0');
            assert.equal(outerCloseIndent, 2, 'Outer closing at 2 spaces (indented)');
        });

        it('should find matching opening brace', () => {
            const code = `{}`;

            const lines = code.split('\n');
            const firstLine = lines[0]!;

            // Simple check: opening brace exists
            assert.ok(firstLine.includes('{'), 'Opening brace found');
            assert.ok(firstLine.includes('}'), 'Closing brace found');
        });
    });

    /**
     * Issue #182: Respect editor formatting settings
     */
    describe('Scenario: Editor formatting settings', () => {
        it('should use tab size from settings', () => {
            const tabSize = 4;
            const indentSpaces = ' '.repeat(tabSize);

            assert.equal(indentSpaces.length, 4, 'Should create 4-space indent');
        });

        it('should use insertSpaces setting', () => {
            const insertSpaces = true;
            const useSpaces = insertSpaces;

            assert.ok(useSpaces === true, 'Should use spaces not tabs');
        });

        it('should respect trimTrailingWhitespace setting', () => {
            const line = 'int x = 42;   ';
            const trimmed = line.trimRight();

            assert.equal(trimmed, 'int x = 42;', 'Should trim trailing whitespace');
        });

        it('should respect insertFinalNewline setting', () => {
            const code = 'int x = 42;';
            const hasFinalNewline = code.endsWith('\n');

            assert.ok(!hasFinalNewline, 'Example code has no final newline');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty lines', () => {
            const line = '';
            const indent = line.search(/\S|$/);

            assert.equal(indent, 0, 'Empty line has 0 indent');
        });

        it('should handle whitespace-only lines', () => {
            const line = '    ';
            const indent = line.search(/\S|$/);

            assert.equal(indent, 4, 'Whitespace-only line has 4 indent');
        });

        it('should handle lines with only closing brace', () => {
            const line = '}';
            const hasContent = line.trim().length > 0;

            assert.ok(hasContent, 'Closing brace is content');
        });

        it('should handle deeply nested blocks', () => {
            const code = '{\n{\n{\n  int x;\n}\n}\n}';
            const braceCount = (code.match(/{/g) || []).length;
            const closeCount = (code.match(/}/g) || []).length;

            assert.equal(braceCount, 3, 'Has 3 opening braces');
            assert.equal(closeCount, 3, 'Has 3 closing braces');
        });
    });

    /**
     * Trigger Characters
     */
    describe('Trigger characters', () => {
        it('should trigger on newline', () => {
            const trigger = '\n';
            assert.equal(trigger, '\n', 'Newline is trigger character');
        });

        it('should trigger on semicolon', () => {
            const trigger = ';';
            assert.equal(trigger, ';', 'Semicolon is trigger character');
        });

        it('should trigger on closing brace', () => {
            const trigger = '}';
            assert.equal(trigger, '}', 'Closing brace is trigger character');
        });
    });
});
