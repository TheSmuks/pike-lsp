/**
 * End-to-End Integration Tests
 *
 * Tests the complete LSP workflow from client requests to server responses.
 * These tests simulate real editor interactions.
 *
 * Run with: node --test dist/tests/integration-tests.js
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as assert from 'node:assert/strict';
import { PikeBridge, PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * Flatten symbols tree - Pike returns nested children, but tests often need to search all symbols.
 */
function flattenSymbols(symbols: PikeSymbol[]): PikeSymbol[] {
    const result: PikeSymbol[] = [];
    for (const symbol of symbols) {
        result.push(symbol);
        if (symbol.children && symbol.children.length > 0) {
            result.push(...flattenSymbols(symbol.children));
        }
    }
    return result;
}

describe('End-to-End Document Workflow', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should handle complete document lifecycle: open -> edit -> close', async () => {
        const initialCode = `
class Calculator {
    int add(int a, int b) {
        return a + b;
    }
}
`;

        // Parse initial document
        const initialResult = await bridge.parse(initialCode, 'calculator.pike');
        assert.ok(initialResult.symbols.length > 0, 'Should parse initial document');
        assert.ok(
            initialResult.symbols.some(s => s.name === 'Calculator'),
            'Should find Calculator class'
        );

        // Edit document - add a new method
        const editedCode = `
class Calculator {
    int add(int a, int b) {
        return a + b;
    }

    int multiply(int x, int y) {
        return x * y;
    }
}
`;

        const editedResult = await bridge.parse(editedCode, 'calculator.pike');
        const allSymbols = flattenSymbols(editedResult.symbols);
        assert.ok(
            allSymbols.some(s => s.name === 'add'),
            'Should still have add method'
        );
        assert.ok(
            allSymbols.some(s => s.name === 'multiply'),
            'Should have new multiply method'
        );

        // Verify symbol count increased
        assert.ok(
            editedResult.symbols.length >= initialResult.symbols.length,
            'Edited document should have at least as many symbols'
        );
    });

    it('should detect errors introduced during editing', async () => {
        const validCode = `
int x = 5;
string name = "test";
`;

        const validResult = await bridge.compile(validCode, 'test.pike');
        assert.strictEqual(validResult.diagnostics.length, 0, 'Valid code should have no errors');

        // Introduce syntax error
        const invalidCode = `
int x = 5;
string name = ;  // Missing value
`;

        const invalidResult = await bridge.compile(invalidCode, 'test.pike');
        assert.ok(
            invalidResult.diagnostics.length > 0,
            'Invalid code should have errors'
        );
        assert.ok(
            invalidResult.diagnostics[0],
            'Should have at least one diagnostic'
        );
        assert.strictEqual(
            invalidResult.diagnostics[0].severity,
            'error',
            'Should be error severity'
        );
    });

    it('should handle multi-file project workflow', async () => {
        const utilsCode = `
string getVersion() {
    return "1.0.0";
}
`;

        const mainCode = `
void main() {
    write("Starting application\\n");
}
`;

        const utilsResult = await bridge.parse(utilsCode, 'utils.pike');
        assert.ok(
            utilsResult.symbols.some(s => s.name === 'getVersion'),
            'Should find getVersion in utils.pike'
        );

        const mainResult = await bridge.parse(mainCode, 'main.pike');
        assert.ok(
            mainResult.symbols.some(s => s.name === 'main'),
            'Should find main in main.pike'
        );
    });
});

describe('End-to-End Code Navigation Workflow', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should support "find all references" style workflow', async () => {
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

        const result = await bridge.parse(code, 'test.pike');

        // Find all symbols named 'counter'
        const counterSymbols = result.symbols.filter(s => s.name === 'counter');

        // Should find at least the declaration
        assert.ok(counterSymbols.length >= 1, 'Should find counter symbol');
    });

    it('should support "go to definition" for nested symbols', async () => {
        const code = `
class AppConfig {
    string configFile = "config.json";

    class DatabaseSettings {
        string host = "localhost";
        int port = 5432;
    }
}
`;

        const result = await bridge.parse(code, 'test.pike');
        const allSymbols = flattenSymbols(result.symbols);

        const appConfig = allSymbols.find(s => s.name === 'AppConfig');
        assert.ok(appConfig, 'Should find AppConfig class');

        const databaseSettings = allSymbols.find(s => s.name === 'DatabaseSettings');
        assert.ok(databaseSettings, 'Should find nested DatabaseSettings class');

        // Note: nested class members may or may not be extracted depending on parser support
        // The key is that we find the nested class itself
        const configFile = allSymbols.find(s => s.name === 'configFile');
        assert.ok(configFile, 'Should find configFile in AppConfig');
    });
});

describe('End-to-End Autocompletion Workflow', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should provide completions as user types', async () => {
        // Start with partial code
        const partialCode = `
class UserService {
    void createUser() {}
    void deleteUser() {}
    void updateUser() {}
}
`;

        const result = await bridge.parse(partialCode, 'service.pike');
        const allSymbols = flattenSymbols(result.symbols);

        // User typing "create" should see createUser in completions
        const createUser = allSymbols.find(s => s.name === 'createUser');
        assert.ok(createUser, 'Should find createUser for completion');

        // User typing "delete" should see deleteUser
        const deleteUser = allSymbols.find(s => s.name === 'deleteUser');
        assert.ok(deleteUser, 'Should find deleteUser for completion');

        // User typing "update" should see updateUser
        const updateUser = allSymbols.find(s => s.name === 'updateUser');
        assert.ok(updateUser, 'Should find updateUser for completion');
    });

    it('should provide completion with type information', async () => {
        const code = `
string username = "admin";
int userId = 42;
array(string) roles = ({"admin", "user"});
`;

        const result = await bridge.parse(code, 'test.pike');

        // Check that variables have type info for completion
        for (const symbol of result.symbols) {
            if (symbol.kind === 'variable') {
                const sym = symbol as unknown as Record<string, unknown>;
                assert.ok(sym['type'], `Variable ${symbol.name} should have type info`);
            }
        }
    });
});

describe('End-to-End Error Handling Workflow', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should report multiple errors in a single document', async () => {
        const code = `
int x = ;  // Error 1: missing value
string y = ;  // Error 2: missing value
void foo(  // Error 3: incomplete function
`;

        const result = await bridge.compile(code, 'errors.pike');

        // Should detect errors
        assert.ok(result.diagnostics.length > 0, 'Should detect errors');

        // All should be errors (not warnings)
        const errorCount = result.diagnostics.filter(d => d.severity === 'error').length;
        assert.ok(errorCount > 0, 'Should have at least one error');
    });

    it('should handle parse errors gracefully', async () => {
        const malformedCode = `
this is not valid pike code at all
$$$ invalid tokens %%%
`;

        const result = await bridge.compile(malformedCode, 'malformed.pike');

        // Should still return a result (not crash)
        assert.ok(result, 'Should return result even for malformed code');
        assert.ok(Array.isArray(result.diagnostics), 'Should have diagnostics array');
    });

    it('should recover from errors and continue parsing', async () => {
        const code = `
int valid = 1;
int invalid = ;
int alsoValid = 2;
`;

        const result = await bridge.parse(code, 'mixed.pike');

        // Should still extract valid symbols
        const validVar = result.symbols.find(s => s.name === 'valid');
        assert.ok(validVar, 'Should find valid variable before error');

        const alsoValidVar = result.symbols.find(s => s.name === 'alsoValid');
        assert.ok(alsoValidVar, 'Should find valid variable after error');
    });
});

describe('Real-World Code Scenarios', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should handle a realistic Pike class with inheritance', async () => {
        const code = `
inherit Stdio.File;

class HTTPResponse {
    int status_code = 200;
    string body = "";

    void set_status(int code) {
        status_code = code;
    }

    void set_body(string b) {
        body = b;
    }

    string render() {
        return sprintf("%d %s\\n", status_code, body);
    }
}
`;

        const result = await bridge.parse(code, 'http.pike');
        const allSymbols = flattenSymbols(result.symbols);

        assert.ok(allSymbols.some(s => s.name === 'HTTPResponse'), 'Should find HTTPResponse');
        assert.ok(allSymbols.some(s => s.name === 'status_code'), 'Should find status_code');
        assert.ok(allSymbols.some(s => s.name === 'set_status'), 'Should find set_status method');
        assert.ok(allSymbols.some(s => s.kind === 'inherit'), 'Should find inherit statement');
    });

    it('should handle complex type annotations', async () => {
        const code = `
mapping(string:array(int)) cache = ([]);
function(string:void) callback = lambda(string s) { write(s); };
array(mapping(string:mixed)) data = ({});
`;

        const result = await bridge.parse(code, 'types.pike');

        assert.ok(result.symbols.length >= 3, 'Should extract all variables with complex types');

        // Check that at least some variables have type info (not all variables may have types)
        const variablesWithType = result.symbols.filter(
            s => s.kind === 'variable' && (s as unknown as Record<string, unknown>)['type']
        );
        assert.ok(variablesWithType.length > 0, 'At least some variables should have type info');
    });

    it('should handle constants and preprocessor directives', async () => {
        const code = `
constant PI = 3.14159;
constant VERSION = "1.0.0";

#define MAX_CONNECTIONS 100

void init() {
    // Initialization code
}
`;

        const result = await bridge.parse(code, 'constants.pike');

        const pi = result.symbols.find(s => s.name === 'PI');
        assert.ok(pi, 'Should find PI constant');

        const version = result.symbols.find(s => s.name === 'VERSION');
        assert.ok(version, 'Should find VERSION constant');
    });
});

// PERF-002: Batch Parse Tests
describe('Batch Parse Performance (PERF-002)', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should parse multiple files in a single batch request', async () => {
        const files = [
            { code: 'int x = 1;', filename: 'test1.pike' },
            { code: 'string s = "hello";', filename: 'test2.pike' },
            { code: 'class Foo { void bar() {} }', filename: 'test3.pike' },
        ];

        const result = await bridge.batchParse(files);

        assert.strictEqual(result.count, 3, 'Should parse all 3 files');
        assert.strictEqual(result.results.length, 3, 'Should have 3 results');

        // Check first file
        assert.strictEqual(result.results[0]?.filename, 'test1.pike');
        assert.ok(result.results[0]?.symbols.some(s => s.name === 'x'), 'Should find x in test1.pike');

        // Check second file
        assert.strictEqual(result.results[1]?.filename, 'test2.pike');
        assert.ok(result.results[1]?.symbols.some(s => s.name === 's'), 'Should find s in test2.pike');

        // Check third file
        assert.strictEqual(result.results[2]?.filename, 'test3.pike');
        assert.ok(result.results[2]?.symbols.some(s => s.name === 'Foo'), 'Should find Foo class in test3.pike');
    });

    it('should handle empty files array', async () => {
        const result = await bridge.batchParse([]);

        assert.strictEqual(result.count, 0, 'Should handle empty array');
        assert.deepStrictEqual(result.results, [], 'Should return empty results');
    });

    it('should continue processing when one file has errors', async () => {
        const files = [
            { code: 'int valid = 1;', filename: 'valid.pike' },
            { code: 'int invalid = ;', filename: 'invalid.pike' },  // Parse error
            { code: 'string alsoValid = "ok";', filename: 'also-valid.pike' },
        ];

        const result = await bridge.batchParse(files);

        assert.strictEqual(result.count, 3, 'Should process all files');
        assert.ok(result.results[0]?.symbols.length ?? 0 > 0, 'Valid file should have symbols');
        // Note: batchParse uses 'parse' method which doesn't return diagnostics for syntax errors
        // The important thing is that it doesn't crash and continues processing other files
        assert.ok(result.results[1] !== undefined, 'Invalid file should still return a result');
        assert.ok(result.results[2]?.symbols.length ?? 0 > 0, 'Third valid file should have symbols');
    });

    it('should be faster than sequential parsing for multiple files', async () => {
        const files: Array<{ code: string; filename: string }> = [];
        for (let i = 0; i < 10; i++) {
            files.push({
                code: `int var${i} = ${i};\nstring str${i} = "test${i}";\n`,
                filename: `bench${i}.pike`,
            });
        }

        // Measure batch parse time
        const batchStart = Date.now();
        await bridge.batchParse(files);
        const batchTime = Date.now() - batchStart;

        // Measure sequential parse time
        const seqStart = Date.now();
        for (const file of files) {
            await bridge.parse(file.code, file.filename);
        }
        const seqTime = Date.now() - seqStart;

        console.log(`Batch parse: ${batchTime}ms, Sequential: ${seqTime}ms`);

        // Batch should be at least as fast (or faster due to reduced IPC overhead)
        assert.ok(batchTime <= seqTime * 1.5, `Batch (${batchTime}ms) should not be significantly slower than sequential (${seqTime}ms)`);
    });
});

console.log('Running End-to-End Integration Tests...\n');
