import assert from 'node:assert';
import { provideRoxenCompletions } from '../../../features/roxen/completion.js';
import { CompletionItemKind } from 'vscode-languageserver';

describe('Roxen Completions', () => {
    test('provideRoxenCompletions("constant module_type = MODULE_", pos) -> returns MODULE_* items', () => {
        const code = 'constant module_type = MODULE_';
        const result = provideRoxenCompletions(code, { line: 0, character: code.length });

        assert.ok(result !== null, 'Should return completions for MODULE_ prefix');
        assert.ok(result.length > 0, 'Should have at least one MODULE_* completion');

        // Check that all returned items start with MODULE_
        for (const item of result) {
            assert.ok(item.label.startsWith('MODULE_'), `Label ${item.label} should start with MODULE_`);
        }
    });

    test('MODULE_TAG completion has correct detail value (16, not 5)', () => {
        const code = 'constant module_type = MODULE_';
        const result = provideRoxenCompletions(code, { line: 0, character: code.length });

        assert.ok(result !== null, 'Should return completions');
        const moduleTag = result.find(item => item.label === 'MODULE_TAG');
        assert.ok(moduleTag, 'Should include MODULE_TAG completion');

        // Detail should contain the actual value from constants.ts (16)
        assert.ok(
            moduleTag.detail?.includes('16'),
            `MODULE_TAG detail should include value 16, got: ${moduleTag.detail}`
        );
        // Should NOT contain the wrong hardcoded value (5)
        assert.ok(
            !moduleTag.detail?.includes('5'),
            `MODULE_TAG detail should not include wrong value 5, got: ${moduleTag.detail}`
        );
    });

    test('provideRoxenCompletions(\'defvar("x", 0, "X", TYPE_\', pos) -> returns TYPE_* items', () => {
        const code = 'defvar("x", 0, "X", TYPE_';
        const result = provideRoxenCompletions(code, { line: 0, character: code.length });

        assert.ok(result !== null, 'Should return completions for TYPE_ prefix');
        assert.ok(result.length > 0, 'Should have at least one TYPE_* completion');

        // Check that all returned items start with TYPE_
        for (const item of result) {
            assert.ok(item.label.startsWith('TYPE_'), `Label ${item.label} should start with TYPE_`);
        }
    });

    test('TYPE_STRING completion has correct detail value (1, not 0)', () => {
        const code = 'defvar("x", 0, "X", TYPE_';
        const result = provideRoxenCompletions(code, { line: 0, character: code.length });

        assert.ok(result !== null, 'Should return completions');
        const typeString = result.find(item => item.label === 'TYPE_STRING');
        assert.ok(typeString, 'Should include TYPE_STRING completion');

        // Detail should contain the actual value from constants.ts (1)
        assert.ok(
            typeString.detail?.includes('1'),
            `TYPE_STRING detail should include value 1, got: ${typeString.detail}`
        );
        // Should NOT contain the wrong hardcoded value (0)
        assert.ok(
            !typeString.detail?.includes('0'),
            `TYPE_STRING detail should not include wrong value 0, got: ${typeString.detail}`
        );
    });

    test('provideRoxenCompletions("int x = 5;", pos) -> returns null', () => {
        const code = 'int x = 5;';
        const result = provideRoxenCompletions(code, { line: 0, character: 10 });

        assert.strictEqual(result, null, 'Should return null for non-Roxen context');
    });

    test('All MODULE_* completions have correct values from constants.ts', () => {
        const code = 'constant module_type = MODULE_';
        const result = provideRoxenCompletions(code, { line: 0, character: code.length });

        assert.ok(result !== null, 'Should return completions');

        // Verify a few known values from constants.ts
        const moduleZero = result.find(item => item.label === 'MODULE_ZERO');
        assert.ok(moduleZero, 'Should include MODULE_ZERO');
        assert.ok(moduleZero.detail?.includes('0'), 'MODULE_ZERO value should be 0');

        const moduleLocation = result.find(item => item.label === 'MODULE_LOCATION');
        assert.ok(moduleLocation, 'Should include MODULE_LOCATION');
        assert.ok(moduleLocation.detail?.includes('2'), 'MODULE_LOCATION value should be 2');

        const moduleTag = result.find(item => item.label === 'MODULE_TAG');
        assert.ok(moduleTag, 'Should include MODULE_TAG');
        assert.ok(moduleTag.detail?.includes('16'), 'MODULE_TAG value should be 16');
    });

    test('All TYPE_* completions have correct values from constants.ts', () => {
        const code = 'defvar("x", 0, "X", TYPE_';
        const result = provideRoxenCompletions(code, { line: 0, character: code.length });

        assert.ok(result !== null, 'Should return completions');

        // Verify a few known values from constants.ts
        const typeString = result.find(item => item.label === 'TYPE_STRING');
        assert.ok(typeString, 'Should include TYPE_STRING');
        assert.ok(typeString.detail?.includes('1'), 'TYPE_STRING value should be 1');

        const typeInt = result.find(item => item.label === 'TYPE_INT');
        assert.ok(typeInt, 'Should include TYPE_INT');
        assert.ok(typeInt.detail?.includes('3'), 'TYPE_INT value should be 3');

        const typeFlag = result.find(item => item.label === 'TYPE_FLAG');
        assert.ok(typeFlag, 'Should include TYPE_FLAG');
        assert.ok(typeFlag.detail?.includes('7'), 'TYPE_FLAG value should be 7');
    });

    test('Completion items have proper kind and documentation', () => {
        const code = 'constant module_type = MODULE_';
        const result = provideRoxenCompletions(code, { line: 0, character: code.length });

        assert.ok(result !== null, 'Should return completions');

        // All items should be Constant kind
        for (const item of result) {
            assert.strictEqual(
                item.kind,
                CompletionItemKind.Constant,
                `Completion ${item.label} should be Constant kind`
            );
            assert.ok(
                item.documentation,
                `Completion ${item.label} should have documentation`
            );
        }
    });
});
