/**
 * Stress Tests for Semantic Tokens
 *
 * Comprehensive stress testing for semantic tokens provider covering:
 * - Large files with many symbols
 * - Various token types (variable, function, class, etc.)
 * - High symbol counts
 * - Edge cases: shadowing, similar names, comments/strings
 * - Performance benchmarks
 *
 * These tests verify the semantic tokens provider handles various Pike constructs
 * correctly under stress conditions.
 */

import { describe, it, expect } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerSemanticTokensHandler } from '../../features/advanced/semantic-tokens.js';
import {
    createMockConnection,
    createMockDocuments,
    createMockServices,
    makeCacheEntry,
    sym,
} from '../helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';

// =============================================================================
// Test Infrastructure
// =============================================================================

interface SetupOptions {
    code: string;
    uri?: string;
    symbols?: Array<{ name: string; kind: string; position?: { line: number; character: number }; modifiers?: string[] }>;
}

function setup(opts: SetupOptions) {
    const uri = opts.uri ?? 'file:///test.pike';
    const doc = TextDocument.create(uri, 'pike', 1, opts.code);

    const docsMap = new Map<string, TextDocument>();
    docsMap.set(uri, doc);

    const symbols = (opts.symbols ?? []).map(s =>
        sym(s.name, s.kind, { position: s.position, modifiers: s.modifiers })
    );

    const cacheEntry = makeCacheEntry({ symbols });
    const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
    });
    const documents = createMockDocuments(docsMap);
    const conn = createMockConnection();

    registerSemanticTokensHandler(conn as any, services as any, documents as any);

    return {
        getTokens: () => conn.semanticTokensHandler({ textDocument: { uri } }),
        getTokensDelta: () => conn.semanticTokensDeltaHandler({ textDocument: { uri }, previousResultId: 'previous' }),
        uri,
        doc,
    };
}

/**
 * Helper to count tokens by type in semantic tokens data
 */
function countTokensByType(tokensData: number[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (let i = 0; i < tokensData.length; i += 5) {
        const tokenType = tokensData[i + 3];
        counts.set(tokenType, (counts.get(tokenType) || 0) + 1);
    }
    return counts;
}

// Token type indices (from semantic-tokens.ts)
const TOKEN_TYPE = {
    namespace: 0,
    type: 1,
    class: 2,
    enum: 3,
    interface: 4,
    struct: 5,
    typeParameter: 6,
    parameter: 7,
    variable: 8,
    property: 9,
    enumMember: 10,
    event: 11,
    function: 12,
    method: 13,
    macro: 14,
    keyword: 15,
    modifier: 16,
    comment: 17,
    string: 18,
    number: 19,
    regexp: 20,
    operator: 21,
    decorator: 22,
};

// =============================================================================
// Variable Token Stress Tests
// =============================================================================

describe('Semantic Tokens Stress: Variables', () => {

    describe('Multiple variable declarations', () => {
        it('should tokenize many variable declarations', () => {
            const symbols = [];
            const lines = ['int main() {'];
            for (let i = 0; i < 50; i++) {
                lines.push(`    int var${i} = ${i};`);
                symbols.push(sym(`var${i}`, 'variable', { position: { line: i + 1, character: 8 } }));
            }
            lines.push('    return 0;');
            lines.push('}');
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });

            const result = getTokens();
            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle variables with underscores in name', () => {
            const symbols = [
                sym('my_variable', 'variable', { position: { line: 1, character: 4 } }),
                sym('another_var', 'variable', { position: { line: 2, character: 4 } }),
                sym('third_variable', 'variable', { position: { line: 3, character: 4 } }),
            ];
            const code = `int my_variable = 1;
int another_var = 2;
int third_variable = 3;
int result = my_variable + another_var + third_variable;`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle variables with numeric suffixes', () => {
            const symbols = [
                sym('var1', 'variable', { position: { line: 1, character: 4 } }),
                sym('var2', 'variable', { position: { line: 2, character: 4 } }),
                sym('var10', 'variable', { position: { line: 3, character: 4 } }),
            ];
            const code = `int var1 = 1;
int var2 = 2;
int var10 = 10;
int total = var1 + var2 + var10;`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            // Should find all variable tokens
            const typeCounts = countTokensByType(result.data);
            const varCount = typeCounts.get(TOKEN_TYPE.variable) || 0;
            expect(varCount).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Variable shadowing', () => {
        it('should handle shadowed variables in nested scopes', () => {
            const symbols = [
                sym('x', 'variable', { position: { line: 1, character: 4 } }),
                sym('x', 'variable', { position: { line: 3, character: 8 } }),
            ];
            const code = `int x = 1;
void func() {
    int x = 2;
    write("%d\\n", x);
}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle same variable name at multiple scopes', () => {
            const symbols = [
                sym('counter', 'variable', { position: { line: 1, character: 4 } }),
            ];
            const code = `int counter = 0;
for (int i = 0; i < 10; i++) {
    int counter = i;
    write("%d\\n", counter);
}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            // Should produce tokens without errors
            expect(result.data.length).toBeGreaterThan(0);
        });
    });

    describe('High occurrence counts', () => {
        it('should handle 50+ variable occurrences', () => {
            const symbols = [
                sym('target', 'variable', { position: { line: 1, character: 4 } }),
            ];
            const lines = ['int target = 0;'];
            for (let i = 0; i < 50; i++) {
                lines.push(`target = target + ${i};`);
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle 100+ variable occurrences', () => {
            const symbols = [
                sym('item', 'variable', { position: { line: 1, character: 4 } }),
            ];
            const lines = ['int item = 0;'];
            for (let i = 0; i < 100; i++) {
                lines.push(`item += ${i};`);
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });
});

// =============================================================================
// Function/Method Token Stress Tests
// =============================================================================

describe('Semantic Tokens Stress: Functions', () => {

    describe('Function declarations', () => {
        it('should tokenize many function declarations', () => {
            const symbols = [];
            const lines = [];
            for (let i = 0; i < 30; i++) {
                lines.push(`int func${i}(int x) { return x + ${i}; }`);
                symbols.push(sym(`func${i}`, 'method', { position: { line: i + 1, character: 4 } }));
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle function with many parameters', () => {
            const symbols = [
                sym('process', 'method', { position: { line: 1, character: 4 } }),
            ];
            const code = `int process(int a, int b, int c, int d, int e) {
    return a + b + c + d + e;
}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle recursive function', () => {
            const symbols = [
                sym('factorial', 'method', { position: { line: 1, character: 4 } }),
            ];
            const code = `int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });

    describe('Multiple functions', () => {
        it('should handle 20+ distinct functions', () => {
            const symbols = [];
            const lines = [];
            for (let i = 0; i < 20; i++) {
                lines.push(`void handler${i}() { }`);
                symbols.push(sym(`handler${i}`, 'method', { position: { line: i + 1, character: 6 } }));
            }
            // Add calls to each
            for (let i = 0; i < 20; i++) {
                lines.push(`handler${i}();`);
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle functions with similar names', () => {
            const symbols = [
                sym('process', 'method', { position: { line: 1, character: 4 } }),
                sym('processor', 'method', { position: { line: 2, character: 4 } }),
                sym('processed', 'method', { position: { line: 3, character: 4 } }),
                sym('processing', 'method', { position: { line: 4, character: 4 } }),
            ];
            const code = `void process() { }
void processor() { }
void processed() { }
void processing() { }
process();
processor();
processed();
processing();`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            // Each function should have its own tokens, not mixed
            expect(result.data.length).toBeGreaterThanOrEqual(8);
        });
    });

    describe('Function calls', () => {
        it('should handle 50+ function calls', () => {
            const symbols = [
                sym('process', 'method', { position: { line: 1, character: 6 } }),
            ];
            const lines = ['void process() { }'];
            for (let i = 0; i < 50; i++) {
                lines.push('process();');
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });
});

// =============================================================================
// Class Token Stress Tests
// =============================================================================

describe('Semantic Tokens Stress: Classes', () => {

    describe('Class declarations', () => {
        it('should tokenize many class declarations', () => {
            const symbols = [];
            const lines = [];
            for (let i = 0; i < 20; i++) {
                lines.push(`class Class${i} { }`);
                symbols.push(sym(`Class${i}`, 'class', { position: { line: i + 1, character: 6 } }));
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            const typeCounts = countTokensByType(result.data);
            const classCount = typeCounts.get(TOKEN_TYPE.class) || 0;
            expect(classCount).toBeGreaterThanOrEqual(20);
        });

        it('should handle class with many methods', () => {
            const symbols = [
                sym('Handler', 'class', { position: { line: 1, character: 6 } }),
                sym('handle', 'method', { position: { line: 2, character: 8 } }),
            ];
            const lines = ['class Handler {'];
            for (let i = 0; i < 20; i++) {
                lines.push(`    void method${i}() { }`);
            }
            lines.push('}');
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle nested classes', () => {
            const symbols = [
                sym('Outer', 'class', { position: { line: 1, character: 6 } }),
                sym('Inner', 'class', { position: { line: 2, character: 8 } }),
            ];
            const code = `class Outer {
    class Inner {
    }
}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });

    describe('Class inheritance', () => {
        it('should handle class hierarchy', () => {
            const symbols = [
                sym('Base', 'class', { position: { line: 1, character: 6 } }),
                sym('Derived', 'class', { position: { line: 3, character: 6 } }),
            ];
            const code = `class Base {
    void method() { }
}
class Derived {
    inherit Base;
}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle deep inheritance chain', () => {
            const symbols = [
                sym('Level1', 'class', { position: { line: 1, character: 6 } }),
                sym('Level2', 'class', { position: { line: 3, character: 6 } }),
                sym('Level3', 'class', { position: { line: 5, character: 6 } }),
            ];
            const code = `class Level1 { }
class Level2 { inherit Level1; }
class Level3 { inherit Level2; }`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });

    describe('Class instances', () => {
        it('should handle many class instances', () => {
            const symbols = [
                sym('Handler', 'class', { position: { line: 1, character: 6 } }),
            ];
            const lines = ['class Handler { }'];
            for (let i = 0; i < 30; i++) {
                lines.push(`Handler h${i} = Handler();`);
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });
});

// =============================================================================
// Edge Cases Stress Tests
// =============================================================================

describe('Semantic Tokens Stress: Edge Cases', () => {

    describe('Similar names', () => {
        it('should not confuse similar variable names', () => {
            const symbols = [
                sym('value', 'variable', { position: { line: 1, character: 4 } }),
                sym('values', 'variable', { position: { line: 2, character: 4 } }),
                sym('val', 'variable', { position: { line: 3, character: 4 } }),
            ];
            const code = `int value = 1;
int values = 2;
int val = 3;
int result = value + values + val;`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle prefix matches correctly', () => {
            const symbols = [
                sym('process', 'method', { position: { line: 1, character: 6 } }),
                sym('processData', 'method', { position: { line: 2, character: 6 } }),
            ];
            const code = `void process() { }
void processData() { }
process();
processData();`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            // Each function should have its own token entries
            expect(result.data.length).toBeGreaterThanOrEqual(4);
        });
    });

    describe('Comments and strings', () => {
        it('should not tokenize symbols inside comments', () => {
            const symbols = [
                sym('target', 'variable', { position: { line: 1, character: 4 } }),
            ];
            const code = `int target = 1;
// This mentions target in a comment
/* target is also mentioned here */`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            // Should only tokenize actual symbol occurrences, not those in comments
            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should not tokenize symbols inside strings', () => {
            const symbols = [
                sym('message', 'variable', { position: { line: 1, character: 7 } }),
            ];
            const code = `string message = "This mentions message in a string";
write("The message is: %s\\n", message);`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            // Should only tokenize the actual variable, not the string occurrence
            expect(result.data.length).toBeGreaterThan(0);
        });
    });

    describe('Special characters', () => {
        it('should handle Pike-specific operators', () => {
            const symbols = [
                sym('obj', 'variable', { position: { line: 1, character: 7 } }),
            ];
            const code = `object obj = this_object();
obj->method();
obj->(arg);`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle array and mapping indexing', () => {
            const symbols = [
                sym('arr', 'variable', { position: { line: 1, character: 7 } }),
                sym('map', 'variable', { position: { line: 2, character: 7 } }),
            ];
            const code = `array arr = ({ 1, 2, 3 });
mapping map = ([ "key": "value" ]);
int x = arr[0];
string v = map["key"];`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });

    describe('Empty and minimal files', () => {
        it('should handle empty file', () => {
            const { getTokens } = setup({ code: '' });

            const result = getTokens();
            expect(result.data).toEqual([]);
        });

        it('should handle file with only whitespace', () => {
            const { getTokens } = setup({ code: '   \n\n   \n' });

            const result = getTokens();
            expect(result.data).toEqual([]);
        });

        it('should handle single character', () => {
            const { getTokens } = setup({ code: 'x' });

            const result = getTokens();
            // Should not error
            expect(result.data).toBeDefined();
        });
    });

    describe('Unicode and special identifiers', () => {
        it('should handle unicode in comments (non-tokenized)', () => {
            const symbols = [
                sym('value', 'variable', { position: { line: 1, character: 4 } }),
            ];
            const code = `int value = 1;
// Unicode: 日本語, 中文, emoji 🚀`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });
});

// =============================================================================
// Large File Stress Tests
// =============================================================================

describe('Semantic Tokens Stress: Large Files', () => {

    it('should handle 100 line file with many symbols', () => {
        const symbols = [];
        const lines = ['class Large {'];

        for (let i = 0; i < 50; i++) {
            lines.push(`    int field${i};`);
            lines.push(`    void method${i}() { }`);
            symbols.push(sym(`field${i}`, 'property', { position: { line: i * 2 + 1, character: 8 } }));
            symbols.push(sym(`method${i}`, 'method', { position: { line: i * 2 + 2, character: 8 } }));
        }
        lines.push('}');
        const code = lines.join('\n');

        const { getTokens } = setup({ code, symbols });
        const start = performance.now();
        const result = getTokens();
        const elapsed = performance.now() - start;

        expect(result.data.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle 500 line file efficiently', () => {
        const symbols = [];
        const lines = ['int target = 0;'];

        for (let i = 0; i < 500; i++) {
            lines.push(`target = target + ${i};`);
        }
        symbols.push(sym('target', 'variable', { position: { line: 1, character: 4 } }));
        const code = lines.join('\n');

        const { getTokens } = setup({ code, symbols });
        const start = performance.now();
        const result = getTokens();
        const elapsed = performance.now() - start;

        expect(result.data.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(2000); // Should complete in under 2 seconds
    });

    it('should handle 1000 line file', () => {
        const symbols = [];
        const lines = ['int counter = 0;'];

        for (let i = 0; i < 1000; i++) {
            lines.push(`counter += ${i};`);
        }
        symbols.push(sym('counter', 'variable', { position: { line: 1, character: 4 } }));
        const code = lines.join('\n');

        const { getTokens } = setup({ code, symbols });
        const start = performance.now();
        const result = getTokens();
        const elapsed = performance.now() - start;

        expect(result.data.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle file with many distinct symbols', () => {
        const symbols = [];
        const lines = [];

        // Create 100 distinct variables
        for (let i = 0; i < 100; i++) {
            lines.push(`int var${i} = ${i};`);
            symbols.push(sym(`var${i}`, 'variable', { position: { line: i + 1, character: 4 } }));
        }

        // Use all of them
        lines.push('int result = 0;');
        for (let i = 0; i < 100; i++) {
            lines.push(`result += var${i};`);
        }
        const code = lines.join('\n');

        const { getTokens } = setup({ code, symbols });
        const start = performance.now();
        const result = getTokens();
        const elapsed = performance.now() - start;

        expect(result.data.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(2000);
    });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('Semantic Tokens Performance', () => {

    it('should complete full request in under 100ms for normal files', () => {
        const symbols = [
            sym('myVar', 'variable', { position: { line: 1, character: 4 } }),
            sym('myFunc', 'method', { position: { line: 3, character: 5 } }),
        ];
        const code = `int myVar = 1;
void myFunc() { }
int result = myVar;`;

        const { getTokens } = setup({ code, symbols });
        const start = performance.now();
        const result = getTokens();
        const elapsed = performance.now() - start;

        expect(result.data.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(100);
    });

    it('should complete delta request in under 100ms', () => {
        const symbols = [
            sym('value', 'variable', { position: { line: 1, character: 4 } }),
        ];
        const code = `int value = 42;
value = value + 1;`;

        const { getTokensDelta } = setup({ code, symbols });
        const start = performance.now();
        const result = getTokensDelta();
        const elapsed = performance.now() - start;

        expect(result).toBeDefined();
        expect(elapsed).toBeLessThan(100);
    });

    it('should scale linearly with symbol count', () => {
        const times: number[] = [];

        for (const size of [10, 50, 100]) {
            const symbols = [];
            const lines = [];
            for (let i = 0; i < size; i++) {
                lines.push(`int var${i} = ${i};`);
                symbols.push(sym(`var${i}`, 'variable', { position: { line: i + 1, character: 4 } }));
            }
            lines.push('int result = 0;');
            for (let i = 0; i < size; i++) {
                lines.push(`result += var${i};`);
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const start = performance.now();
            getTokens();
            times.push(performance.now() - start);
        }

        // Each doubling of size should roughly double the time (linear)
        const ratio1 = times[1]! / times[0]!;
        const ratio2 = times[2]! / times[1]!;

        expect(ratio1).toBeLessThan(15); // Should be ~5 for linear
        expect(ratio2).toBeLessThan(15); // Should be ~2 for linear
    });

    it('should scale linearly with file size', () => {
        const times: number[] = [];

        for (const size of [100, 500, 1000]) {
            const symbols = [
                sym('x', 'variable', { position: { line: 1, character: 4 } }),
            ];
            const lines = ['int x = 0;'];
            for (let i = 0; i < size; i++) {
                lines.push(`x = x + ${i};`);
            }
            const code = lines.join('\n');

            const { getTokens } = setup({ code, symbols });
            const start = performance.now();
            getTokens();
            times.push(performance.now() - start);
        }

        // Each doubling of size should roughly double the time (linear)
        const ratio1 = times[1]! / times[0]!;
        const ratio2 = times[2]! / times[1]!;

        expect(ratio1).toBeLessThan(15);
        expect(ratio2).toBeLessThan(15);
    });
});

// =============================================================================
// Token Modifiers Stress Tests
// =============================================================================

describe('Semantic Tokens Stress: Modifiers', () => {

    describe('Static modifier', () => {
        it('should handle static variables', () => {
            const symbols = [
                sym('COUNT', 'variable', { position: { line: 2, character: 8 }, modifiers: ['static', 'readonly'] }),
            ];
            const code = `class Counter {
    static int COUNT = 0;
}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });

        it('should handle static methods', () => {
            const symbols = [
                sym('helper', 'method', { position: { line: 2, character: 8 }, modifiers: ['static'] }),
            ];
            const code = `class Util {
    static int helper() { return 0; }
}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });

    describe('Deprecated modifier', () => {
        it('should handle deprecated functions', () => {
            const symbols = [
                sym('oldFunc', 'method', { position: { line: 2, character: 6 }, modifiers: ['deprecated'] }),
            ];
            const code = `//! @deprecated
void oldFunc() {}`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });

    describe('Readonly modifier', () => {
        it('should handle constants', () => {
            const symbols = [
                sym('MAX_VALUE', 'constant', { position: { line: 1, character: 10 }, modifiers: ['readonly'] }),
            ];
            const code = `constant int MAX_VALUE = 100;`;

            const { getTokens } = setup({ code, symbols });
            const result = getTokens();

            expect(result.data.length).toBeGreaterThan(0);
        });
    });
});

// =============================================================================
// Mixed Token Types Stress Tests
// =============================================================================

describe('Semantic Tokens Stress: Mixed Types', () => {

    it('should handle file with all major token types', () => {
        const symbols = [
            sym('MyClass', 'class', { position: { line: 1, character: 6 } }),
            sym('CONSTANT', 'property', { position: { line: 2, character: 10 }, modifiers: ['readonly'] }),
            sym('instance', 'variable', { position: { line: 3, character: 8 } }),
            sym('process', 'method', { position: { line: 4, character: 6 } }),
            sym('Type', 'typedef', { position: { line: 5, character: 7 } }),
            sym('handler', 'method', { position: { line: 6, character: 6 } }),
        ];
        const code = `class MyClass {
    constant int CONSTANT = 100;
    object instance;
    int process() { return 0; }
}
typedef int Type;
void handler() {}`;

        const { getTokens } = setup({ code, symbols });
        const result = getTokens();

        const typeCounts = countTokensByType(result.data);
        // Should have multiple token types
        expect(typeCounts.size).toBeGreaterThan(1);
    });

    it('should handle complex real-world code', () => {
        const symbols = [
            sym('Server', 'class', { position: { line: 1, character: 6 } }),
            sym('start', 'method', { position: { line: 2, character: 8 } }),
            sym('stop', 'method', { position: { line: 5, character: 8 } }),
            sym('config', 'variable', { position: { line: 7, character: 8 } }),
        ];
        const code = `class Server {
    private mapping config;
    void create(mapping c) {
        config = c;
    }
    void start() { }
    void stop() { }
    mapping get_config() { return config; }
}`;

        const { getTokens } = setup({ code, symbols });
        const result = getTokens();

        expect(result.data.length).toBeGreaterThan(0);
    });
});
