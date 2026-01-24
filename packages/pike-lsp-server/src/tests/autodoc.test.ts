
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAutoDocCompletion } from '../features/editing/autodoc.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, CompletionItemKind } from 'vscode-languageserver/node.js';

describe('AutoDoc Completion', () => {
    function createDoc(content: string): TextDocument {
        return TextDocument.create('file:///test.pike', 'pike', 1, content);
    }

    it('generates template for simple function', () => {
        const content = `
//!!
int add(int a, int b) {
    return a + b;
}
`;
        const doc = createDoc(content.trim());
        // Position at the end of //!!
        // line 0 is //!!
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);

        assert.equal(items.length, 1);
        const item = items[0]!;
        assert.equal(item.label, 'Generate AutoDoc Template');
        assert.equal(item.kind, CompletionItemKind.Snippet);

        const insertText = item.insertText ?? '';
        assert.ok(insertText.includes('//! add'));
        assert.ok(insertText.includes('@param a'));
        assert.ok(insertText.includes('@param b'));
        assert.ok(insertText.includes('@returns'));
    });

    it('generates template for function with modifiers', () => {
        const content = `
//!!
public static void main(array(string) args) {
}
`;
        const doc = createDoc(content.trim());
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);

        assert.equal(items.length, 1);
        const item = items[0]!;

        const insertText = item.insertText ?? '';
        assert.ok(insertText.includes('//! main'));
        assert.ok(insertText.includes('@param args'));
        // void returns should typically not have @returns, or be optional?
        // My implementation adds @returns if returnType != 'void'.
        assert.ok(!insertText.includes('@returns'), 'Should not have @returns for void function');
    });

    it('ignores non-//!! comments', () => {
        const content = `
// Just a comment
int x;
`;
        const doc = createDoc(content.trim());
        const position = Position.create(0, 17);

        const items = getAutoDocCompletion(doc, position);
        assert.equal(items.length, 0);
    });

    it('handles method with complex args', () => {
         const content = `
//!!
mapping(string:int) process_data(array(object) items, string mode) {
}
`;
        const doc = createDoc(content.trim());
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);
        assert.equal(items.length, 1);
        const insertText = items[0]!.insertText ?? '';

        assert.ok(insertText.includes('//! process_data'));
        assert.ok(insertText.includes('@param items'));
        assert.ok(insertText.includes('@param mode'));
        assert.ok(insertText.includes('@returns'));
    });
});
