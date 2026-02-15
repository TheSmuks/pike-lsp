/**
 * Roxen Module Analysis Tests
 */

// @ts-ignore - Bun test types
import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';
import type { RXMLTag, ModuleVariable } from './types.js';

describe('Roxen', () => {
    let bridge: PikeBridge;

    beforeAll(async () => {
        bridge = new PikeBridge();
        const available = await bridge.checkPike();
        if (!available) {
            throw new Error('Pike executable not found');
        }
        await bridge.start();
        await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterAll(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    describe('roxenDetect', () => {
        it('should detect Roxen MODULE_TAG module', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_TAG;
string simpletag_hello(string tag_args) {
    return "Hello, World\!";
}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.ok(result, 'Should return a result');
            assert.equal(result.is_roxen_module, 1, 'Should detect as Roxen module');
            assert.ok(Array.isArray(result.module_type), 'module_type should be an array');
            assert.ok(result.module_type.includes('MODULE_TAG'), 'Should include MODULE_TAG');
        });

        it('should parse simpletag definitions', async () => {
            const code = `
string simpletag_foo(mapping args) {
    return "foo";
}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.ok(Array.isArray(result.tags), 'tags should be an array');
            const fooTag = result.tags.find((t: RXMLTag) => t.name === 'foo');
            assert.ok(fooTag, 'Should find simpletag_foo');
            assert.equal(fooTag?.type, 'simple', 'Should be type simple');
        });

        it('should parse defvar calls', async () => {
            const code = `
void create() {
    defvar("title", "Default Title", TYPE_STRING, "Page title");
}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.ok(Array.isArray(result.variables), 'variables should be an array');
            const titleVar = result.variables.find((v: ModuleVariable) => v.name === 'title');
            assert.ok(titleVar, 'Should find title variable');
            assert.equal(titleVar?.type, 'TYPE_STRING', 'Should have TYPE_STRING');
            assert.equal(titleVar?.name_string, 'Default Title', 'Should have name_string');
        });

        it('should detect lifecycle callbacks', async () => {
            const code = `
void create() {}
int start() { return 1; }
void stop() {}
`;
            const result = await bridge.roxenDetect(code, 'test.pike');
            assert.ok(result.lifecycle, 'Should have lifecycle info');
            assert.equal(result.lifecycle.has_create, 1, 'Should detect create()');
            assert.equal(result.lifecycle.has_start, 1, 'Should detect start()');
            assert.equal(result.lifecycle.has_stop, 1, 'Should detect stop()');
        });
    });

    describe('roxenParseTags', () => {
        it('should parse simpletag functions', async () => {
            const code = `
string simpletag_test1(mapping args) {
    return "test1";
}
`;
            const result = await bridge.roxenParseTags(code, 'test.pike');
            assert.ok(result, 'Should return a result');
            assert.ok(Array.isArray(result.tags), 'tags should be an array');
            const test1Tag = result.tags.find((t: RXMLTag) => t.name === 'test1');
            assert.ok(test1Tag, 'Should find simpletag_test1');
            assert.equal(test1Tag?.type, 'simple', 'Should be simple type');
        });

        it('should return empty array for code without tags', async () => {
            const code = `
int x = 42;
`;
            const result = await bridge.roxenParseTags(code, 'test.pike');
            assert.ok(Array.isArray(result.tags), 'tags should be an array');
            assert.equal(result.tags.length, 0, 'Should have no tags');
        });
    });

    describe('roxenParseVars', () => {
        it('should parse defvar calls', async () => {
            const code = `
void create() {
    defvar("var1", "Default Value", TYPE_STRING, "Description");
}
`;
            const result = await bridge.roxenParseVars(code, 'test.pike');
            assert.ok(result, 'Should return a result');
            assert.ok(Array.isArray(result.variables), 'variables should be an array');
            assert.ok(result.variables.length > 0, 'Should find at least one variable');
            const v = result.variables[0];
            if (v) {
                assert.equal(v.name, 'var1', 'Should have correct name');
                assert.equal(v.name_string, 'Default Value', 'Should have name_string');
                assert.equal(v.type, 'TYPE_STRING', 'Should have correct type');
                assert.equal(v.doc_str, 'Description', 'Should have doc_str');
            }
        });

        it('should return empty array for code without defvar', async () => {
            const code = `
int x = 42;
`;
            const result = await bridge.roxenParseVars(code, 'test.pike');
            assert.ok(Array.isArray(result.variables), 'variables should be an array');
            assert.equal(result.variables.length, 0, 'Should have no variables');
        });
    });

    describe('roxenGetCallbacks', () => {
        it('should detect create callback', async () => {
            const code = `
void create() {}
`;
            const result = await bridge.roxenGetCallbacks(code, 'test.pike');
            assert.ok(result, 'Should return a result');
            assert.ok(result.lifecycle, 'Should have lifecycle info');
            assert.equal(result.lifecycle.has_create, 1, 'Should detect create()');
        });

        it('should detect start callback', async () => {
            const code = `
int start() { return 1; }
`;
            const result = await bridge.roxenGetCallbacks(code, 'test.pike');
            assert.equal(result.lifecycle.has_start, 1, 'Should detect start()');
        });

        it('should return empty for code without callbacks', async () => {
            const code = `
int calculate(int x) { return x * 2; }
`;
            const result = await bridge.roxenGetCallbacks(code, 'test.pike');
            assert.equal(result.lifecycle.has_create, 0, 'Should not detect create()');
            assert.equal(result.lifecycle.has_start, 0, 'Should not detect start()');
        });
    });

    describe('roxenValidate', () => {
        it('should validate MODULE_LOCATION with find_file callback', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_LOCATION;
string find_file(string filename, object id) {
    return filename;
}
`;
            const result = await bridge.roxenValidate(code, 'test.pike');
            assert.ok(result, 'Should return a result');
            assert.ok(Array.isArray(result.diagnostics), 'diagnostics should be an array');
        });

        it('should report missing required callback for MODULE_LOCATION', async () => {
            const code = `
inherit "module";
constant module_type = MODULE_LOCATION;
`;
            const result = await bridge.roxenValidate(code, 'test.pike');
            const missingCallbackError = result.diagnostics?.find((d: any) =>
                d.message?.includes('find_file')
            );
            assert.ok(missingCallbackError, 'Should report missing find_file callback');
        });

        it('should pass MODULE_TAG validation (no required callbacks)', async () => {
            const code = `
constant module_type = MODULE_TAG;
string simpletag_test() { return "test"; }
`;
            const result = await bridge.roxenValidate(code, 'test.pike');
            assert.equal(result.diagnostics?.length ?? 0, 0, 'Should have no diagnostics for MODULE_TAG');
        });
    });
});
