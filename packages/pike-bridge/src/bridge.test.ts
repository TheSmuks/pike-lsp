/**
 * Pike Bridge Tests
 *
 * Tests the core IPC communication with Pike subprocess
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

describe('PikeBridge', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        const available = await bridge.checkPike();
        if (!available) {
            throw new Error('Pike executable not found. Tests require Pike to be installed.');
        }
        await bridge.start();
    });

    after(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    it('should start and be running', () => {
        assert.equal(bridge.isRunning(), true, 'Bridge should be running after start()');
    });

    it('should check Pike availability', async () => {
        const available = await bridge.checkPike();
        assert.equal(available, true, 'Pike should be available');
    });

    it('should get Pike version', async () => {
        const version = await bridge.getVersion();
        assert.ok(version, 'Should return a version string');
        assert.match(version!, /\d+\.\d+/, 'Version should match pattern X.Y');
    });

    it('should parse simple Pike code', async () => {
        const code = `
            int x = 42;
            string hello() {
                return "world";
            }
            class MyClass {
                int value;
            }
        `;

        const result = await bridge.parse(code, 'test.pike');

        assert.ok(result.symbols, 'Should return symbols');
        assert.ok(Array.isArray(result.symbols), 'Symbols should be an array');
        assert.ok(result.symbols.length > 0, 'Should find at least one symbol');

        const varSymbol = result.symbols.find(s => s.name === 'x');
        assert.ok(varSymbol, 'Should find variable "x"');
        assert.equal(varSymbol?.kind, 'variable');

        const funcSymbol = result.symbols.find(s => s.name === 'hello');
        assert.ok(funcSymbol, 'Should find function "hello"');
        assert.equal(funcSymbol?.kind, 'method');

        const classSymbol = result.symbols.find(s => s.name === 'MyClass');
        assert.ok(classSymbol, 'Should find class "MyClass"');
        assert.equal(classSymbol?.kind, 'class');
    });

    it('should detect syntax errors', async () => {
        const code = `
            int x = ;  // Syntax error
        `;

        const result = await bridge.compile(code, 'test.pike');

        assert.ok(result.diagnostics, 'Should return diagnostics');
        assert.ok(Array.isArray(result.diagnostics), 'Diagnostics should be an array');
        assert.ok(result.diagnostics.length > 0, 'Should find at least one error');
    });

    it('should tokenize Pike code', async () => {
        const code = `int x = 42;`;

        const tokens = await bridge.tokenize(code);

        assert.ok(Array.isArray(tokens), 'Should return an array of tokens');
        assert.ok(tokens.length > 0, 'Should find at least one token');
    });

    it('should resolve stdlib modules', async () => {
        const result = await bridge.resolveStdlib('Regexp');

        assert.ok(result, 'Should return a result');
        assert.equal(result.found, 1, 'Should find Regexp module (1 = found)');
        assert.ok(result.symbols, 'Should have symbols');
        assert.ok(Array.isArray(result.symbols), 'Symbols should be an array');
    });

    it('should handle non-existent stdlib modules', async () => {
        const result = await bridge.resolveStdlib('NonExistentModule12345');

        assert.ok(result, 'Should return a result');
        assert.equal(result.found, 0, 'Should not find non-existent module (0 = not found)');
    });

    it('should deduplicate concurrent identical requests', async () => {
        const code = `int x = 42;`;

        // Send 3 identical requests concurrently
        const [result1, result2, result3] = await Promise.all([
            bridge.parse(code, 'test.pike'),
            bridge.parse(code, 'test.pike'),
            bridge.parse(code, 'test.pike'),
        ]);

        // All should return the same results
        assert.deepEqual(result1, result2, 'Results should be identical');
        assert.deepEqual(result2, result3, 'Results should be identical');
    });

    it('should resolve local modules with currentFile context', async () => {
        const modulePath = '.SHA256';
        const currentFile = '/tmp/project/RSA.pmod';

        // This will fail if the file doesn't exist, but tests the API
        const result = await bridge.resolveModule(modulePath, currentFile);

        // Result could be null if file doesn't exist, but should not throw
        assert.ok(result === null || typeof result === 'string',
            'Result should be null or a string path');
    });

    // Uninitialized variable detection tests
    describe('analyzeUninitialized', () => {
        it('should detect uninitialized string variable', async () => {
            const code = `
void test() {
    string s;
    write(s);
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            assert.ok(result.diagnostics, 'Should return diagnostics');
            assert.ok(Array.isArray(result.diagnostics), 'Diagnostics should be an array');
            assert.ok(result.diagnostics.length > 0, 'Should find uninitialized variable warning');

            const diag = result.diagnostics.find(d => d.variable === 's');
            assert.ok(diag, 'Should find diagnostic for variable "s"');
            assert.ok(diag.message.includes('initialized'), 'Message should mention initialization');
        });

        it('should not warn for initialized variables', async () => {
            const code = `
void test() {
    string s = "hello";
    write(s);
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            const diag = result.diagnostics.find(d => d.variable === 's');
            assert.ok(!diag, 'Should not warn for initialized variable');
        });

        it('should not warn for int variables (auto-initialized to 0)', async () => {
            const code = `
void test() {
    int x;
    write(x);
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            const diag = result.diagnostics.find(d => d.variable === 'x');
            assert.ok(!diag, 'Should not warn for int (auto-initialized to 0)');
        });

        it('should not warn for float variables (auto-initialized to 0.0)', async () => {
            const code = `
void test() {
    float f;
    write(f);
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            const diag = result.diagnostics.find(d => d.variable === 'f');
            assert.ok(!diag, 'Should not warn for float (auto-initialized to 0.0)');
        });

        it('should detect uninitialized mapping', async () => {
            const code = `
void test() {
    mapping m;
    m["key"] = "value";
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            assert.ok(result.diagnostics.length > 0, 'Should find uninitialized mapping warning');
        });

        it('should detect uninitialized array', async () => {
            const code = `
void test() {
    array a;
    a[0] = 1;
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            assert.ok(result.diagnostics.length > 0, 'Should find uninitialized array warning');
        });

        it('should not warn for function parameters', async () => {
            const code = `
void test(string s) {
    write(s);
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            const diag = result.diagnostics.find(d => d.variable === 's');
            assert.ok(!diag, 'Should not warn for function parameters');
        });

        it('should not warn for lambda parameters', async () => {
            const code = `
void test() {
    Array.sort_array(({}), lambda(string a, string b) {
        return sizeof(a) > sizeof(b);
    });
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            const diagA = result.diagnostics.find(d => d.variable === 'a');
            const diagB = result.diagnostics.find(d => d.variable === 'b');
            assert.ok(!diagA && !diagB, 'Should not warn for lambda parameters');
        });

        it.skip('should detect conditional initialization (maybe_init)', async () => {
            // TODO: Implement branch-aware control flow analysis
            const code = `
void test(int condition) {
    string s;
    if (condition) {
        s = "hello";
    }
    write(s);
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            // Should warn because s is only initialized in one branch
            assert.ok(result.diagnostics.length > 0, 'Should warn for conditionally initialized variable');
        });

        it('should not warn when initialized in all branches', async () => {
            const code = `
void test(int condition) {
    string s;
    if (condition) {
        s = "hello";
    } else {
        s = "world";
    }
    write(s);
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            // Should not warn because s is initialized in all branches
            const diag = result.diagnostics.find(d => d.variable === 's');
            assert.ok(!diag, 'Should not warn when variable is initialized in all branches');
        });

        it('should not warn for foreach loop variables', async () => {
            const code = `
void test() {
    array items = ({ 1, 2, 3 });
    foreach (items, mixed item) {
        write(item);
    }
}
`;
            const result = await bridge.analyzeUninitialized(code, 'test.pike');

            const diag = result.diagnostics.find(d => d.variable === 'item');
            assert.ok(!diag, 'Should not warn for foreach loop variables');
        });
    });
});
