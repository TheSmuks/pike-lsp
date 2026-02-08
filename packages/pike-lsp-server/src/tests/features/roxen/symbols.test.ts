import assert from 'node:assert';
import { enhanceRoxenSymbols } from '../../../features/roxen/symbols';
import { RoxenModuleInfo } from '../../../../pike-bridge/src/types';

describe('Roxen Symbols - enhanceRoxenSymbols', () => {
    const baseSymbols = [
        {
            name: 'TestModule',
            kind: 5,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 10, character: 0 }
            },
            selectionRange: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 }
            },
            children: []
        }
    ];

    test('null moduleInfo -> returns base symbols unchanged', () => {
        const result = enhanceRoxenSymbols(baseSymbols, null);

        assert.strictEqual(result, baseSymbols, 'Should return same symbols reference');
        assert.deepStrictEqual(result, baseSymbols, 'Should not modify symbols');
    });

    test('is_roxen_module=0 -> returns base symbols unchanged', () => {
        const moduleInfo: RoxenModuleInfo = {
            is_roxen_module: 0,
            module_type: ['module'],
            module_name: 'TestModule',
            inherits: [],
            variables: [],
            tags: [],
            lifecycle: { has_create: 0, has_start: 0, has_stop: 0 }
        };

        const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

        assert.deepStrictEqual(result, baseSymbols, 'Should not enhance non-Roxen modules');
    });

    test('with variables -> adds "Module Variables" group', () => {
        const moduleInfo: RoxenModuleInfo = {
            is_roxen_module: 1,
            module_type: ['module'],
            module_name: 'TestModule',
            inherits: [],
            variables: [
                { name: 'var1', type: 'string', position: { line: 5, column: 4 } }
            ],
            tags: [],
            lifecycle: { has_create: 0, has_start: 0, has_stop: 0 }
        };

        const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

        assert.ok(result[0].children, 'Should have children');
        const variablesGroup = result[0].children?.find(c => c.name === 'Module Variables');
        assert.ok(variablesGroup, 'Should have "Module Variables" group');
        assert.ok(variablesGroup?.children, 'Variables group should have children');
    });

    test('with tags -> adds "RXML Tags" group', () => {
        const moduleInfo: RoxenModuleInfo = {
            is_roxen_module: 1,
            module_type: ['module'],
            module_name: 'TestModule',
            inherits: [],
            variables: [],
            tags: [
                { name: 'tag1', has_container: 0, position: { line: 3, column: 4 } }
            ],
            lifecycle: { has_create: 0, has_start: 0, has_stop: 0 }
        };

        const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

        assert.ok(result[0].children, 'Should have children');
        const tagsGroup = result[0].children?.find(c => c.name === 'RXML Tags');
        assert.ok(tagsGroup, 'Should have "RXML Tags" group');
    });

    test('All symbols have selectionRange property', () => {
        const moduleInfo: RoxenModuleInfo = {
            is_roxen_module: 1,
            module_type: ['module'],
            module_name: 'TestModule',
            inherits: [],
            variables: [
                { name: 'var1', type: 'string', position: { line: 5, column: 4 } }
            ],
            tags: [],
            lifecycle: { has_create: 0, has_start: 0, has_stop: 0 }
        };

        const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

        // Check all symbols have selectionRange
        const checkSelectionRange = (symbols: any[]) => {
            for (const symbol of symbols) {
                assert.ok(symbol.selectionRange, `Symbol ${symbol.name} missing selectionRange`);
                if (symbol.children) {
                    checkSelectionRange(symbol.children);
                }
            }
        };

        checkSelectionRange(result);
    });

    test('Variable positions use real line numbers from Pike', () => {
        const moduleInfo: RoxenModuleInfo = {
            is_roxen_module: 1,
            module_type: ['module'],
            module_name: 'TestModule',
            inherits: [],
            variables: [
                { name: 'var1', type: 'string', position: { line: 5, column: 4 } },
                { name: 'var2', type: 'int', position: { line: 10, column: 4 } }
            ],
            tags: [],
            lifecycle: { has_create: 0, has_start: 0, has_stop: 0 }
        };

        const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

        const variablesGroup = result[0].children?.find(c => c.name === 'Module Variables');
        assert.ok(variablesGroup?.children);

        // var1 at line 5 -> LSP line 4
        const var1 = variablesGroup.children.find((c: any) => c.name === 'var1');
        assert.strictEqual(var1.range.start.line, 4, 'var1 should be at LSP line 4');
        assert.strictEqual(var1.range.start.character, 3, 'var1 should be at LSP char 3');

        // var2 at line 10 -> LSP line 9
        const var2 = variablesGroup.children.find((c: any) => c.name === 'var2');
        assert.strictEqual(var2.range.start.line, 9, 'var2 should be at LSP line 9');
    });
});
