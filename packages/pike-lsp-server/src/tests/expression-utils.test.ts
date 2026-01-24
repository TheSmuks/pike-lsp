/**
 * Expression Utils Unit Tests
 *
 * Tests for extractExpressionAtPosition function which handles:
 * - Module paths (Stdio.File, Parser.Pike.split)
 * - Member access (file->read, mapping->key)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { extractExpressionAtPosition } from '../features/navigation/expression-utils.js';

describe('extractExpressionAtPosition', () => {
    /**
     * Create a test document from source code
     */
    function createDocument(source: string): TextDocument {
        return TextDocument.create('test://test.pike', 'pike', 1, source);
    }

    /**
     * Find position of a pattern in the source
     */
    function findPosition(source: string, pattern: RegExp): { line: number; character: number } {
        const match = source.match(pattern);
        if (!match) {
            throw new Error(`Pattern not found: ${pattern}`);
        }
        const index = source.indexOf(match[0]);
        const lines = source.substring(0, index).split('\n');
        return {
            line: lines.length - 1,
            character: lines[lines.length - 1]!.length,
        };
    }

    describe('Module path extraction', () => {
        it('should extract dotted module path like "Stdio.File" when on File', () => {
            const source = 'Stdio.File file;';
            const doc = createDocument(source);
            const pos = findPosition(source, /File/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            assert.strictEqual(result!.fullPath, 'Stdio.File');
            assert.strictEqual(result!.base, 'Stdio');
            assert.strictEqual(result!.member, 'File');
            assert.strictEqual(result!.operator, '.');
            assert.strictEqual(result!.isModulePath, false);
        });

        it('should extract dotted module path like "Stdio.File" when on Stdio', () => {
            const source = 'Stdio.File file;';
            const doc = createDocument(source);
            const pos = findPosition(source, /Stdio/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            assert.strictEqual(result!.fullPath, 'Stdio.File');
            assert.strictEqual(result!.base, 'Stdio');
            assert.strictEqual(result!.member, 'File');
            assert.strictEqual(result!.operator, '.');
            assert.strictEqual(result!.isModulePath, false);
        });

        it('should extract triple module path like "Parser.Pike.split"', () => {
            const source = 'Parser.Pike.split(code);';
            const doc = createDocument(source);
            const pos = findPosition(source, /split/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            assert.strictEqual(result!.fullPath, 'Parser.Pike.split');
            assert.strictEqual(result!.base, 'Parser.Pike');
            assert.strictEqual(result!.member, 'split');
            assert.strictEqual(result!.operator, '.');
            assert.strictEqual(result!.isModulePath, true);
        });

        it('should extract module path when cursor on middle component', () => {
            const source = 'Parser.Pike.split(code);';
            const doc = createDocument(source);
            const pos = findPosition(source, /Pike/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            assert.strictEqual(result!.fullPath, 'Parser.Pike.split');
            assert.strictEqual(result!.base, 'Parser.Pike');
            assert.strictEqual(result!.member, 'split');
            assert.strictEqual(result!.operator, '.');
            assert.strictEqual(result!.isModulePath, true);
        });
    });

    describe('Member access extraction', () => {
        it('should extract arrow member access like "file->read"', () => {
            const source = 'file->read(1024);';
            const doc = createDocument(source);
            const pos = findPosition(source, /read/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            assert.strictEqual(result!.fullPath, 'file->read');
            assert.strictEqual(result!.base, 'file');
            assert.strictEqual(result!.member, 'read');
            assert.strictEqual(result!.operator, '->');
            assert.strictEqual(result!.isModulePath, false);
        });

        it('should extract arrow member access when cursor on base', () => {
            const source = 'file->read(1024);';
            const doc = createDocument(source);
            const pos = findPosition(source, /file/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            assert.strictEqual(result!.fullPath, 'file->read');
            assert.strictEqual(result!.base, 'file');
            assert.strictEqual(result!.member, 'read');
            assert.strictEqual(result!.operator, '->');
            assert.strictEqual(result!.isModulePath, false);
        });

        it('should extract chained member access like "mapping->key->value"', () => {
            const source = 'mapping->key->value;';
            const doc = createDocument(source);
            const pos = { line: 0, character: source.indexOf('value') };

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            assert.strictEqual(result!.fullPath, 'mapping->key->value');
            assert.strictEqual(result!.base, 'mapping->key');
            assert.strictEqual(result!.member, 'value');
            assert.strictEqual(result!.operator, '->');
            assert.strictEqual(result!.isModulePath, false);
        });
    });

    describe('Module instantiation with member access', () => {
        it('should extract "Stdio.File()->read" correctly when on read', () => {
            const source = 'Stdio.File()->read();';
            const doc = createDocument(source);
            const pos = findPosition(source, /read/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            // This is a complex case - we extract what we can parse
            assert.ok(result!.fullPath.includes('read'));
            assert.strictEqual(result!.operator, '->');
        });

        it('should extract module path from "Stdio.File()->read" when on File', () => {
            const source = 'Stdio.File()->read();';
            const doc = createDocument(source);
            const pos = findPosition(source, /File/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            assert.ok(result!.fullPath.includes('File'));
            assert.strictEqual(result!.operator, '.');
        });
    });

    describe('Edge cases', () => {
        it('should return null when cursor on whitespace between unrelated identifiers', () => {
            const source = 'Stdio.File  test;';
            const doc = createDocument(source);
            const pos = { line: 0, character: 11 }; // In whitespace between "Stdio.File" and "test"

            const result = extractExpressionAtPosition(doc, pos);

            // When cursor is in whitespace, we return null (no word at cursor position)
            assert.strictEqual(result, null, 'Should return null for whitespace');
        });

        it('should handle identifier at end of line', () => {
            const source = 'int x = 42';
            const doc = createDocument(source);
            const pos = findPosition(source, /x/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract identifier at end of line');
            assert.strictEqual(result!.fullPath, 'x');
            assert.strictEqual(result!.base, 'x');
        });

        it('should handle identifier at start of line', () => {
            const source = 'x = 42';
            const doc = createDocument(source);
            const pos = findPosition(source, /x/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract identifier at start of line');
            assert.strictEqual(result!.fullPath, 'x');
        });

        it('should handle multi-line document', () => {
            const source = 'int x;\nStdio.File file;\nstring s;';
            const doc = createDocument(source);
            const pos = { line: 1, character: 7 }; // On "File"

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression from multi-line document');
            assert.ok(result!.fullPath.includes('File'));
        });

        it('should handle incomplete expression ending with dot', () => {
            const source = 'Stdio.';
            const doc = createDocument(source);
            const pos = { line: 0, character: 3 }; // On "Stdio" not the dot

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract partial expression');
            assert.strictEqual(result!.base, 'Stdio');
        });

        it('should handle expression ending with dot after cursor', () => {
            const source = 'Stdio.File.';
            const doc = createDocument(source);
            const pos = findPosition(source, /File/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            // We extract "Stdio.File" - the trailing dot is not part of the expression
            assert.strictEqual(result!.fullPath, 'Stdio.File');
            assert.strictEqual(result!.base, 'Stdio');
            assert.strictEqual(result!.member, 'File');
        });
    });

    describe('Range calculation', () => {
        it('should correctly calculate range for simple identifier', () => {
            const source = 'Stdio file;';
            const doc = createDocument(source);
            const pos = findPosition(source, /Stdio/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            const text = doc.getText();
            const extracted = text.substring(result!.range.start, result!.range.end);
            assert.strictEqual(extracted, 'Stdio');
        });

        it('should correctly calculate range for module path', () => {
            const source = 'Parser.Pike.split;';
            const doc = createDocument(source);
            const pos = findPosition(source, /split/);

            const result = extractExpressionAtPosition(doc, pos);

            assert.ok(result, 'Should extract expression');
            const text = doc.getText();
            const extracted = text.substring(result!.range.start, result!.range.end);
            assert.strictEqual(extracted, 'Parser.Pike.split');
        });
    });
});
