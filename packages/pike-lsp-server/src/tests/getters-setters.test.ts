
import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { getGenerateGetterSetterActions } from '../features/advanced/getters-setters.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver/node.js';
import { PikeSymbol } from '@pike-lsp/pike-bridge';

describe('Generate Getters/Setters', () => {
    function createDoc(content: string): TextDocument {
        return TextDocument.create('file:///test.pike', 'pike', 1, content);
    }

    it('generates getters and setters for a variable', () => {
        const content = `
class Test {
    int my_var;
}
`.trim();
        const doc = createDoc(content);
        // Line 1 is "int my_var;"
        const range = Range.create(1, 4, 1, 4);

        const symbols: any[] = [{
            name: 'Test',
            kind: 'class',
            position: { line: 1, file: 'test.pike' },
            children: [{
                name: 'my_var',
                kind: 'variable',
                type: { name: 'int' },
                position: { line: 2, file: 'test.pike' }
            }]
        }];

        const actions = getGenerateGetterSetterActions(doc, 'file:///test.pike', range, symbols as PikeSymbol[]);

        assert.equal(actions.length, 3);

        const getterAction = actions.find(a => a.title.includes('Getter'));
        assert.ok(getterAction);
        const getterEdit = getterAction!.edit!.changes!['file:///test.pike']![0]!;
        assert.ok(getterEdit.newText.includes('int get_my_var()'));
        assert.ok(getterEdit.newText.includes('return my_var;'));

        const setterAction = actions.find(a => a.title.includes('Setter'));
        assert.ok(setterAction);
        const setterEdit = setterAction!.edit!.changes!['file:///test.pike']![0]!;
        assert.ok(setterEdit.newText.includes('void set_my_var(int value)'));
        assert.ok(setterEdit.newText.includes('my_var = value;'));
    });

    it('returns empty array if not on a variable', () => {
        const content = `class Test {}`;
        const doc = createDoc(content);
        const range = Range.create(0, 0, 0, 0);
        const symbols: PikeSymbol[] = [];

        const actions = getGenerateGetterSetterActions(doc, 'file:///test.pike', range, symbols);
        assert.equal(actions.length, 0);
    });
});
