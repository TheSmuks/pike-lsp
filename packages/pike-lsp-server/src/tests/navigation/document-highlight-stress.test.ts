/**
 * Stress Tests for Document Highlights
 *
 * Comprehensive stress testing for document highlight provider covering:
 * - Variable highlighting
 * - Function highlighting
 * - Class highlighting
 * - Edge cases: shadowing, multiple occurrences, large files
 *
 * These tests verify the document highlight provider handles various Pike constructs
 * correctly under stress conditions.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { DocumentHighlightKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { registerReferencesHandlers } from '../../features/navigation/references.js';
import {
    createMockConnection,
    createMockDocuments,
    createMockServices,
    makeCacheEntry,
    type MockConnection,
} from '../helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';

// =============================================================================
// Test Infrastructure
// =============================================================================

interface SetupOptions {
    code: string;
    uri?: string;
    symbols?: PikeSymbol[];
    symbolPositions?: Map<string, { line: number; character: number }[]>;
    noCache?: boolean;
    noDocument?: boolean;
    extraDocs?: Map<string, TextDocument>;
    extraCacheEntries?: Map<string, DocumentCacheEntry>;
}

function setup(opts: SetupOptions) {
    const uri = opts.uri ?? 'file:///test.pike';
    const doc = TextDocument.create(uri, 'pike', 1, opts.code);

    const docsMap = new Map<string, TextDocument>();
    if (!opts.noDocument) {
        docsMap.set(uri, doc);
    }
    if (opts.extraDocs) {
        for (const [u, d] of opts.extraDocs) {
            docsMap.set(u, d);
        }
    }

    const cacheEntries = opts.extraCacheEntries ?? new Map<string, DocumentCacheEntry>();
    if (!opts.noCache) {
        cacheEntries.set(uri, makeCacheEntry({
            symbols: opts.symbols ?? [],
            symbolPositions: opts.symbolPositions ?? new Map(),
        }));
    }

    const services = createMockServices({ cacheEntries });
    const documents = createMockDocuments(docsMap);
    const conn = createMockConnection();

    registerReferencesHandlers(conn as any, services as any, documents as any);

    return {
        highlight: (line: number, character: number) =>
            conn.documentHighlightHandler({
                textDocument: { uri },
                position: { line, character },
            }),
        uri,
        doc,
    };
}

// =============================================================================
// Variable Highlighting Stress Tests
// =============================================================================

describe('Document Highlight Stress: Variables', () => {

    describe('Multiple variable declarations', () => {
        it('should highlight all occurrences of simple variable', async () => {
            const code = `int counter = 0;
counter++;
counter = counter + 1;
write("Count: %d\\n", counter);
int x = counter * 2;`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "counter"

            expect(result).not.toBeNull();
            expect(result!.length).toBe(6); // 6 occurrences of "counter" (including in string)
        });

        it('should highlight variables with underscores', async () => {
            const code = `int my_variable = 1;
my_variable = my_variable + 1;
int temp_var = my_variable;
write("%d\\n", my_variable);`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "my_variable"

            expect(result).not.toBeNull();
            expect(result!.length).toBe(5); // 5 occurrences (including in string)
        });

        it('should handle variables with numeric suffix', async () => {
            const code = `int var1 = 1;
int var2 = 2;
int var10 = 10;
write("%d %d %d\\n", var1, var2, var10);`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 4); // cursor on "var1"

            expect(result).not.toBeNull();
            expect(result!.length).toBe(2); // var1 at line 0 and line 3

            // var2 should be separate
            const result2 = await highlight(1, 4);
            expect(result2).not.toBeNull();
            expect(result2!.length).toBe(2);
        });
    });

    describe('Variable shadowing', () => {
        it('should highlight shadowed variables across scopes', async () => {
            // Document highlight is text-based, doesn't understand scope
            const code = `int val = 1;
void func() {
    int val = 2;
    write("%d\\n", val);
}
write("%d\\n", val);`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 4); // cursor on first "val"

            expect(result).not.toBeNull();
            // Text search finds all 4 occurrences
            expect(result!.length).toBe(4);
        });

        it('should highlight inner shadowed variable', async () => {
            const code = `int value = 10;
void inner() {
    int value = 20;
    write("%d\\n", value);
}`;

            const { highlight } = setup({ code });
            // Cursor on inner "value" at line 2
            const result = await highlight(2, 9);

            expect(result).not.toBeNull();
            // Text-based: finds all 3 occurrences
            expect(result!.length).toBe(3);
        });
    });

    describe('High occurrence counts', () => {
        it('should handle 50+ occurrences', async () => {
            const lines = ['int target = 0;'];
            for (let i = 0; i < 50; i++) {
                lines.push(`target = target + ${i};`);
            }
            const code = lines.join('\n');

            const { highlight } = setup({ code });
            const result = await highlight(0, 5);

            expect(result).not.toBeNull();
            // 1 declaration + 50 lines with 2 occurrences each = 101 occurrences
            expect(result!.length).toBe(101);
        });

        it('should handle 100+ occurrences', async () => {
            const lines = ['int item = 0;'];
            for (let i = 0; i < 100; i++) {
                lines.push(`item += ${i};`);
            }
            const code = lines.join('\n');

            const { highlight } = setup({ code });
            const result = await highlight(0, 5);

            expect(result).not.toBeNull();
            // 1 declaration + 100 usages = 101 occurrences
            expect(result!.length).toBe(101);
        });
    });
});

// =============================================================================
// Function Highlighting Stress Tests
// =============================================================================

describe('Document Highlight Stress: Functions', () => {

    describe('Function declarations and calls', () => {
        it('should highlight simple function', async () => {
            const code = `void myFunction() { }
myFunction();
myFunction();
int x = myFunction() ? 1 : 0;`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 6); // cursor on "myFunction"

            expect(result).not.toBeNull();
            expect(result!.length).toBe(4);
        });

        it('should highlight function with arguments', async () => {
            const code = `int processData(int x, int y) {
    return x + y;
}
int a = processData(1, 2);
int b = processData(a, 3);
write("%d\\n", processData(a, b));`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "processData"

            expect(result).not.toBeNull();
            expect(result!.length).toBe(4);
        });

        it('should highlight recursive function', async () => {
            const code = `int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
int x = factorial(5);`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "factorial"

            expect(result).not.toBeNull();
            // 3 occurrences: declaration, recursive call, call site
            expect(result!.length).toBe(3);
        });
    });

    describe('Multiple functions', () => {
        it('should highlight specific function without mixing', async () => {
            const code = `void foo() { }
void bar() { }
foo();
bar();
foo();
bar();`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "foo"

            expect(result).not.toBeNull();
            expect(result!.length).toBe(3); // foo at lines 0, 2, 4

            const result2 = await highlight(1, 5); // cursor on "bar"
            expect(result2).not.toBeNull();
            expect(result2!.length).toBe(3); // bar at lines 1, 3, 5
        });
    });

    describe('Function with many calls', () => {
        it('should handle 50+ function calls', async () => {
            const lines = ['void process() { }'];
            for (let i = 0; i < 50; i++) {
                lines.push(`process();`);
            }
            const code = lines.join('\n');

            const { highlight } = setup({ code });
            const result = await highlight(0, 5);

            expect(result).not.toBeNull();
            expect(result!.length).toBe(51); // 1 def + 50 calls
        });
    });
});

// =============================================================================
// Class Highlighting Stress Tests
// =============================================================================

describe('Document Highlight Stress: Classes', () => {

    describe('Class declaration and usage', () => {
        it('should highlight simple class', async () => {
            const code = `class MyClass {
    int value;
    void create(int v) { value = v; }
}
MyClass obj = MyClass();
obj->create(42);
write("%d\\n", obj->value);`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 7); // cursor on "MyClass"

            expect(result).not.toBeNull();
            // MyClass at line 0 (class), line 3 (constructor), line 4 (type)
            expect(result!.length).toBe(3);
        });

        it('should highlight class with inheritance', async () => {
            const code = `class Base {
    void method() { }
}
class Derived {
    inherit Base;
    void method() { }
}
Base b = Base();
Derived d = Derived();
b->method();
d->method();`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 7); // cursor on "Base"

            expect(result).not.toBeNull();
            // Base at: line 0 (def), line 3 (inherit), line 5 (type), line 7 (call)
            expect(result!.length).toBe(4);
        });
    });

    describe('Class method highlighting', () => {
        it('should highlight class method', async () => {
            const code = `class Handler {
    void handle(int x) {
        handle(x + 1);
    }
}
Handler h = Handler();
h->handle(10);`;

            const { highlight } = setup({ code });
            // Cursor on "handle" inside class (line 1)
            const result = await highlight(1, 9);

            expect(result).not.toBeNull();
            // 3 occurrences: method def, recursive call, call site
            expect(result!.length).toBe(3);
        });

        it('should handle multiple class instances', async () => {
            const code = `class Counter {
    int count;
    void inc() { count++; }
    void reset() { count = 0; }
}
Counter a = Counter();
Counter b = Counter();
a->inc();
b->inc();
a->reset();
b->reset();`;

            const { highlight } = setup({ code });
            const result = await highlight(2, 9); // cursor on "inc"

            expect(result).not.toBeNull();
            // inc at: line 2 (def), line 6 (call), line 7 (call)
            expect(result!.length).toBe(3);
        });
    });
});

// =============================================================================
// Edge Cases Stress Tests
// =============================================================================

describe('Document Highlight Stress: Edge Cases', () => {

    describe('Word boundary handling', () => {
        it('should not match partial words', async () => {
            const code = `int myValue = 1;
int myValueExtra = 2;
write("%d\\n", myValue);`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "myValue"

            expect(result).not.toBeNull();
            // Should only match "myValue" not "myValueExtra"
            expect(result!.length).toBe(2);
        });

        it('should handle similar prefixes', async () => {
            const code = `int process = 1;
int processed = 2;
int processing = 3;
process = processed + processing;`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "process"

            expect(result).not.toBeNull();
            // Only "process" at lines 0 and 4
            expect(result!.length).toBe(2);
        });
    });

    describe('Special characters in code', () => {
        it('should handle strings containing variable name', async () => {
            const code = `int value = 42;
write("The value is: " + value + "\\n");
string s = "value";`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "value"

            expect(result).not.toBeNull();
            // Text-based search: finds value at line 0, 1, and also in string at line 2
            expect(result!.length).toBe(4);
        });

        it('should handle comments', async () => {
            const code = `int target = 1;
// target is used here
target = target + 1; // target comment`;

            const { highlight } = setup({ code });
            const result = await highlight(0, 5); // cursor on "target"

            expect(result).not.toBeNull();
            // Text-based: finds target in all places including comments (5 occurrences)
            expect(result!.length).toBe(5);
        });
    });

    describe('Empty and whitespace', () => {
        it('should return null for empty cursor position', async () => {
            const code = `int x = 1;

int y = 2;`;

            const { highlight } = setup({ code });
            // Cursor on empty line
            const result = await highlight(1, 0);

            expect(result).toBeNull();
        });

        it('should return null for single character word', async () => {
            const code = `int x = 1;
x = 2;`;

            const { highlight } = setup({ code });
            // "x" is only 1 character
            const result = await highlight(0, 4);

            expect(result).toBeNull();
        });
    });

    describe('Large files', () => {
        it('should handle 500 line file efficiently', async () => {
            const lines = ['int target = 0;'];
            for (let i = 0; i < 500; i++) {
                lines.push(`target = target + ${i};`);
            }
            const code = lines.join('\n');

            const { highlight } = setup({ code });
            const start = performance.now();
            const result = await highlight(0, 5);
            const elapsed = performance.now() - start;

            expect(result).not.toBeNull();
            // 1 declaration + 500 lines with 2 occurrences each = 1001
            expect(result!.length).toBe(1001);
            expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
        });

        it('should handle 1000 line file', async () => {
            const lines = ['int counter = 0;'];
            for (let i = 0; i < 1000; i++) {
                lines.push(`counter += ${i};`);
            }
            const code = lines.join('\n');

            const { highlight } = setup({ code });
            const start = performance.now();
            const result = await highlight(0, 5);
            const elapsed = performance.now() - start;

            expect(result).not.toBeNull();
            expect(result!.length).toBe(1001);
            expect(elapsed).toBeLessThan(2000); // Should complete in under 2 seconds
        });
    });

    describe('Multiple symbols on same line', () => {
        it('should highlight multiple variables across lines', async () => {
            const code = `int foo = 1;
int bar = 2;
int baz = 3;
foo = bar + baz;
bar = foo + baz;
baz = foo + bar;`;

            const { highlight } = setup({ code });

            // Highlight "foo" - cursor at position 4 (right after "foo ")
            const resultA = await highlight(0, 4);
            expect(resultA).not.toBeNull();
            expect(resultA!.length).toBe(4); // foo at lines 0, 3, 4, 5

            // Highlight "bar" - cursor at position 4
            const resultB = await highlight(1, 4);
            expect(resultB).not.toBeNull();
            expect(resultB!.length).toBe(4); // bar at lines 1, 3, 4, 5

            // Highlight "baz" - cursor at position 4
            const resultC = await highlight(2, 4);
            expect(resultC).not.toBeNull();
            expect(resultC!.length).toBe(4); // baz at lines 2, 3, 4, 5
        });

        it('should handle function and variable with same name pattern', async () => {
            const code = `void test() { }
int test = 1;
test();
write("%d\\n", test);`;

            const { highlight } = setup({ code });

            // Cursor on "test" function - text-based search finds all "test" occurrences
            const funcResult = await highlight(0, 5);
            expect(funcResult).not.toBeNull();
            // Text-based: finds all 4 occurrences of "test"
            expect(funcResult!.length).toBe(4);
        });
    });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('Document Highlight Performance', () => {

    it('should complete highlight request in under 100ms for normal files', async () => {
        const code = `int myVar = 1;
myVar = myVar + 1;
myVar *= 2;
write("%d\\n", myVar);
for (int i = 0; i < 10; i++) {
    myVar += i;
}`;

        const { highlight } = setup({ code });
        const start = performance.now();
        const result = await highlight(0, 5);
        const elapsed = performance.now() - start;

        expect(result).not.toBeNull();
        expect(elapsed).toBeLessThan(100);
    });

    it('should scale linearly with file size', async () => {
        // Test with different sizes and verify linear scaling
        const sizes = [100, 500, 1000];
        const times: number[] = [];

        for (const size of sizes) {
            const lines = ['int x = 0;'];
            for (let i = 0; i < size; i++) {
                lines.push(`x = x + ${i};`);
            }
            const code = lines.join('\n');

            const { highlight } = setup({ code });
            const start = performance.now();
            await highlight(0, 5);
            times.push(performance.now() - start);
        }

        // Each doubling of size should roughly double the time (linear)
        // Allow some variance, but should be significantly less than quadratic
        const ratio1 = times[1]! / times[0]!;
        const ratio2 = times[2]! / times[1]!;

        expect(ratio1).toBeLessThan(10); // Should be ~5 for linear
        expect(ratio2).toBeLessThan(10); // Should be ~2 for linear
    });
});
