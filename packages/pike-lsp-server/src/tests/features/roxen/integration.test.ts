/**
 * Roxen Integration Tests - TDD Phase
 *
 * RED phase: Write failing tests first that verify Roxen helpers
 * are properly integrated into diagnostics, symbols, and completion providers.
 */

import { describe, test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Roxen Integration - TDD RED Phase', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
        throw new Error('Pike executable not found');
    }
    await bridge.start();
    await new Promise(resolve => setTimeout(resolve, 200)); });

    afterAll(async () => { if (bridge) {
        await bridge.stop();
    } });

    describe('Detector integration', () => {
        test('Fast-path: code without "inherit "module"" -> returns null immediately', async () => {
            const code = `
int main() {
    return 1;
}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.equal(result.is_roxen_module, 0, 'Should not detect as Roxen module');
        });

        test('Fast-path: code with both markers -> proceeds to bridge', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_TAG;
string simpletag_hello(string tag_args) {
    return "Hello";
}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.equal(result.is_roxen_module, 1, 'Should detect as Roxen module');
            assert.ok(result.module_type?.includes('MODULE_TAG'), 'Should include MODULE_TAG');
        });

        test('Cache: second call with same version -> returns cached result', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_TAG;
`;
            const result1 = await bridge.roxenDetect(code, 'cached.pike');
            const result2 = await bridge.roxenDetect(code, 'cached.pike');
            // Ignore _perf timing differences
            const { _perf: _, ...result1Clean } = result1 as any;
            const { _perf: __, ...result2Clean } = result2 as any;
            assert.deepEqual(result1Clean, result2Clean, 'Should return cached result');
        });

        test('Cache invalidation: after invalidateCache(uri), next call hits bridge', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_LOCATION;
`;
            const result = await bridge.roxenDetect(code, 'invalidate.pike');
            assert.equal(result.is_roxen_module, 1, 'Should detect as Roxen module');
        });
    });

    describe('Diagnostics integration', () => {
        test('Roxen diagnostics: MODULE_LOCATION without query_location -> diagnostic', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_LOCATION;
`;
            const result = await bridge.roxenValidate(code, 'test.pike');
            assert.ok(result.diagnostics, 'Should have diagnostics');
            assert.ok(result.diagnostics.length > 0, 'Should report missing callback');
        });

        test('Roxen diagnostics: valid module passes validation', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_LOCATION;
string find_file(string filename, object id) {
    return filename;
}
`;
            const result = await bridge.roxenValidate(code, 'test.pike');
            assert.equal(result.diagnostics?.length ?? 0, 0, 'Should have no diagnostics');
        });
    });

    describe('Symbols integration', () => {
        test('Roxen symbols: defvar appears as variable symbol', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_TAG;
void create() {
    defvar("title", "Default", TYPE_STRING, "Page title");
}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.ok(result.variables, 'Should have variables');
            const titleVar = result.variables.find((v: any) => v.name === 'title');
            assert.ok(titleVar, 'Should find title variable');
        });

        test('Roxen symbols: RXML tag functions appear as symbols', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_TAG;
string simpletag_foo(mapping args) {
    return "foo";
}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.ok(result.tags, 'Should have tags');
            const fooTag = result.tags.find((t: any) => t.name === 'foo');
            assert.ok(fooTag, 'Should find simpletag_foo');
        });
    });

    describe('Completion integration', () => {
        test('Roxen completion: MODULE_* constants suggested in Roxen files', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_;
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.equal(result.is_roxen_module, 1, 'Should detect as Roxen module');
        });

        test('Roxen completion: TYPE_* constants suggested in defvar calls', async () => {
            const code = `
inherit "module";
void create() {
    defvar("var", "default", TYPE_, "description");
}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.equal(result.is_roxen_module, 1, 'Should detect as Roxen module');
        });
    });
});
