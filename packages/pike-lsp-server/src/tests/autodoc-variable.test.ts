import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getAutoDocCompletion } from '../features/editing/autodoc.js';

describe('AutoDoc Variable Support', () => {
    function createDocument(text: string): TextDocument {
        return TextDocument.create('file:///test.pike', 'pike', 0, text);
    }

    it('triggers for variable declaration with int type', () => {
        const code = `//!\nint my_var;`;
        const doc = createDocument(code);

        // Position at the end of //!
        const position = { line: 0, character: 3 };
        const result = getAutoDocCompletion(doc, position);

        assert.ok(result.length > 0, 'Should return completion');
        assert.equal(result[0]!.label, '//!! AutoDoc Template');
        assert.equal(result[0]!.detail, 'int my_var');
    });

    it('triggers for variable declaration with initializer', () => {
        const code = `//!\nstring name = "test";`;
        const doc = createDocument(code);

        const position = { line: 0, character: 3 };
        const result = getAutoDocCompletion(doc, position);

        assert.ok(result.length > 0, 'Should return completion');
        assert.equal(result[0]!.label, '//!! AutoDoc Template');
        assert.equal(result[0]!.detail, 'string name');
    });

    it('triggers for variable declaration with complex type', () => {
        const code = `//!\nmapping(string:int) data;`;
        const doc = createDocument(code);

        const position = { line: 0, character: 3 };
        const result = getAutoDocCompletion(doc, position);

        assert.ok(result.length > 0, 'Should return completion');
        assert.equal(result[0]!.label, '//!! AutoDoc Template');
        assert.equal(result[0]!.detail, 'mapping(string:int) data');
    });

    it('generates correct template for variable', () => {
        const code = `//!\nint counter;`;
        const doc = createDocument(code);

        const position = { line: 0, character: 3 };
        const result = getAutoDocCompletion(doc, position);

        assert.ok(result.length > 0, 'Should return completion');
        const template = result[0]!.insertText as string;

        assert.ok(template.includes('//! ${1:Description}'), 'Should have description placeholder');
        assert.ok(template.includes('//! @type int'), 'Should have type declaration');
    });

    it('does not trigger for functions when expecting variable', () => {
        const code = `//!\nvoid my_func(int x);`;
        const doc = createDocument(code);

        const position = { line: 0, character: 3 };
        const result = getAutoDocCompletion(doc, position);

        // Should still work for functions (has parens)
        assert.ok(result.length > 0, 'Should return completion for function');
        assert.equal(result[0]!.detail, 'void my_func(int x)');
    });
});
