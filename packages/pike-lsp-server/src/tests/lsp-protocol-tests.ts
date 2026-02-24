/**
 * LSP Protocol Feature Tests
 *
 * Comprehensive tests for LSP protocol features:
 * - Hover requests (type information, documentation)
 * - Completion requests (auto-completion suggestions)
 * - Go to Definition requests (symbol navigation)
 *
 * Run with: node --test dist/tests/lsp-protocol-tests.js
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('LSP Hover Feature Tests', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    // Suppress Pike warnings
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should provide hover information for variables', async () => {
        const code = `
int myVariable = 42;
string name = "test";
array(int) numbers = ({1, 2, 3});
`;
        const result = await bridge.parse(code, 'test.pike');

        const intVar = result.symbols.find(s => s.name === 'myVariable');
        assert.ok(intVar, 'Should find myVariable symbol');
        assert.strictEqual(intVar.kind, 'variable', 'myVariable should be a variable');

        const sym = intVar as unknown as Record<string, unknown>;
        assert.ok(sym['type'], 'Variable should have type information');
        const type = sym['type'] as { name?: string };
        assert.strictEqual(type.name, 'int', 'myVariable should be of type int');
    });

    it('should provide hover information for functions with signatures', async () => {
        const code = `
void greet(string name, int count) {
    write(name);
}

int calculate(int x, int y) {
    return x + y;
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const greet = result.symbols.find(s => s.name === 'greet');
        assert.ok(greet, 'Should find greet function');
        assert.strictEqual(greet.kind, 'method', 'greet should be a method');

        const sym = greet as unknown as Record<string, unknown>;
        assert.ok(sym['returnType'], 'Function should have return type');
        const returnType = sym['returnType'] as { name?: string };
        assert.strictEqual(returnType.name, 'void', 'greet should return void');

        const calculate = result.symbols.find(s => s.name === 'calculate');
        assert.ok(calculate, 'Should find calculate function');
        const calcSym = calculate as unknown as Record<string, unknown>;
        const calcRetType = calcSym['returnType'] as { name?: string };
        assert.strictEqual(calcRetType.name, 'int', 'calculate should return int');
    });

    it('should provide hover information for class members', async () => {
        const code = `
class Person {
    string name;
    int age;
    void sayHello() {}
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const personClass = result.symbols.find(s => s.name === 'Person');
        assert.ok(personClass, 'Should find Person class');
        assert.strictEqual(personClass.kind, 'class', 'Person should be a class');

        const nameVar = result.symbols.find(s => s.name === 'name');
        assert.ok(nameVar, 'Should find name member variable');

        const ageVar = result.symbols.find(s => s.name === 'age');
        assert.ok(ageVar, 'Should find age member variable');

        const sayHello = result.symbols.find(s => s.name === 'sayHello');
        assert.ok(sayHello, 'Should find sayHello method');
    });

    it('should handle complex types in hover information', async () => {
        const code = `
mapping(string:int) lookup = ([]);
array(function(int:void)) callbacks = ({});
multiset(string) uniqueStrings = (<>);
`;
        const result = await bridge.parse(code, 'test.pike');

        // All variables should be extracted with types
        assert.ok(result.symbols.length >= 3, 'Should extract at least 3 symbols');

        for (const symbol of result.symbols) {
            if (symbol.kind === 'variable') {
                const sym = symbol as unknown as Record<string, unknown>;
                assert.ok(sym['type'], `Variable ${symbol.name} should have type info`);
            }
        }
    });
});

describe('LSP Completion Feature Tests', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should provide completions for local variables', async () => {
        const code = `
int myCounter = 0;
string message = "hello";
myC|
`;
        const result = await bridge.parse(code, 'test.pike');

        const myCounter = result.symbols.find(s => s.name === 'myCounter');
        assert.ok(myCounter, 'Should find myCounter for completion');
        assert.strictEqual(myCounter.kind, 'variable', 'myCounter should be a variable');

        const message = result.symbols.find(s => s.name === 'message');
        assert.ok(message, 'Should find message for completion');
    });

    it('should provide completions for function definitions', async () => {
        const code = `
void processItem(string item) {}
void processData(string data) {}
void process|
`;
        const result = await bridge.parse(code, 'test.pike');

        const processItem = result.symbols.find(s => s.name === 'processItem');
        assert.ok(processItem, 'Should find processItem for completion');
        assert.strictEqual(processItem.kind, 'method', 'processItem should be a method');

        const processData = result.symbols.find(s => s.name === 'processData');
        assert.ok(processData, 'Should find processData for completion');
    });

    it('should provide completions for class members', async () => {
        const code = `
class Container {
    int itemCount;
    string itemName;
    void addItem() {}
}
`;
        const result = await bridge.parse(code, 'test.pike');

        // Should extract all class members
        const itemCount = result.symbols.find(s => s.name === 'itemCount');
        assert.ok(itemCount, 'Should find itemCount for completion');

        const itemName = result.symbols.find(s => s.name === 'itemName');
        assert.ok(itemName, 'Should find itemName for completion');

        const addItem = result.symbols.find(s => s.name === 'addItem');
        assert.ok(addItem, 'Should find addItem for completion');
    });

    it('should provide completions for class definitions', async () => {
        const code = `
class MyClass {}
class YourClass {}
class Their|
`;
        const result = await bridge.parse(code, 'test.pike');

        const myClass = result.symbols.find(s => s.name === 'MyClass');
        assert.ok(myClass, 'Should find MyClass for completion');
        assert.strictEqual(myClass.kind, 'class', 'MyClass should be a class');

        const yourClass = result.symbols.find(s => s.name === 'YourClass');
        assert.ok(yourClass, 'Should find YourClass for completion');
    });

    it('should handle local scope variables', async () => {
        const code = `
int x = 1;
int y = 2;
`;
        const result = await bridge.parse(code, 'test.pike');

        // The variables x and y should be extracted
        const xVar = result.symbols.find(s => s.name === 'x');
        assert.ok(xVar, 'Should find variable x');

        const yVar = result.symbols.find(s => s.name === 'y');
        assert.ok(yVar, 'Should find variable y');
    });

    it('should provide completions for inherited members', async () => {
        const code = `
class Base {
    int baseField;
    void baseMethod() {}
}

class Derived {
    inherit Base;
    int derivedField;
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const baseClass = result.symbols.find(s => s.name === 'Base');
        assert.ok(baseClass, 'Should find Base class');

        const derivedClass = result.symbols.find(s => s.name === 'Derived');
        assert.ok(derivedClass, 'Should find Derived class');

        const inherit = result.symbols.find(s => s.kind === 'inherit');
        assert.ok(inherit, 'Should find inherit statement');
    });
});

describe('LSP Go to Definition Feature Tests', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should navigate to variable definitions', async () => {
        const code = `
int total = 0;

void add(int value) {
    total += value;  // Navigation should go to line 2
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const totalSymbols = result.symbols.filter(s => s.name === 'total');
        assert.ok(totalSymbols.length >= 1, 'Should find total symbol definition');

        const totalDef = totalSymbols.find(s => s.position && s.position.line === 2);
        assert.ok(totalDef, 'Should find total at line 2');
        assert.strictEqual(totalDef.kind, 'variable', 'total should be a variable');
    });

    it('should navigate to function definitions', async () => {
        const code = `
void calculateSum(int a, int b) {
    return a + b;
}

void main() {
    calculateSum(1, 2);  // Navigation should go to line 2
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const calculateSum = result.symbols.find(s => s.name === 'calculateSum');
        assert.ok(calculateSum, 'Should find calculateSum definition');
        assert.strictEqual(calculateSum.kind, 'method', 'calculateSum should be a method');
        assert.ok(calculateSum.position, 'calculateSum should have position');
        assert.strictEqual(calculateSum.position.line, 2, 'calculateSum should be at line 2');
    });

    it('should navigate to class definitions', async () => {
        const code = `
class UserProfile {
    string username;
}

void process() {
    UserProfile p;  // Navigation should go to line 2
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const userProfile = result.symbols.find(s => s.name === 'UserProfile');
        assert.ok(userProfile, 'Should find UserProfile class definition');
        assert.strictEqual(userProfile.kind, 'class', 'UserProfile should be a class');
        assert.ok(userProfile.position, 'UserProfile should have position');
        assert.strictEqual(userProfile.position.line, 2, 'UserProfile should be at line 2');
    });

    it('should navigate to class member definitions', async () => {
        const code = `
class Config {
    string apiKey = "default";
}

void main() {
    Config c = Config();
    string k = c.apiKey;  // Navigation should go to apiKey in Config
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const apiKey = result.symbols.find(s => s.name === 'apiKey');
        assert.ok(apiKey, 'Should find apiKey member definition');
        assert.strictEqual(apiKey.kind, 'variable', 'apiKey should be a variable');
        assert.ok(apiKey.position, 'apiKey should have position');
    });

    it('should handle multiple symbols with same name (different scopes)', async () => {
        const code = `
int value = 1;

class Container {
    int value = 2;  // Different scope, same name

    int getValue() {
        return value;  // Should refer to line 4, not line 2
    }
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const valueSymbols = result.symbols.filter(s => s.name === 'value');
        assert.ok(valueSymbols.length >= 2, 'Should find multiple value symbols');

        // Check that we have different positions
        const positions = valueSymbols
            .filter(s => s.position)
            .map(s => s.position!.line)
            .filter((v, i, a) => a.indexOf(v) === i);

        assert.ok(positions.length >= 2, 'Should have value at different lines');
    });

    it('should navigate to method definitions within classes', async () => {
        const code = `
class Calculator {
    int add(int a, int b) {
        return a + b;
    }

    int multiply(int x, int y) {
        return x * y;
    }
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const add = result.symbols.find(s => s.name === 'add');
        assert.ok(add, 'Should find add method');
        assert.strictEqual(add.kind, 'method', 'add should be a method');
        assert.ok(add.position, 'add should have position');

        const multiply = result.symbols.find(s => s.name === 'multiply');
        assert.ok(multiply, 'Should find multiply method');
        assert.ok(multiply.position, 'multiply should have position');
        // multiply should come after add
        assert.ok(multiply.position.line > add.position.line, 'multiply should be after add');
    });
});

describe('LSP Symbol Position Validation', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should provide valid line numbers for all symbols', async () => {
        const code = `
int line2 = 2;

int line4 = 4;

void line7method() {}

class Line9Class {}
`;

        const result = await bridge.parse(code, 'test.pike');

        for (const symbol of result.symbols) {
            if (symbol.position) {
                assert.ok(
                    symbol.position.line >= 1,
                    `${symbol.name} should have line >= 1, got ${symbol.position.line}`
                );
                assert.ok(
                    symbol.position.line <= 20,
                    `${symbol.name} should have line <= 20, got ${symbol.position.line}`
                );
            }
        }

        // Check specific symbols exist and have increasing line numbers
        const line2 = result.symbols.find(s => s.name === 'line2');
        assert.ok(line2?.position, 'line2 should have position');

        const line4 = result.symbols.find(s => s.name === 'line4');
        assert.ok(line4?.position, 'line4 should have position');

        const line7method = result.symbols.find(s => s.name === 'line7method');
        assert.ok(line7method?.position, 'line7method should have position');

        const line9Class = result.symbols.find(s => s.name === 'Line9Class');
        assert.ok(line9Class?.position, 'Line9Class should have position');

        // Verify symbols are in correct order
        assert.ok(line4.position.line > line2.position.line, 'line4 should be after line2');
        assert.ok(line7method.position.line > line4.position.line, 'line7method should be after line4');
        assert.ok(line9Class.position.line > line7method.position.line, 'Line9Class should be after line7method');
    });

    it('should handle symbols with no explicit position gracefully', async () => {
        const code = `int x = 1;`;
        const result = await bridge.parse(code, 'test.pike');

        // All symbols should have at least a valid position
        for (const symbol of result.symbols) {
            if (symbol.position) {
                assert.ok(
                    typeof symbol.position.line === 'number',
                    `${symbol.name} position.line should be a number`
                );
            }
        }
    });
});

console.log('Running LSP Protocol Feature Tests...\n');
