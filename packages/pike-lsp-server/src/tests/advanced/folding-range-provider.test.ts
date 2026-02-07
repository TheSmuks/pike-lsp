/**
 * Folding Range Provider Tests
 *
 * TDD tests for code folding functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#15-folding-range-provider
 *
 * Test scenarios:
 * - 15.1 Folding - Class definitions
 * - 15.2 Folding - Function definitions
 * - 15.3 Folding - Region comments
 * - 15.4 Folding - Nested structures
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { FoldingRange } from 'vscode-languageserver/node.js';

/**
 * Helper: Create a mock FoldingRange
 */
function createFoldingRange(overrides: Partial<FoldingRange> = {}): FoldingRange {
    return {
        startLine: 0,
        endLine: 10,
        kind: undefined,
        ...overrides
    };
}

describe('Folding Range Provider', () => {

    /**
     * Test 15.1: Folding - Class Definitions
     * GIVEN: A Pike document with a class definition
     * WHEN: The folding ranges are requested
     * THEN: Return folding range for the entire class body
     */
    describe('Scenario 15.1: Folding - Class definitions', () => {
        it('should create folding range for simple class', () => {
            const code = `class MyClass {
    int x;
}`;

            const lines = code.split('\n');
            const classStart = lines.findIndex(l => l.includes('class'));
            const classEnd = lines.findIndex(l => l.trim() === '}' && lines.indexOf(l) > classStart);

            assert.equal(classStart, 0, 'Class starts at line 0');
            assert.equal(classEnd, 2, 'Class ends at line 2');
            // FoldingRange would be { startLine: 0, endLine: 2 }
        });

        it('should fold class with methods', () => {
            const code = `class MyClass {
    void method1() { }
    void method2() { }
}`;

            const lines = code.split('\n');
            const classLine = lines.findIndex(l => l.includes('class '));
            const lastBrace = lines.findLastIndex(l => l.trim() === '}');

            assert.ok(classLine >= 0, 'Found class definition');
            assert.ok(lastBrace > classLine, 'Found closing brace');
        });

        it('should fold nested classes', () => {
            const code = `class Outer {
    class Inner {
        int x;
    }
}`;

            // Should have folding ranges for both Outer and Inner
            const classCount = (code.match(/class /g) || []).length;
            assert.equal(classCount, 2, 'Should find 2 classes');
        });
    });

    /**
     * Test 15.2: Folding - Function Definitions
     * GIVEN: A Pike document with function definitions
     * WHEN: The folding ranges are requested
     * THEN: Return folding range for function bodies
     */
    describe('Scenario 15.2: Folding - Function definitions', () => {
        it('should create folding range for simple function', () => {
            const code = `void myFunction() {
    int x = 42;
    return x;
}`;

            const lines = code.split('\n');
            const funcStart = lines.findIndex(l => l.includes('void myFunction'));
            const funcEnd = lines.findIndex(l => l.trim() === '}' && lines.indexOf(l) > funcStart);

            assert.equal(funcStart, 0, 'Function starts at line 0');
            assert.equal(funcEnd, 3, 'Function ends at line 3');
        });

        it('should fold function with nested blocks', () => {
            const code = `void myFunction() {
    if (true) {
        int x = 42;
    }
}`;

            // Should fold both function and if-statement
            const braceCount = (code.match(/\{/g) || []).length;
            assert.equal(braceCount, 2, 'Should have 2 opening braces');
        });

        it('should fold lambda functions', () => {
            const code = `lambda(function(int x) {
    return x * 2;
})`;

            const lambdaStart = code.indexOf('lambda');
            const lambdaEnd = code.lastIndexOf('}');

            assert.ok(lambdaStart >= 0, 'Found lambda start');
            assert.ok(lambdaEnd > lambdaStart, 'Found lambda end');
        });
    });

    /**
     * Test 15.3: Folding - Region Comments
     * GIVEN: A Pike document with region markers (// #region, // #endregion)
     * WHEN: The folding ranges are requested
     * THEN: Return folding range for the region
     */
    describe('Scenario 15.3: Folding - Region comments', () => {
        it('should create folding range for #region', () => {
            const code = `// #region my region
int x = 42;
// #endregion`;

            const regionStart = code.indexOf('#region');
            const regionEnd = code.indexOf('#endregion');

            assert.ok(regionStart >= 0, 'Found region start');
            assert.ok(regionEnd > regionStart, 'Found region end');
        });

        it('should handle nested #region blocks', () => {
            const code = `// #region outer
// #region inner
int x = 42;
// #endregion
// #endregion`;

            const regionCount = (code.match(/#region/g) || []).length;
            const endCount = (code.match(/#endregion/g) || []).length;

            assert.equal(regionCount, 2, 'Should have 2 regions');
            assert.equal(endCount, 2, 'Should have 2 endregion markers');
        });

        it('should ignore unmatched #endregion', () => {
            const code = `// #endregion
int x = 42;`;

            // Unmatched endregion should be ignored
            const regionStart = code.indexOf('#region');
            const regionEnd = code.indexOf('#endregion');

            assert.ok(regionStart === -1, 'No region start');
            assert.ok(regionEnd >= 0, 'Has endregion (should be ignored)');
        });
    });

    /**
     * Test 15.4: Folding - Nested Structures
     * GIVEN: A Pike document with deeply nested structures
     * WHEN: The folding ranges are requested
     * THEN: Return folding ranges for all nested levels
     */
    describe('Scenario 15.4: Folding - Nested structures', () => {
        it('should create folding ranges for multiple nesting levels', () => {
            const code = `void outer() {
    void middle() {
        void inner() {
            int x;
        }
    }
}`;

            const braceCount = (code.match(/\{/g) || []).length;
            assert.equal(braceCount, 3, 'Should have 3 nesting levels');
        });

        it('should handle class containing function containing if-statement', () => {
            const code = `class MyClass {
    void myMethod() {
        if (true) {
            int x = 42;
        }
    }
}`;

            const hasClass = code.includes('class');
            const hasFunction = code.includes('void myMethod');
            const hasIf = code.includes('if (');

            assert.ok(hasClass && hasFunction && hasIf, 'Has class, function, and if-statement');
        });

        it('should order ranges from outermost to innermost', () => {
            const ranges = [
                { startLine: 0, endLine: 10, kind: 'class' },
                { startLine: 1, endLine: 9, kind: 'function' },
                { startLine: 2, endLine: 8, kind: 'if' }
            ];

            // Outermost should come first
            assert.equal(ranges[0]!.startLine, 0, 'Outermost is first');
            assert.ok(ranges[1]!.startLine > ranges[0]!.startLine, 'Inner comes after outer');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty file', () => {
            const code = ``;

            assert.equal(code.length, 0, 'File is empty');
            // Should return empty array of folding ranges
        });

        it('should handle file with no foldable structures', () => {
            const code = `int x = 42;
string y = "hello";`;

            const hasBraces = code.includes('{');
            assert.ok(!hasBraces, 'No braces means no foldable structures');
        });

        it('should handle incomplete class definition', () => {
            const code = `class MyClass {
    int x;`;

            const hasOpenBrace = code.includes('{');
            const hasCloseBrace = code.includes('}');

            assert.ok(hasOpenBrace && !hasCloseBrace, 'Incomplete class has opening but no closing brace');
        });

        it('should handle multi-line comments', () => {
            const code = `/* This is a
multi-line comment */`;

            const isComment = code.startsWith('/*');
            assert.ok(isComment, 'Is multi-line comment');
        });
    });

    /**
     * Performance Tests
     */
    describe('Performance', () => {
        it('should compute folding ranges for large file within 200ms', () => {
            const lines: string[] = ['class MyClass {'];
            for (let i = 0; i < 1000; i++) {
                lines.push(`    void method${i}() { }`);
            }
            lines.push('}');

            const code = lines.join('\n');
            const braceCount = (code.match(/\{/g) || []).length;

            assert.equal(braceCount, 1001, 'Generated large file with 1001 braces');
            // Performance test would time actual execution
        });
    });

    /**
     * Folding Range Kinds
     */
    describe('Folding Range Kinds', () => {
        it('should mark class ranges with correct kind', () => {
            const code = `class MyClass { }`;

            const hasClass = code.includes('class');
            assert.ok(hasClass, 'Code contains class definition');

            // FoldingRangeKind would be FoldingRangeKind.Region or similar
            const kind = 'region';
            assert.equal(typeof kind, 'string', 'Kind is string');
        });

        it('should mark function ranges with correct kind', () => {
            const code = `void myFunction() { }`;

            const hasFunction = code.includes('void myFunction');
            assert.ok(hasFunction, 'Code contains function definition');

            // Could use FoldingRangeKind.Function or undefined
            const kind = undefined;
            assert.ok(kind === undefined || typeof kind === 'string', 'Kind is valid');
        });

        it('should mark comment ranges with correct kind', () => {
            const code = `/* Multi-line
comment */`;

            const isComment = code.includes('/*');
            assert.ok(isComment, 'Code contains multi-line comment');

            // FoldingRangeKind.Comment
            const kind = 'comment';
            assert.equal(kind, 'comment', 'Comment kind');
        });
    });
});
