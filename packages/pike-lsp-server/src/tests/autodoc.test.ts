
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
        const content = `//!!
int add(int a, int b) {
    return a + b;
}`;
        const doc = createDoc(content);
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);

        assert.equal(items.length, 1);
        const item = items[0]!;
        assert.equal(item.label, '//!! AutoDoc Template');
        assert.equal(item.kind, CompletionItemKind.Snippet);

        const insertText = item.insertText ?? '';
        // Should NOT have the function name line anymore
        assert.ok(!insertText.includes('//! add'));
        assert.ok(insertText.includes('@param a'));
        assert.ok(insertText.includes('@param b'));
        assert.ok(insertText.includes('@returns'));
    });

    it('generates template for function with modifiers', () => {
        const content = `//!!
public static void main(array(string) args) {
}`;
        const doc = createDoc(content);
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);

        assert.equal(items.length, 1);
        const item = items[0]!;

        const insertText = item.insertText ?? '';
        // Should NOT have the function name line
        assert.ok(!insertText.includes('//! main'));
        assert.ok(insertText.includes('@param args'));
        // void returns should not have @returns
        assert.ok(!insertText.includes('@returns'), 'Should not have @returns for void function');
    });

    it('ignores non-//!! comments', () => {
        const content = `// Just a comment
int x;`;
        const doc = createDoc(content);
        const position = Position.create(0, 17);

        const items = getAutoDocCompletion(doc, position);

        assert.equal(items.length, 0);
    });

    it('handles method with complex args', () => {
        const content = `//!!
mapping(string:int) process_data(array(object) items, string mode) {
}`;
        const doc = createDoc(content);
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);
        assert.equal(items.length, 1);
        const insertText = items[0]!.insertText ?? '';

        assert.ok(!insertText.includes('//! process_data'));
        assert.ok(insertText.includes('@param items'));
        assert.ok(insertText.includes('@param mode'));
        assert.ok(insertText.includes('@returns'));
    });

    it('handles union types like Gmp.mpz|int', () => {
        const content = `//!!
this_program set_public_key(Gmp.mpz|int modulo, Gmp.mpz|int pub) {
}`;
        const doc = createDoc(content);
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);
        assert.equal(items.length, 1);
        const item = items[0]!;

        assert.equal(item.detail, 'set_public_key(modulo, pub)');

        const insertText = item.insertText ?? '';
        // Should NOT have the function name line
        assert.ok(!insertText.includes('//! set_public_key'));
        assert.ok(insertText.includes('@param modulo'));
        assert.ok(insertText.includes('@param pub'));
        // this_program functions typically have void return
        assert.ok(!insertText.includes('@returns'));
    });

    it('triggers when cursor is at position 3 (mid-way through //!!)', () => {
        const content = `//!!
int add(int a, int b) {
    return a + b;
}`;
        const doc = createDoc(content);
        // Cursor at position 3 (right after //!, before the second !)
        const position = Position.create(0, 3);

        const items = getAutoDocCompletion(doc, position);

        // Should still trigger because the line contains //!
        assert.equal(items.length, 1);
        const item = items[0]!;
        assert.equal(item.label, '//!! AutoDoc Template');
    });

    it('triggers when cursor is at position 4 (after //!!)', () => {
        const content = `//!!
int add(int a, int b) {
    return a + b;
}`;
        const doc = createDoc(content);
        // Cursor at position 4 (after //!!)
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);

        assert.equal(items.length, 1);
        const item = items[0]!;
        assert.equal(item.label, '//!! AutoDoc Template');
    });

    it('does not trigger when there is no function on the next line', () => {
        const content = `//!!
int x;`;
        const doc = createDoc(content);
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);

        assert.equal(items.length, 0);
    });

    it('skips empty lines between //!! and function', () => {
        const content = `//!!

int add(int a, int b) {
    return a + b;
}`;
        const doc = createDoc(content);
        const position = Position.create(0, 4);

        const items = getAutoDocCompletion(doc, position);

        assert.equal(items.length, 1);
    });
});
