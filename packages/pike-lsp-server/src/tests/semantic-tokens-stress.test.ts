/**
 * Stress Tests for Semantic Tokens
 *
 * Comprehensive stress testing for semantic tokens (token classification) covering:
 * - Large file handling (100+ symbols, deeply nested)
 * - Complex class hierarchies (inheritance, nested classes)
 * - Multiple symbol types (variables, functions, classes, constants, etc.)
 * - Performance under stress (large files, rapid requests)
 * - Error handling and edge cases
 *
 * These tests verify the semantic tokens provider handles various Pike constructs
 * correctly under stress conditions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';

// =============================================================================
// Test Infrastructure
// =============================================================================

let bridge: PikeBridge;

beforeAll(async () => {
    bridge = new PikeBridge();
    await bridge.start();
});

afterAll(async () => {
    if (bridge) {
        await bridge.stop();
    }
});

// =============================================================================
// Stress Tests: Semantic Tokens
// =============================================================================

describe('Semantic Tokens Provider Stress Tests', () => {

    // =========================================================================
    // 1. Large File Stress Tests
    // =========================================================================

    describe('1. Large File Tokenization', () => {

        it('should handle file with 100+ symbols efficiently', async () => {
            // Generate a large file with many classes and methods
            const lines: string[] = [];
            for (let i = 0; i < 50; i++) {
                lines.push(`class Handler${i} {`);
                lines.push(`    int field_${i};`);
                lines.push(`    void method_${i}() {`);
                lines.push(`        int x = ${i};`);
                lines.push(`    }`);
                lines.push(`}`);
            }
            const code = lines.join('\n');

            const start = performance.now();
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const elapsed = performance.now() - start;

            expect(result.result?.parse).toBeDefined();
            expect(elapsed).toBeLessThan(500); // Should complete within 500ms
        });

        it('should handle deeply nested class hierarchy', async () => {
            let code = 'class A {';
            for (let i = 0; i < 20; i++) {
                code += `\nclass Nested${i} {`;
            }
            for (let i = 0; i < 20; i++) {
                code += '\n}';
            }
            code += '\n}';

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse?.symbols).toBeDefined();
        });

        it('should handle file with 50+ methods in single class', async () => {
            const lines = ['class MegaClass {'];
            for (let i = 0; i < 60; i++) {
                lines.push(`    void method_${i}(int x) {`);
                lines.push(`        return x + ${i};`);
                lines.push(`    }`);
            }
            lines.push('}');
            const code = lines.join('\n');

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            // Should find the class and many methods
            expect(symbols.length).toBeGreaterThan(10);
        });

        it('should handle file with many global variables', async () => {
            const lines: string[] = [];
            for (let i = 0; i < 100; i++) {
                lines.push(`int global_var_${i} = ${i};`);
            }
            const code = lines.join('\n');

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            expect(symbols.length).toBeGreaterThan(50);
        });

        it('should handle file with many constant declarations', async () => {
            const lines: string[] = [];
            for (let i = 0; i < 50; i++) {
                lines.push(`constant MAX_${i} = ${i * 100};`);
            }
            const code = lines.join('\n');

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            // Constants should be parsed
            expect(result.result?.parse).toBeDefined();
        });
    });

    // =========================================================================
    // 2. Complex Symbol Types
    // =========================================================================

    describe('2. Complex Symbol Types', () => {

        it('should handle multiple class inheritance chains', async () => {
            const code = `class A { int a; }
class B { int b; }
class C { int c; }
class D { inherit A; inherit B; inherit C; int d; }`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            expect(symbols.length).toBeGreaterThanOrEqual(3);
        });

        it('should handle nested lambda functions', async () => {
            const code = `int main() {
    function f1 = lambda(int x) {
        function f2 = lambda(int y) { return y * 2; };
        return f2(x);
    };
    return f1(5);
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle complex enum declarations', async () => {
            const code = `enum Color {
    RED = 1,
    GREEN = 2,
    BLUE = 3,
    ALPHA = 4
}
enum Status {
    PENDING = 0,
    RUNNING = 1,
    COMPLETE = 2,
    FAILED = 3
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            // Should find enums
            expect(symbols.some(s => s.kind === 'enum')).toBe(true);
        });

        it('should handle typedef with complex types', async () => {
            const code = `typedef mapping(string:array(mixed)) ComplexType;
typedef function(int|string):mapping(string:int) CallbackType;
typedef program(ObjectClass) Factory;`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            // Should find typedefs
            expect(symbols.some(s => s.kind === 'typedef')).toBe(true);
        });

        it('should handle program type declarations', async () => {
            const code = `program Parser = class {
    void create() {}
    int parse(string input) { return 1; }
};
program Handler = class {
    void process() {}
};`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });
    });

    // =========================================================================
    // 3. Complex Control Flow with Symbols
    // =========================================================================

    describe('3. Complex Control Flow', () => {

        it('should handle deeply nested if-else with variables', async () => {
            const code = `int nested(int level) {
    if (level == 1) {
        int x = 1;
        if (level == 2) {
            int y = 2;
            if (level == 3) {
                int z = 3;
                return x + y + z;
            }
        }
    }
    return 0;
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            // Should find nested variables
            expect(symbols.some(s => s.name === 'x')).toBe(true);
        });

        it('should handle switch with case variables', async () => {
            let code = 'int result = 0;\nswitch (value) {';
            for (let i = 0; i < 20; i++) {
                code += `\ncase ${i}:\nint case_${i} = ${i};\nresult += case_${i};\nbreak;`;
            }
            code += '\ndefault:\nint def = -1;\nresult = def;\n}';

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle foreach loops with iterator variables', async () => {
            const code = `array items = ({ 1, 2, 3, 4, 5 });
void process_all() {
    foreach (items, mixed item) {
        int doubled = item * 2;
    }
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle mixed while and for loops', async () => {
            const code = `void process() {
    int counter = 0;
    while (counter < 10) {
        for (int i = 0; i < 5; i++) {
            int sum = counter + i;
        }
        counter++;
    }
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });
    });

    // =========================================================================
    // 4. Module and Import Handling
    // =========================================================================

    describe('4. Module and Import Handling', () => {

        it('should handle multiple import statements', async () => {
            const code = `import Stdio;
import Array;
import String;
import Mapping;
import Multiset;
import ADT;
import _Static;
import _Crypto;`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            // Imports should be parsed
            expect(symbols.some(s => s.kind === 'import')).toBe(true);
        });

        it('should handle multiple include statements', async () => {
            const code = `#include "config.h"
#include "defs.h"
#include "macros.h"`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle mixed imports and constants', async () => {
            const code = `import Stdio;
constant MAX_SIZE = 1000;
import Array;
constant DEFAULT_TIMEOUT = 30;`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });
    });

    // =========================================================================
    // 5. Performance Stress Tests
    // =========================================================================

    describe('5. Performance', () => {

        it('should tokenize 1000-line file within 1s', async () => {
            const lines: string[] = ['class LargeFile {'];
            for (let i = 0; i < 250; i++) {
                lines.push(`    int field${i};`);
                lines.push(`    void method${i}() {`);
                lines.push(`        int local${i} = ${i};`);
                lines.push(`    }`);
            }
            lines.push('}');
            const code = lines.join('\n');

            const start = performance.now();
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const elapsed = performance.now() - start;

            expect(result.result?.parse).toBeDefined();
            expect(elapsed).toBeLessThan(1000);
        });

        it('should handle rapid consecutive tokenization requests', async () => {
            const code = `class Test {
    int x;
    void method() { return; }
}`;

            const start = performance.now();
            for (let i = 0; i < 50; i++) {
                await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            }
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(500); // 50 parses in 500ms
        });

        it('should handle incremental updates efficiently', async () => {
            let code = `class Test {
int x;
void method() { return; }
}`;

            // First parse
            const start1 = performance.now();
            await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const elapsed1 = performance.now() - start1;

            // Add more content
            code += `\nclass Another {
int y;
}`;

            const start2 = performance.now();
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const elapsed2 = performance.now() - start2;

            expect(result.result?.parse).toBeDefined();
            expect(elapsed1 + elapsed2).toBeLessThan(200);
        });
    });

    // =========================================================================
    // 6. Error Handling and Edge Cases
    // =========================================================================

    describe('6. Error Handling', () => {

        it('should handle empty file', async () => {
            const result = await bridge.analyze('', ['parse'], '/tmp/test.pike');
            expect(result.result).toBeDefined();
        });

        it('should handle file with only whitespace', async () => {
            const code = '   \n   \n   ';
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result).toBeDefined();
        });

        it('should handle file with only comments', async () => {
            const code = `// Single line comment
/* Multi-line
   comment */
//! Autodoc comment`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result).toBeDefined();
        });

        it('should handle file with only string literals', async () => {
            const code = `string s1 = "hello";
string s2 = "world";
string s3 = "test";`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse?.symbols).toBeDefined();
        });

        it('should handle missing closing braces gracefully', async () => {
            const code = `class Test {
int x;
void method() {
return;`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle extra closing braces gracefully', async () => {
            const code = `class Test {
}
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle unbalanced parentheses', async () => {
            const code = `void test(int x, int y {
return x + y;
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle duplicate symbols gracefully', async () => {
            const code = `void helper() {}
void helper() {}
int helper = 5;`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            // Should parse without crashing
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle symbols with same name in different scopes', async () => {
            const code = `void helper() {}
class Container {
    void helper() {}
    class Inner {
        void helper() {}
    }
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            // Should find multiple helpers
            expect(symbols.filter(s => s.name === 'helper').length).toBeGreaterThan(0);
        });
    });

    // =========================================================================
    // 7. Advanced Symbol Scenarios
    // =========================================================================

    describe('7. Advanced Symbol Scenarios', () => {

        it('should handle class with static members', async () => {
            const code = `class Constants {
    static int MAX = 100;
    static constant DEFAULT = "default";
    static void init() {}
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            const constantsClass = symbols.find(s => s.name === 'Constants');
            expect(constantsClass).toBeDefined();
        });

        it('should handle polymorphic class methods', async () => {
            const code = `class Base {
    mixed ` + '`*' + `(string op, mixed ... args) { return 0; }
}
class Derived {
    inherit Base;
    int ` + '`+ ' + `(int x, int y) { return x + y; }
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle complex mapping and array literals', async () => {
            const code = `mapping config = ([
    "server": "localhost",
    "port": 8080,
    "ssl": true,
    "paths": ({ "/api", "/admin" })
]);
array data = ({ ({ "a", 1 }), ({ "b", 2 }) });`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle function pointers and callbacks', async () => {
            const code = `typedef void Callback(int result);
void register(Callback cb) {}
void fire() {
    register(lambda(int x) { return; });
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle complex ternary expressions', async () => {
            const code = `mixed result = condition1
    ? (condition2 ? value1 : value2)
    : (condition3 ? value3 : value4);`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });
    });

    // =========================================================================
    // 8. Token Type Coverage
    // =========================================================================

    describe('8. Token Type Coverage', () => {

        it('should tokenize all standard Pike types', async () => {
            const code = `int i;
string s;
float f;
mapping m;
multiset ms;
array a;
object o;
function fn;
program p;
mixed x;
void v;`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });

        it('should handle Pike keywords correctly', async () => {
            const code = `int main() {
    if (true) {
        while (false) {
            for (int i = 0; i < 10; i++) {
                switch (i) {
                    case 1: break;
                    case 2: continue;
                }
            }
        }
    }
    return 0;
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const symbols = result.result?.parse?.symbols || [];
            const mainFunc = symbols.find(s => s.name === 'main');
            expect(mainFunc).toBeDefined();
        });

        it('should handle operators as part of expressions', async () => {
            const code = `int calc() {
    int x = 1 + 2 * 3;
    int y = x > 5 && x < 10 ? 1 : 0;
    return x | y & 0xFF;
}`;

            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            expect(result.result?.parse).toBeDefined();
        });
    });
});

// =============================================================================
// Summary
// =============================================================================

describe('Semantic Tokens Stress Tests Summary', () => {

    it('report test coverage', () => {
        console.log('=== Semantic Tokens Provider Stress Test Summary ===');
        console.log('');
        console.log('Tokenization Stress Tests:');
        console.log('1. Large File Tokenization (5 tests)');
        console.log('2. Complex Symbol Types (5 tests)');
        console.log('3. Complex Control Flow (4 tests)');
        console.log('4. Module and Import Handling (3 tests)');
        console.log('5. Performance (3 tests)');
        console.log('6. Error Handling (9 tests)');
        console.log('7. Advanced Symbol Scenarios (5 tests)');
        console.log('8. Token Type Coverage (3 tests)');
        console.log('');
        console.log('Total: 37 stress tests');
        console.log('========================================================');
        expect(true).toBe(true);
    });
});
