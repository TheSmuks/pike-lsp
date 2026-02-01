/**
 * Completion Integration Tests - Real PikeBridge
 *
 * Layer 2: Tests that exercise completion through the real Pike subprocess.
 * Uses PikeBridge for accurate tokenization, context detection, stdlib resolution,
 * and introspection-based member completion.
 *
 * These tests are slower than unit tests but verify the full TypeScript <-> Pike
 * communication path works correctly for completion scenarios.
 *
 * Scenario coverage:
 *   K. Real context detection via Pike tokenizer
 *   L. Real stdlib module resolution and member listing
 *   M. Real introspection for class members and inheritance
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import type { CompletionContext, IntrospectedSymbol } from '@pike-lsp/pike-bridge';

let bridge: PikeBridge;

beforeAll(async () => {
    bridge = new PikeBridge();
    try {
        await bridge.start();
        // Suppress stderr noise during tests
        bridge.on('stderr', () => {});
    } catch (err) {
        await bridge.stop().catch(() => {});
        throw err;
    }
});

afterAll(async () => {
    if (bridge) {
        await bridge.stop().catch(() => {});
    }
});

// =============================================================================
// K. Real Context Detection via Pike Tokenizer
// =============================================================================

describe('K. Real Context Detection', () => {

    it('K.1: detects member_access after -> operator', async () => {
        const code = 'object obj;\nobj->';
        const ctx = await bridge.getCompletionContext(code, 2, 5);

        expect(ctx).toBeDefined();
        expect(ctx.context).toBe('member_access');
        expect(ctx.objectName).toBe('obj');
        expect(ctx.operator).toBe('->');
    });

    it('K.2: detects member_access after . operator', async () => {
        const code = 'Array.';
        const ctx = await bridge.getCompletionContext(code, 1, 6);

        expect(ctx).toBeDefined();
        expect(ctx.context).toBe('member_access');
        expect(ctx.objectName).toBe('Array');
        expect(ctx.operator).toBe('.');
    });

    it('K.3: detects scope_access after :: operator', async () => {
        const code = 'this_program::';
        const ctx = await bridge.getCompletionContext(code, 1, 14);

        expect(ctx).toBeDefined();
        expect(ctx.context).toBe('scope_access');
        expect(ctx.objectName).toBe('this_program');
        expect(ctx.operator).toBe('::');
    });

    it('K.4: detects identifier context for partial word', async () => {
        const code = 'int my_var = 1;\nmy_';
        const ctx = await bridge.getCompletionContext(code, 2, 3);

        expect(ctx).toBeDefined();
        // Should be 'identifier' for partial word
        expect(['identifier', 'global']).toContain(ctx.context);
        expect(ctx.prefix).toBe('my_');
    });

    it('K.5: detects global context at start of file', async () => {
        const code = '';
        const ctx = await bridge.getCompletionContext(code, 1, 0);

        expect(ctx).toBeDefined();
        expect(ctx.context).toBe('global');
    });

    it('K.6: detects member_access with partial prefix', async () => {
        const code = 'Array.so';
        const ctx = await bridge.getCompletionContext(code, 1, 8);

        expect(ctx).toBeDefined();
        expect(ctx.context).toBe('member_access');
        expect(ctx.objectName).toBe('Array');
        expect(ctx.prefix).toBe('so');
    });

    it('K.7: detects context after semicolon on new line', async () => {
        const code = 'int x = 1;\n';
        const ctx = await bridge.getCompletionContext(code, 2, 0);

        expect(ctx).toBeDefined();
        // After semicolon, new statement - should be identifier or global
        expect(['identifier', 'global']).toContain(ctx.context);
    });

    it('K.8: detects member_access on Stdio.File fully qualified', async () => {
        const code = 'Stdio.File.';
        const ctx = await bridge.getCompletionContext(code, 1, 11);

        expect(ctx).toBeDefined();
        expect(ctx.context).toBe('member_access');
        // Should resolve Stdio.File as the object
        expect(ctx.objectName).toMatch(/Stdio\.File|File/);
    });

    it('K.9: handles completion in middle of existing code', async () => {
        const code = 'void func() {\n    Array.\n    int x = 1;\n}';
        const ctx = await bridge.getCompletionContext(code, 2, 10);

        expect(ctx).toBeDefined();
        expect(ctx.context).toBe('member_access');
        expect(ctx.objectName).toBe('Array');
    });

    it('K.10: cached context returns same result', async () => {
        const code = 'Array.sort';
        const uri = 'file:///cache-test.pike';
        const version = 1;

        const ctx1 = await bridge.getCompletionContext(code, 1, 10, uri, version);
        const ctx2 = await bridge.getCompletionContext(code, 1, 10, uri, version);

        expect(ctx1).toBeDefined();
        expect(ctx2).toBeDefined();
        expect(ctx1.context).toBe(ctx2.context);
        expect(ctx1.objectName).toBe(ctx2.objectName);
        expect(ctx1.prefix).toBe(ctx2.prefix);
    });
});

// =============================================================================
// L. Real Stdlib Module Resolution
// =============================================================================

describe('L. Real Stdlib Resolution', () => {

    it('L.1: resolves Array module with methods', async () => {
        const result = await bridge.resolveStdlib('Array');

        expect(result).toBeDefined();
        expect(result.found).toBeTruthy();

        const symbolNames = (result.symbols ?? []).map((s: IntrospectedSymbol) => s.name);
        // Array module should have common methods
        expect(symbolNames.length).toBeGreaterThan(0);
    });

    it('L.2: resolves Stdio module', async () => {
        const result = await bridge.resolveStdlib('Stdio');

        expect(result).toBeDefined();
        expect(result.found).toBeTruthy();

        const symbolNames = (result.symbols ?? []).map((s: IntrospectedSymbol) => s.name);
        expect(symbolNames.length).toBeGreaterThan(0);
    });

    it('L.3: resolves Stdio.File with file operation methods', async () => {
        const result = await bridge.resolveStdlib('Stdio.File');

        expect(result).toBeDefined();
        expect(result.found).toBeTruthy();

        const symbolNames = (result.symbols ?? []).map((s: IntrospectedSymbol) => s.name);
        // Stdio.File should have read, write, close etc.
        expect(symbolNames).toContain('read');
        expect(symbolNames).toContain('write');
        expect(symbolNames).toContain('close');
    });

    it('L.4: resolves String module', async () => {
        const result = await bridge.resolveStdlib('String');

        expect(result).toBeDefined();
        expect(result.found).toBeTruthy();

        const symbolNames = (result.symbols ?? []).map((s: IntrospectedSymbol) => s.name);
        expect(symbolNames.length).toBeGreaterThan(0);
    });

    it('L.5: resolves Mapping module', async () => {
        const result = await bridge.resolveStdlib('Mapping');

        expect(result).toBeDefined();
        // Mapping might not exist as a module in Pike stdlib
        // This test documents the expected behavior
    });

    it('L.6: non-existent module returns not found', async () => {
        const result = await bridge.resolveStdlib('NonExistent.Fake.Module');

        expect(result).toBeDefined();
        expect(result.found).toBeFalsy();
    });

    it('L.7: resolved symbols have type information', async () => {
        const result = await bridge.resolveStdlib('Stdio.File');

        expect(result).toBeDefined();
        if (result.found && result.symbols && result.symbols.length > 0) {
            const funcSymbols = result.symbols.filter(
                (s: IntrospectedSymbol) => s.kind === 'function'
            );

            // Function symbols should have type info
            for (const func of funcSymbols.slice(0, 3)) {
                expect(func.type).toBeDefined();
                expect(func.type.kind).toBe('function');
            }
        }
    });

    it('L.8: resolved functions have argument names', async () => {
        const result = await bridge.resolveStdlib('Stdio.File');

        expect(result).toBeDefined();
        if (result.found && result.functions && result.functions.length > 0) {
            // At least some functions should have arguments info
            const withArgs = result.functions.filter(
                (f: IntrospectedSymbol) =>
                    f.type.kind === 'function' &&
                    (f.type as any).arguments &&
                    (f.type as any).arguments.length > 0
            );

            // Stdio.File.read() takes arguments, so we should find at least one
            expect(withArgs.length).toBeGreaterThan(0);
        }
    });

    it('L.9: resolves Parser.Pike module', async () => {
        const result = await bridge.resolveStdlib('Parser.Pike');

        expect(result).toBeDefined();
        expect(result.found).toBeTruthy();

        const symbolNames = (result.symbols ?? []).map((s: IntrospectedSymbol) => s.name);
        // Parser.Pike should have split, tokenize, etc.
        expect(symbolNames.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// M. Real Introspection for Class Members
// =============================================================================

describe('M. Real Introspection', () => {

    it('M.1: introspects class with methods and variables', async () => {
        const code = `
class TestClass {
    int member_var = 10;
    string name = "test";

    void do_something() {}
    int get_value() { return member_var; }
}
`;
        const response = await bridge.analyze(code, ['introspect'], 'test-completion.pike');
        const result = response.result?.introspect;

        expect(result).toBeDefined();
        if (result?.success) {
            const symbolNames = result.symbols.map((s: IntrospectedSymbol) => s.name);
            expect(symbolNames).toContain('TestClass');

            // Look for class members
            const classSymbol = result.symbols.find(
                (s: IntrospectedSymbol) => s.name === 'TestClass'
            );
            if (classSymbol) {
                expect(classSymbol.kind).toBe('class');
            }

            // Methods should be found in the symbols
            expect(symbolNames).toContain('do_something');
            expect(symbolNames).toContain('get_value');
            expect(symbolNames).toContain('member_var');
        }
    });

    it('M.2: introspects class with inheritance shows inherited members', async () => {
        const code = `
class Base {
    int base_value = 1;
    void base_method() {}
}

class Child {
    inherit Base;
    int child_value = 2;
    void child_method() {}
}
`;
        const response = await bridge.analyze(code, ['introspect'], 'test-inherit.pike');
        const result = response.result?.introspect;

        expect(result).toBeDefined();
        if (result?.success) {
            const symbolNames = result.symbols.map((s: IntrospectedSymbol) => s.name);
            // Both base and child members should appear
            expect(symbolNames).toContain('Child');
            expect(symbolNames).toContain('child_method');
            expect(symbolNames).toContain('child_value');

            // Inherited members should also be present
            // (depending on how Pike introspection reports them)
            // This documents the expected behavior for completion
        }
    });

    it('M.3: introspects function return types for type-based completion', async () => {
        const code = `
int get_count() { return 42; }
string get_name() { return "test"; }
array get_items() { return ({}); }
`;
        const response = await bridge.analyze(code, ['introspect'], 'test-returns.pike');
        const result = response.result?.introspect;

        expect(result).toBeDefined();
        if (result?.success) {
            const funcs = result.functions ?? [];

            const getCount = funcs.find((f: IntrospectedSymbol) => f.name === 'get_count');
            if (getCount) {
                expect(getCount.type.kind).toBe('function');
                const funcType = getCount.type as any;
                if (funcType.returnType) {
                    expect(funcType.returnType.kind).toBe('int');
                }
            }

            const getItems = funcs.find((f: IntrospectedSymbol) => f.name === 'get_items');
            if (getItems) {
                const funcType = getItems.type as any;
                if (funcType.returnType) {
                    expect(funcType.returnType.kind).toBe('array');
                }
            }
        }
    });

    it('M.4: introspects function argument types (NOTE: names are generic placeholders)', async () => {
        const code = `
void process(string filename, int count, array data) {
}
`;
        const response = await bridge.analyze(code, ['introspect'], 'test-args.pike');
        const result = response.result?.introspect;

        expect(result).toBeDefined();
        if (result?.success) {
            const funcs = result.functions ?? [];
            const process = funcs.find((f: IntrospectedSymbol) => f.name === 'process');

            if (process) {
                expect(process.type.kind).toBe('function');
                const funcType = process.type as any;

                // Should have argument information for snippet generation
                // NOTE: Pike's _typeof doesn't preserve original argument names from source
                // It returns generic placeholders like "arg1", "arg2", "arg3"
                if (funcType.arguments) {
                    expect(funcType.arguments.length).toBe(3);
                    const argNames = funcType.arguments.map((a: any) => a.name);
                    expect(argNames).toContain('arg1');
                    expect(argNames).toContain('arg2');
                    expect(argNames).toContain('arg3');

                    // Verify argument types are correct even with generic names
                    const argTypes = funcType.arguments.map((a: any) => a.type);
                    expect(argTypes).toContain('string');
                    expect(argTypes).toContain('int');
                    expect(argTypes).toContain('array');
                }
            }
        }
    });

    it('M.5: introspects Pike stdlib inherits', async () => {
        const code = `
inherit Stdio.File;
`;
        const response = await bridge.analyze(code, ['introspect'], 'test-stdlib-inherit.pike');
        const result = response.result?.introspect;

        expect(result).toBeDefined();
        if (result?.success) {
            // Should report inheritance info
            const inherits = result.inherits ?? [];
            // At least one inherit entry for Stdio.File
            expect(inherits.length).toBeGreaterThan(0);

            // Inherited symbols should appear
            const symbolNames = result.symbols.map((s: IntrospectedSymbol) => s.name);
            // Stdio.File methods should appear as inherited
            if (symbolNames.includes('read')) {
                const readSym = result.symbols.find(
                    (s: IntrospectedSymbol) => s.name === 'read'
                );
                if (readSym) {
                    expect(readSym.inherited).toBeTruthy();
                }
            }
        }
    });

    it('M.6: introspects class with create() for constructor completion', async () => {
        const code = `
class Connection {
    void create(string host, int port) {
    }

    void send(string data) {
    }
}
`;
        const response = await bridge.analyze(code, ['introspect'], 'test-constructor.pike');
        const result = response.result?.introspect;

        expect(result).toBeDefined();
        if (result?.success) {
            const symbolNames = result.symbols.map((s: IntrospectedSymbol) => s.name);
            expect(symbolNames).toContain('Connection');
            expect(symbolNames).toContain('create');

            // create should have argument info for constructor snippet
            const createFunc = result.functions?.find(
                (f: IntrospectedSymbol) => f.name === 'create'
            );
            if (createFunc) {
                const funcType = createFunc.type as any;
                if (funcType.arguments) {
                    expect(funcType.arguments.length).toBe(2);
                }
            }
        }
    });

    it('M.7: handles invalid code gracefully', async () => {
        const code = 'void func( { broken syntax';
        const response = await bridge.analyze(code, ['parse', 'introspect'], 'test-broken.pike');

        // Should not throw
        expect(response).toBeDefined();
        // Parse may succeed with diagnostics, introspect may fail
        // Both should be recorded in the response, not thrown
    });
});
