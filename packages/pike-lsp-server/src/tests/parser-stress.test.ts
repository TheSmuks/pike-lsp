/**
 * Parser Stress Tests - Control Flow and Incomplete Code
 *
 * Stress tests for the Pike parser to ensure LSP handles edge cases gracefully.
 * Tests incomplete statements, unclosed blocks, and malformed code.
 *
 * Run with: bun test dist/src/tests/parser-stress-tests.js
 */

import { describe, it } from 'bun:test';
import * as assert from 'node:assert';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Parser Stress Tests: Control Flow and Incomplete Code', () => {
    let bridge: PikeBridge;

    it('should handle incomplete if statement', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int test() {
    if (x
}
`, 'incomplete_if.pike');

        // Should not crash, should return some result
        assert.ok(result, 'Parse result should exist');
        // Incomplete code may or may not have symbols depending on parser state
        assert.ok(result.diagnostics !== undefined, 'Diagnostics should be defined');

        await bridge.stop();
    });

    it('should handle incomplete if-else statement', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int test() {
    if (condition)
        do_something();
    else
}
`, 'incomplete_if_else.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle incomplete while statement', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void process() {
    while (items
}
`, 'incomplete_while.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle incomplete for statement', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void loop() {
    for (int i = 0; i < 10; i
}
`, 'incomplete_for.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle unclosed function', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int my_function(int x, string
`, 'unclosed_function.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle unclosed class', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
class MyClass {
    int value;
    void method()
`, 'unclosed_class.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle missing semicolons', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void test() {
    int x = 5
    int y = 10
    string s = "hello"
}
`, 'missing_semicolons.pike');

        assert.ok(result, 'Parse result should exist');
        // Parser may report diagnostics for missing semicolons

        await bridge.stop();
    });

    it('should handle incomplete switch case', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void process(int x) {
    switch (x) {
        case 1:
            do_one();
        case 2:
    }
}
`, 'incomplete_switch.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle incomplete match case (Pike 7.8+)', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void process(mixed x) {
    match (x) {
        case 1:
            return "one";
        case
    }
}
`, 'incomplete_match.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle control flow with errors', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void complex() {
    foreach (items
        if (x > 0
            break;
    while (condition
}
`, 'control_flow_errors.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle multiple unclosed blocks', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
class Outer {
    class Inner {
        void method() {
            if (a
        }
    void another()
}
`, 'multiple_unclosed.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle empty function body', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int empty() {
}
`, 'empty_body.pike');

        assert.ok(result, 'Parse result should exist');
        // Empty function body is valid Pike

        await bridge.stop();
    });

    it('should handle unclosed array literal', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
array(int) get_numbers() {
    return ({ 1, 2, 3
}
`, 'unclosed_array.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle unclosed mapping literal', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
mapping(string:int) get_map() {
    return ([ "a": 1, "b":
}
`, 'unclosed_mapping.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle ternary with incomplete condition', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
mixed test() {
    return condition ? :
}
`, 'incomplete_ternary.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle inline efun without closing parenthesis', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void test() {
    write("hello"
}
`, 'unclosed_efun.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle incomplete inherit statement', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
class MyClass {
    inherit SomeModule
}
`, 'incomplete_inherit.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle stray tokens', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void test() {
    int x = 5;
}
else
`, 'stray_tokens.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle deeply nested incomplete blocks', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
void test() {
    if (a) {
        if (b) {
            if (c
}
`, 'nested_incomplete.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle incomplete lambda', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
function get_callback() {
    return lambda
}
`, 'incomplete_lambda.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });
});

describe('Parser Stress Tests: Graceful Degradation', () => {
    let bridge: PikeBridge;

    it('should not crash on highly malformed code', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        // This should not throw an exception
        const result = await bridge.parse(`
@@#@#@#@#@#@#
!!!INVALID!!!
{{[<(>)]}}
class } int void inherit
`, 'highly_malformed.pike');

        assert.ok(result, 'Parse result should exist even for highly malformed code');
        assert.ok(result.diagnostics !== undefined, 'Diagnostics should be defined');

        await bridge.stop();
    });

    it('should handle very long lines gracefully', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const longLine = 'int x = ' + '1,'.repeat(1000);
        const result = await bridge.parse(longLine, 'long_line.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle many nested parentheses', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const deepParens = 'int x = ' + '('.repeat(100) + '1' + ')'.repeat(100);
        const result = await bridge.parse(deepParens, 'deep_parens.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });

    it('should handle code with only whitespace and newlines', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`




`, 'whitespace_only.pike');

        assert.ok(result, 'Parse result should exist');

        await bridge.stop();
    });
});
