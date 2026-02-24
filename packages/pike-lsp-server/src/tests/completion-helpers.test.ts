
import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { buildCompletionItem } from '../features/editing/completion-helpers.js';

describe('Completion Helpers', () => {

    it('handles symbol without kind', () => {
        const symbol = { name: 'testFunc' };
        const item = buildCompletionItem('testFunc', symbol as any, 'source');
        assert.strictEqual(item.label, 'testFunc');
    });

    it('sets correct detail for function symbols', () => {
        const symbol = {
            kind: 'function',
            name: 'myFunction',
            type: { kind: 'function', returnType: { name: 'int' }, argTypes: [{ name: 'string' }] }
        };
        const item = buildCompletionItem('myFunction', symbol as any, 'source');
        assert.ok(item.detail);
    });

    it('prioritizes types in type context', () => {
        const classSymbol = { kind: 'class', name: 'MyClass' };
        const varSymbol = { kind: 'variable', name: 'myVar' };

        const classItem = buildCompletionItem('MyClass', classSymbol, 'source', undefined, 'type');
        const varItem = buildCompletionItem('myVar', varSymbol, 'source', undefined, 'type');

        // Lower sortText means higher priority
        assert.ok(classItem.sortText! < varItem.sortText!, 'Class should have higher priority than variable in type context');
        assert.ok(classItem.sortText!.startsWith('0_'), 'Class should have priority 0 in type context');
        assert.ok(varItem.sortText!.startsWith('9_'), 'Variable should have priority 9 in type context');
    });

    it('prioritizes values in expression context', () => {
        const classSymbol = { kind: 'class', name: 'MyClass' };
        const varSymbol = { kind: 'variable', name: 'myVar' };

        const classItem = buildCompletionItem('MyClass', classSymbol, 'source', undefined, 'expression');
        const varItem = buildCompletionItem('myVar', varSymbol, 'source', undefined, 'expression');

        // Lower sortText means higher priority
        assert.ok(varItem.sortText! < classItem.sortText!, 'Variable should have higher priority than class in expression context');
        assert.ok(varItem.sortText!.startsWith('0_'), 'Variable should have priority 0 in expression context');
        assert.ok(classItem.sortText!.startsWith('2_'), 'Class should have priority 2 in expression context');
    });

    it('handles constants appropriately', () => {
        const constSymbol = { kind: 'constant', name: 'MY_CONST' };

        const typeItem = buildCompletionItem('MY_CONST', constSymbol, 'source', undefined, 'type');
        const exprItem = buildCompletionItem('MY_CONST', constSymbol, 'source', undefined, 'expression');

        assert.ok(typeItem.sortText!.startsWith('1_'), 'Constant should have priority 1 in type context');
        assert.ok(exprItem.sortText!.startsWith('1_'), 'Constant should have priority 1 in expression context');
    });

    it('adds inheritance info to detail', () => {
        const symbol: any = {
            kind: 'function',
            name: 'my_func',
            inherited: true,
            inheritedFrom: 'ParentClass',
            type: { kind: 'function', returnType: { name: 'void' } }
        };

        const item = buildCompletionItem('my_func', symbol, 'source');
        assert.ok(item.detail);
        assert.ok(item.detail.includes('(Inherited from ParentClass)'));
    });
});
