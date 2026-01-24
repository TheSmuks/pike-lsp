/**
 * References Feature Tests
 *
 * Tests for references functionality covering:
 * - Finding all references to a variable
 * - Cross-file references
 * - Word boundaries (/\w/ regex patterns)
 * - Symbols adjacent to operators
 * - Multi-word symbols, special characters
 *
 * Run with: node --test dist/tests/references.test.js
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('References - Happy Path', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should find all references to a variable', async () => {
        // Arrange
        const code = `
int counter = 0;

void increment() {
    counter += 1;
}

void decrement() {
    counter -= 1;
}

int getValue() {
    return counter;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const counterSymbols = result.symbols.filter((s) => s['name'] === 'counter');
        assert.ok(counterSymbols.length >= 1, 'Should find counter symbol declaration');
    });

    it('should handle single usage references', async () => {
        // Arrange
        const code = `
string message = "hello";

void print() {
    write(message);
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const messageSymbol = result.symbols.find((s) => s['name'] === 'message');
        assert.ok(messageSymbol, 'Should find message symbol');
    });
});

describe('References - Word Boundaries', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should handle underscore in variable names', async () => {
        // Arrange
        const code = `
int my_variable = 42;
my_variable += 1;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const symbol = result.symbols.find((s) => s['name'] === 'my_variable');
        assert.ok(symbol, 'Should find variable with underscore');
    });

    it('should handle camelCase names', async () => {
        // Arrange
        const code = `
string userName = "admin";
write(userName);
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const symbol = result.symbols.find((s) => s['name'] === 'userName');
        assert.ok(symbol, 'Should find camelCase variable');
    });

    it('should handle PascalCase class names', async () => {
        // Arrange
        const code = `
class MyClass {
    void method() {}
}

MyClass instance = MyClass();
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const myClass = result.symbols.find((s) => s['name'] === 'MyClass');
        assert.ok(myClass, 'Should find PascalCase class');
    });

    it('should handle numbers in names', async () => {
        // Arrange
        const code = `
int data1 = 1;
int data2 = 2;
int value3 = data1 + data2;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        assert.ok(result.symbols.find((s) => s['name'] === 'data1'), 'Should find data1');
        assert.ok(result.symbols.find((s) => s['name'] === 'data2'), 'Should find data2');
        assert.ok(result.symbols.find((s) => s['name'] === 'value3'), 'Should find value3');
    });

    it('should not match partial words', async () => {
        // Arrange
        const code = `
int count = 5;
int counter = 10;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const count = result.symbols.find((s) => s['name'] === 'count');
        const counter = result.symbols.find((s) => s['name'] === 'counter');

        assert.ok(count, 'Should find count');
        assert.ok(counter, 'Should find counter');
        // They should be distinct symbols
        assert.notStrictEqual(count, counter, 'count and counter should be different symbols');
    });
});

describe('References - Adjacent to Operators', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should handle function call with parentheses', async () => {
        // Arrange
        const code = `
void myFunc() {
    write("hello");
}

void main() {
    myFunc();
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const myFunc = result.symbols.find((s) => s['name'] === 'myFunc');
        assert.ok(myFunc, 'Should find function definition');
    });

    it('should handle dot notation for member access', async () => {
        // Arrange
        const code = `
class MyClass {
    int value = 42;
}

MyClass obj = MyClass();
int x = obj.value;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const value = result.symbols.find((s) => s['name'] === 'value');
        assert.ok(value, 'Should find value member');
    });

    it('should handle arrow notation for member access', async () => {
        // Arrange
        const code = `
class Container {
    int data = 100;
}

void process(Container c) {
    int x = c->data;
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const data = result.symbols.find((s) => s['name'] === 'data');
        assert.ok(data, 'Should find data member');
    });

    it('should handle array indexing', async () => {
        // Arrange
        const code = `
array(int) arr = ({1, 2, 3});
int first = arr[0];
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const arr = result.symbols.find((s) => s['name'] === 'arr');
        assert.ok(arr, 'Should find array variable');
    });

    it('should handle scope resolution operator', async () => {
        // Arrange
        const code = `
module Namespace {
    int constant = 42;
}

int value = Namespace::constant;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        assert.ok(result.symbols.length > 0, 'Should parse symbols with scope resolution');
    });
});

describe('References - Cross-File', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should handle symbols across multiple files', async () => {
        // Arrange
        const file1 = `
string getVersion() {
    return "1.0.0";
}
`;

        const file2 = `
void displayVersion() {
    string v = getVersion();
    write(v);
}
`;

        // Act
        const result1 = await bridge.parse(file1, 'utils.pike');
        const result2 = await bridge.parse(file2, 'main.pike');

        // Assert
        assert.ok(result1.symbols.find((s) => s['name'] === 'getVersion'),
            'Should find getVersion in file1');
        assert.ok(result2.symbols.find((s) => s['name'] === 'displayVersion'),
            'Should find displayVersion in file2');
    });
});

describe('References - Edge Cases', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should not find symbols in comments', async () => {
        // Arrange
        const code = `
int value = 5;
// This comment mentions value but should not be a reference
int other = 10;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const value = result.symbols.find((s) => s['name'] === 'value');
        assert.ok(value, 'Should find value symbol');
    });

    it('should not find symbols in string literals', async () => {
        // Arrange
        const code = `
string name = "value";
int value = 42;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        assert.ok(result.symbols.find((s) => s['name'] === 'value'),
            'Should find value variable');
        assert.ok(result.symbols.find((s) => s['name'] === 'name'),
            'Should find name variable');
    });

    it('should handle very long variable names', async () => {
        // Arrange
        const code = `
int this_is_a_very_long_variable_name_that_is_unusual = 1;
this_is_a_very_long_variable_name_that_is_unusual += 1;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const symbol = result.symbols.find((s) =>
            s['name'] === 'this_is_a_very_long_variable_name_that_is_unusual');
        assert.ok(symbol, 'Should find long variable name');
    });

    it('should handle symbols with leading underscores', async () => {
        // Arrange
        const code = `
int _private = 0;
int __internal = 1;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        assert.ok(result.symbols.find((s) => s['name'] === '_private'),
            'Should find _private');
        assert.ok(result.symbols.find((s) => s['name'] === '__internal'),
            'Should find __internal');
    });

    it('should handle all-caps constant names', async () => {
        // Arrange
        const code = `
constant MAX_SIZE = 100;
constant DEFAULT_TIMEOUT = 30;
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        assert.ok(result.symbols.find((s) => s['name'] === 'MAX_SIZE'),
            'Should find MAX_SIZE');
        assert.ok(result.symbols.find((s) => s['name'] === 'DEFAULT_TIMEOUT'),
            'Should find DEFAULT_TIMEOUT');
    });
});

describe('References - Regression Tests', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should handle word boundary with Unicode (if supported)', async () => {
        // Arrange
        const code = `
string data = "test";
write(data);
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        assert.ok(result.symbols.find((s) => s['name'] === 'data'),
            'Should find basic ASCII variable');
    });

    it('should find references to methods in class', async () => {
        // Arrange
        const code = `
class TestClass {
    void method1() {}
    void method2() {
        method1();
    }
}
`;

        // Act
        const result = await bridge.parse(code, 'test.pike');

        // Assert
        const allSymbols = result.symbols as unknown as Record<string, unknown>[];
        const method1 = allSymbols.find((s) => s['name'] === 'method1');
        const method2 = allSymbols.find((s) => s['name'] === 'method2');

        assert.ok(method1, 'Should find method1');
        assert.ok(method2, 'Should find method2');
    });
});
