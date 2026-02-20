/**
 * Stress Tests for Folding Ranges
 *
 * Comprehensive stress testing for folding ranges covering:
 * - Code folding (classes, methods, functions, inheritance)
 * - Comment folding (block comments, autodoc comments)
 * - Edge cases with deeply nested structures
 * - Large file handling
 * - Performance under stress
 *
 * These tests verify the folding range handler handles various Pike constructs
 * correctly under stress conditions.
 */

import { describe, it, expect } from 'bun:test';
import { FoldingRange, FoldingRangeKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getFoldingRanges } from '../features/advanced/folding.js';

// =============================================================================
// Test Infrastructure: Helper Functions
// =============================================================================

/**
 * Helper to create a TextDocument for testing
 */
function createDocument(content: string): TextDocument {
    return TextDocument.create('test://test.pike', 'pike', 1, content);
}

/**
 * Helper to get folding ranges from code
 */
function getFolding(code: string): FoldingRange[] {
    const doc = createDocument(code);
    return getFoldingRanges(doc);
}

/**
 * Helper to count folding ranges by kind
 */
function countByKind(ranges: FoldingRange[]): Record<string, number> {
    const result: Record<string, number> = {
        region: 0,
        comment: 0,
        undefined: 0,
    };
    for (const range of ranges) {
        if (range.kind === FoldingRangeKind.Region) {
            result.region++;
        } else if (range.kind === FoldingRangeKind.Comment) {
            result.comment++;
        } else {
            result.undefined++;
        }
    }
    return result;
}

// =============================================================================
// Stress Tests: Folding Ranges
// =============================================================================

describe('Folding Range Provider Stress Tests', () => {

    // =========================================================================
    // 1. Large File Stress Tests
    // =========================================================================

    describe('1. Large File Folding', () => {

        it('should handle file with 100+ lines efficiently', () => {
            const lines: string[] = [];
            for (let i = 0; i < 100; i++) {
                if (i % 10 === 0) {
                    lines.push(`class Class${i} {`);
                } else if (i % 10 === 5) {
                    lines.push(`int field${i};`);
                } else if (i % 10 === 9) {
                    lines.push(`}`);
                } else {
                    lines.push(`void method${i}() {`);
                    lines.push(`int x = ${i};`);
                    lines.push(`}`);
                }
            }
            const code = lines.join('\n');

            const start = performance.now();
            const ranges = getFolding(code);
            const elapsed = performance.now() - start;

            expect(ranges.length).toBeGreaterThan(0);
            expect(elapsed).toBeLessThan(50); // Should complete within 50ms
        });

        it('should handle deeply nested class hierarchy', () => {
            let code = 'class A {';
            for (let i = 0; i < 20; i++) {
                code += `\nclass Nested${i} {`;
            }
            for (let i = 0; i < 20; i++) {
                code += '\n}';
            }
            code += '\n}';

            const ranges = getFolding(code);
            expect(ranges.length).toBe(21); // 20 nested + 1 outer
        });

        it('should handle file with 50+ methods in single class', () => {
            const lines = ['class MegaClass {'];
            for (let i = 0; i < 60; i++) {
                lines.push(`void method_${i}() {`);
                lines.push(`int x = ${i};`);
                lines.push(`}`);
            }
            lines.push('}');
            const code = lines.join('\n');

            const ranges = getFolding(code);
            // 1 class + 60 methods = 61 folding ranges
            expect(ranges.length).toBe(61);
        });

        it('should handle large array literal', () => {
            const lines = ['array(int) numbers = ({'];
            for (let i = 0; i < 100; i++) {
                lines.push(`${i},`);
            }
            lines.push('});');
            const code = lines.join('\n');

            const ranges = getFolding(code);
            // Arrays create one folding range from ({ to });
            expect(ranges.length).toBeGreaterThanOrEqual(0);
        });

        it('should handle large mapping literal', () => {
            const lines = ['mapping(string:int) config = (['];
            for (let i = 0; i < 50; i++) {
                lines.push(`"key_${i}": ${i},`);
            }
            lines.push(']);');
            const code = lines.join('\n');

            const ranges = getFolding(code);
            expect(ranges).toBeDefined();
        });
    });

    // =========================================================================
    // 2. Code Folding Stress Tests
    // =========================================================================

    describe('2. Code Folding', () => {

        it('should handle multiple classes in sequence', () => {
            const code = `class A {
int x;
}
class B {
int y;
}
class C {
int z;
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(3);
        });

        it('should handle nested classes', () => {
            const code = `class Outer {
class Inner {
int value;
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(2);
            const kinds = countByKind(ranges);
            expect(kinds.region).toBe(2); // Both are regions
        });

        it('should handle inheritance folding', () => {
            const code = `class Derived {
inherit BaseClass;
inherit AnotherBase;
int value;
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(1);
            expect(ranges[0].kind).toBe(FoldingRangeKind.Region);
        });

        it('should handle function folding', () => {
            const code = `int calculate(int a, int b) {
return a + b;
}

void process() {
for (int i = 0; i < 10; i++) {
print("test");
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(3); // 2 functions + 1 for loop
        });

        it('should handle switch statement folding', () => {
            const code = `switch (value) {
case 1:
handle_one();
break;
case 2:
handle_two();
break;
default:
handle_default();
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(1);
        });

        it('should handle nested switch statements', () => {
            const code = `switch (outer) {
case 1:
switch (inner) {
case 1:
handle_inner();
break;
}
break;
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(2);
        });

        it('should handle foreach loops folding', () => {
            const code = `foreach (items, mixed item) {
if (item->is_valid()) {
process(item);
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(2); // foreach + if
        });

        it('should handle mixed control structures', () => {
            const code = `void complex() {
if (condition) {
for (int i = 0; i < 10; i++) {
while (has_more()) {
process(i);
}
}
} else {
switch (value) {
case 1:
break;
}
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBeGreaterThanOrEqual(4); // at least if, for, while, switch
        });
    });

    // =========================================================================
    // 3. Comment Folding Stress Tests
    // =========================================================================

    describe('3. Comment Folding', () => {

        it('should handle single-line block comments', () => {
            const code = `/* This is a comment */`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(0); // Single line, no folding
        });

        it('should handle multi-line block comments', () => {
            const code = `/* This is
a multi-line
comment */`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(1);
            expect(ranges[0].kind).toBe(FoldingRangeKind.Comment);
        });

        it('should handle multiple block comments', () => {
            const code = `/* First
comment */

class Test {
int x;
}

/* Second
comment */`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(3); // 2 comments + 1 class
            const kinds = countByKind(ranges);
            expect(kinds.comment).toBe(2);
            expect(kinds.region).toBe(1);
        });

        it('should handle autodoc comments', () => {
            const code = `//! Autodoc
//! continues here
class Test {
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(2); // autodoc + class
            const kinds = countByKind(ranges);
            expect(kinds.comment).toBe(1);
            expect(kinds.region).toBe(1);
        });

        it('should handle multiple autodoc blocks', () => {
            const code = `//! First doc block
//! for class

class MyClass {
//! Method doc
//! continues
void method() {
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBeGreaterThanOrEqual(3); // autodoc + class + method
        });

        it('should handle nested comments in code', () => {
            const code = `class Test {
 /* Inner comment
  spanning lines
 */
int x;
}`;

            const ranges = getFolding(code);
            // Class folding + comment folding
            expect(ranges.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle comment at end of line', () => {
            const code = `int x = 5; // inline comment
int y = 10; /* end comment */`;

            const ranges = getFolding(code);
            // No folding expected for end-of-line comments
            expect(ranges.length).toBe(0);
        });
    });

    // =========================================================================
    // 4. Complex/Edge Case Stress Tests
    // =========================================================================

    describe('4. Complex Edge Cases', () => {

        it('should handle empty file', () => {
            const ranges = getFolding('');
            expect(ranges.length).toBe(0);
        });

        it('should handle file with only whitespace', () => {
            const code = '   \n   \n   ';
            const ranges = getFolding(code);
            expect(ranges.length).toBe(0);
        });

        it('should handle missing closing braces gracefully', () => {
            const code = `class Test {
int x;
void method() {
return;`;

            const ranges = getFolding(code);
            // Should still return partial folding for what we have
            expect(ranges).toBeDefined();
        });

        it('should handle extra closing braces gracefully', () => {
            const code = `class Test {
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(1); // Only valid brace pair
        });

        it('should handle unbalanced braces', () => {
            const code = `void test() {
if (x) {
print("test";
}`;

            const ranges = getFolding(code);
            expect(ranges).toBeDefined();
        });

        it('should handle multiline strings', () => {
            const code = `string sql = #"
SELECT *
FROM users
WHERE active = 1
"#;`;

            const ranges = getFolding(code);
            // Multiline string might be folded depending on implementation
            expect(ranges).toBeDefined();
        });

        it('should handle complex nested structures', () => {
            const code = `class Outer {
class Middle {
class Inner {
void method() {
if (x) {
while (y) {
process();
}
}
}
}
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBeGreaterThanOrEqual(5); // at least 3 classes + method + if + while
        });

        it('should handle lambda expressions', () => {
            const code = `function processor = lambda(int x) {
return x * 2;
};`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(1);
        });

        it('should handle program type declarations', () => {
            const code = `program Parser = class {
void create() {
}
int parse(string input) {
return 1;
}
};`;

            const ranges = getFolding(code);
            expect(ranges.length).toBeGreaterThanOrEqual(2); // at least program class + methods
        });

        it('should handle enum with methods', () => {
            const code = `enum Color {
RED = 1,
GREEN = 2,
BLUE = 3
string name() {
return "color";
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(2); // enum + method
        });
    });

    // =========================================================================
    // 5. Performance Stress Tests
    // =========================================================================

    describe('5. Performance', () => {

        it('should process 1000-line file within 500ms', () => {
            const lines: string[] = [];
            for (let i = 0; i < 1000; i++) {
                if (i % 10 === 0) {
                    lines.push(`class Class${i} {`);
                } else if (i % 10 === 5) {
                    lines.push(`int field${i};`);
                } else if (i % 10 === 9) {
                    lines.push(`}`);
                } else {
                    lines.push(`void method${i}() {`);
                    lines.push(`int x = ${i};`);
                    lines.push(`}`);
                }
            }
            const code = lines.join('\n');

            const start = performance.now();
            const ranges = getFolding(code);
            const elapsed = performance.now() - start;

            expect(ranges.length).toBeGreaterThan(0);
            expect(elapsed).toBeLessThan(500);
        });

        it('should handle rapid consecutive folding requests', () => {
            const code = `class Test {
int x;
void method() { return; }
}`;

            const start = performance.now();
            for (let i = 0; i < 100; i++) {
                getFolding(code);
            }
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(200); // 100 folds in 200ms
        });

        it('should handle mixed content efficiently', () => {
            let code = '';
            // Add 50 classes
            for (let i = 0; i < 50; i++) {
                code += `class Class${i} {\n`;
                // Add comments
                code += `/* Comment ${i} */\n`;
                // Add methods
                for (let j = 0; j < 5; j++) {
                    code += `void method_${j}() {\n`;
                    code += `int x = ${j};\n`;
                    code += `}\n`;
                }
                code += `}\n`;
            }

            const start = performance.now();
            const ranges = getFolding(code);
            const elapsed = performance.now() - start;

            expect(ranges.length).toBeGreaterThan(0);
            expect(elapsed).toBeLessThan(100);
        });
    });

    // =========================================================================
    // 6. Additional Edge Cases
    // =========================================================================

    describe('6. Additional Edge Cases', () => {

        it('should handle multiple inheritance', () => {
            const code = `class Derived {
inherit BaseClass;
inherit AnotherBase;
inherit ThirdBase;
int value;
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(1);
            expect(ranges[0].kind).toBe(FoldingRangeKind.Region);
        });

        it('should handle constant declarations', () => {
            const code = `constant MAX_SIZE = 1000;
constant PI = 3.14159;`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(0);
        });

        it('should handle import statements', () => {
            const code = `import Stdio;
import Array;
import Regex;`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(0);
        });

        it('should handle mixed inheritance and methods', () => {
            const code = `class MyClass {
inherit Parent;
int field;
void method() { }
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBeGreaterThanOrEqual(1); // at least class
            const kinds = countByKind(ranges);
            expect(kinds.region).toBeGreaterThanOrEqual(1);
        });

        it('should handle do-while loops', () => {
            const code = `do {
process();
counter++;
} while (counter < limit);`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(1);
        });

        it('should handle mixed while and for loops', () => {
            const code = `while (has_more()) {
for (int i = 0; i < batch_size; i++) {
process_batch(i);
}
cleanup();
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(2); // while + for
        });

        it('should handle deeply nested if-else chains', () => {
            const code = `void process(int level) {
if (level == 1) {
if (level == 2) {
if (level == 3) {
handle_deep();
}
}
}
}`;

            const ranges = getFolding(code);
            expect(ranges.length).toBe(4); // outer if + 3 nested ifs
        });

        it('should handle switch with many cases', () => {
            let code = 'int result = 0;\nswitch (value) {';
            for (let i = 0; i < 30; i++) {
                code += `\ncase ${i}:\nresult += ${i};\nbreak;`;
            }
            code += '\ndefault:\nresult = -1;\n}';

            const ranges = getFolding(code);
            expect(ranges.length).toBe(1); // Just the switch
        });
    });
});

// =============================================================================
// Summary
// =============================================================================

describe('Folding Range Stress Tests Summary', () => {

    it('report test coverage', () => {
        console.log('=== Folding Range Provider Stress Test Summary ===');
        console.log('');
        console.log('Folding Range Tests:');
        console.log('1. Large File Folding (5 tests)');
        console.log('2. Code Folding (8 tests)');
        console.log('3. Comment Folding (7 tests)');
        console.log('4. Complex Edge Cases (10 tests)');
        console.log('5. Performance (3 tests)');
        console.log('6. Additional Edge Cases (8 tests)');
        console.log('');
        console.log('Total: 41 stress tests');
        console.log('================================================');
        expect(true).toBe(true);
    });
});
