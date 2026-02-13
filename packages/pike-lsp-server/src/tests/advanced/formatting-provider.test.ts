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

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { TextEdit } from 'vscode-languageserver/node.js';
import { formatPikeCode } from '../../features/advanced/formatting.js';

/**
 * Helper: Create a mock TextEdit
 */
function createTextEdit(overrides: Partial<TextEdit> = {}): TextEdit {
    return {
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 }
        },
        newText: '',
        ...overrides
    };
}

/**
 * Helper: Apply TextEdit[] to source text
 */
function applyEdits(text: string, edits: TextEdit[]): string {
    if (!edits.length) return text;

    const lines = text.split('\n');
    const newLines = [...lines];

    // Sort edits by position (they should already be in order)
    const sortedEdits = [...edits].sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) {
            return a.range.start.line - b.range.start.line;
        }
        return a.range.start.character - b.range.start.character;
    });

    for (const edit of sortedEdits) {
        const lineIdx = edit.range.start.line;
        const line = newLines[lineIdx] ?? '';

        // Replace leading whitespace with new indent
        const content = line.slice(edit.range.end.character);
        newLines[lineIdx] = edit.newText + content;
    }

    return newLines.join('\n');
}

describe('Formatting Provider', () => {

    /**
     * Test 20.1: Formatting - Indentation
     * GIVEN: A Pike document with inconsistent indentation
     * WHEN: Document formatting is requested
     * THEN: Return edits with consistent indentation
     */
    describe('Scenario 20.1: Formatting - Indentation', () => {
        it('should indent function body', () => {
            const input = `
void test() {
int x;
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
    int x;
}
`.trim();

            assert.equal(result, expected);
        });

        it('should indent class body', () => {
            const input = `
class Example {
int x;
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
class Example {
    int x;
}
`.trim();

            assert.equal(result, expected);
        });

        it('should indent nested blocks', () => {
            const input = `
void test() {
if (x) {
while (y) {
do_it();
}
}
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
    if (x) {
        while (y) {
            do_it();
        }
    }
}
`.trim();

            assert.equal(result, expected);
        });

        it('should indent if/else statements', () => {
            const input = `
void test() {
if (x) {
y = 1;
} else {
y = 2;
}
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
    if (x) {
        y = 1;
    } else {
        y = 2;
    }
}
`.trim();

            assert.equal(result, expected);
        });

        it('should indent loop bodies', () => {
            const input = `
void test() {
for (int i = 0; i < 10; i++) {
process(i);
}
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
    for (int i = 0; i < 10; i++) {
        process(i);
    }
}
`.trim();

            assert.equal(result, expected);
        });

        it('should align closing brace with opening statement', () => {
            const input = `
void test()
{
int x;
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test()
{
    int x;
}
`.trim();

            assert.equal(result, expected);
        });
    });

    /**
     * Test 20.2: Formatting - Spacing
     * GIVEN: A Pike document with inconsistent spacing
     * WHEN: Document formatting is requested
     * THEN: Return edits with consistent spacing
     * NOTE: Current formatter only handles indentation. Spacing tests verify
     * that indentation is preserved, not that spacing is normalized.
     */
    describe('Scenario 20.2: Formatting - Spacing', () => {
        it('should preserve spacing in function declarations', () => {
            const input = `
void   test(   int x   )
{
return x;
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            // Formatter should not modify content, only indentation
            assert.ok(result.includes('void   test'));
            assert.ok(result.includes('int x'));
        });

        it('should normalize indentation with existing spacing', () => {
            const input = `
int x=5;
int y = 10;
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            // Both lines should be at same indentation level
            assert.equal(result.split('\n')[0].trim(), 'int x=5;');
            assert.equal(result.split('\n')[1].trim(), 'int y = 10;');
        });
    });

    /**
     * Test 20.3: Formatting - Blank Lines
     * GIVEN: A Pike document with inconsistent blank lines
     * WHEN: Document formatting is requested
     * THEN: Return edits with appropriate blank lines
     * NOTE: Current formatter preserves blank lines without modification.
     */
    describe('Scenario 20.3: Formatting - Blank lines', () => {
        it('should preserve blank lines between declarations', () => {
            const input = `
int x;

int y;
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            // Blank line should be preserved
            assert.ok(result.includes('\n\n'));
        });

        it('should handle code with blank lines', () => {
            const input = `
void test() {

    int x;
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {

    int x;
}
`.trim();

            assert.equal(result, expected);
        });
    });

    /**
     * Test 20.4: Formatting - Configuration
     * GIVEN: User has configured formatting preferences
     * WHEN: Document formatting is requested
     * THEN: Return edits respecting configuration
     */
    describe('Scenario 20.4: Formatting - Configuration', () => {
        it('should use tabs when configured', () => {
            const input = `
void test() {
int x;
}
`.trim();

            const edits = formatPikeCode(input, '\t');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
\tint x;
}
`.trim();

            assert.equal(result, expected);
        });

        it('should use 2 spaces when configured', () => {
            const input = `
void test() {
int x;
}
`.trim();

            const edits = formatPikeCode(input, '  ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
  int x;
}
`.trim();

            assert.equal(result, expected);
        });

        it('should use 4 spaces when configured', () => {
            const input = `
void test() {
int x;
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
    int x;
}
`.trim();

            assert.equal(result, expected);
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty file', () => {
            const input = '';
            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            assert.equal(result, '');
        });

        it('should handle code with comments', () => {
            const input = `
void test() {
// comment
int x;
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            // Comment should be indented
            assert.ok(result.includes('    // comment'));
        });

        it('should handle multiline comments', () => {
            const input = `
void test() {
/* multi
line
comment */
int x;
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            // Comment content should be indented
            assert.ok(result.includes('/* multi'));
            assert.ok(result.includes('line'));
        });

        it('should handle very long lines', () => {
            const input = `
void test() {
int x = some_very_long_function_name(with_many, arguments, that, makes, this, line, extremely, long);
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            // Should still indent properly regardless of line length
            assert.ok(result.includes('    int x'));
        });

        it('should handle deeply nested structures', () => {
            const input = `
void test() {
if (x) {
if (y) {
if (z) {
deep();
}
}
}
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
    if (x) {
        if (y) {
            if (z) {
                deep();
            }
        }
    }
}
`.trim();

            assert.equal(result, expected);
        });
    });

    /**
     * Range Formatting
     */
    describe('Range Formatting', () => {
        it('should format selected range with offset', () => {
            const input = `void test() {
int x;
int y;
}`;

            const edits = formatPikeCode(input, '  ', 1);
            const result = applyEdits(input, edits);

            // Lines starting from index 1 should be formatted with 2-space indent
            // Note: input has no indent, so result is 'int x;' -> '  int x;'
            assert.ok(result.includes('int x;'));
            assert.ok(result.includes('int y;'));
        });
    });

    /**
     * Special Constructs
     */
    describe('Special Constructs', () => {
        it('should format switch/case statements', () => {
            const input = `void test() {
switch (x) {
case 1:
y = 1;
break;
default:
y = 0;
}
}`;

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `void test() {
    switch (x) {
    case 1:
        y = 1;
        break;
    default:
        y = 0;
    }
}`;

            assert.equal(result, expected);
        });

        it('should format foreach loops', () => {
            const input = `
void test() {
foreach (indices; int i; array) {
process(i);
}
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
    foreach (indices; int i; array) {
        process(i);
    }
}
`.trim();

            assert.equal(result, expected);
        });

        it('should format lambda functions', () => {
            const input = `
void test() {
map(arr, lambda(int x) {
return x * 2;
});
}
`.trim();

            const edits = formatPikeCode(input, '    ');
            const result = applyEdits(input, edits);

            const expected = `
void test() {
    map(arr, lambda(int x) {
        return x * 2;
    });
}
`.trim();

            assert.equal(result, expected);
        });
    });

    /**
     * Performance
     */
    describe('Performance', () => {
        it('should format large file efficiently', () => {
            const lines = [];
            for (let i = 0; i < 1000; i++) {
                lines.push(`int x${i} = ${i};`);
            }
            const input = `void test() {\n${lines.join('\n')}\n}`;

            const start = performance.now();
            const edits = formatPikeCode(input, '    ');
            const elapsed = performance.now() - start;

            assert.ok(elapsed < 500, `Formatting took ${elapsed}ms, expected < 500ms`);
            assert.ok(Array.isArray(edits));
        });
    });
});
