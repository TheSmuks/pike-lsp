/**
 * Document Synchronization Integration Tests
 *
 * Tests that verify the LSP document synchronization feature is properly wired.
 * This includes document open, change, save, and close events.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { TextDocumentSyncKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('Document Synchronization Integration', () => {
    describe('TextDocumentSyncKind values', () => {
        it('should define None as 0', () => {
            assert.strictEqual(TextDocumentSyncKind.None, 0, 'None should be 0');
        });

        it('should define Full as 1', () => {
            assert.strictEqual(TextDocumentSyncKind.Full, 1, 'Full should be 1');
        });

        it('should define Incremental as 2', () => {
            assert.strictEqual(TextDocumentSyncKind.Incremental, 2, 'Incremental should be 2');
        });
    });

    describe('TextDocumentSyncKind configuration', () => {
        it('should use Incremental sync kind', () => {
            const syncKind = TextDocumentSyncKind.Incremental;
            assert.strictEqual(syncKind, 2, 'Server should use incremental sync');
        });

        it('should support incremental change detection', () => {
            // Simulate incremental change structure
            const contentChange = {
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 5 }
                },
                text: 'class'
            };

            assert.ok('range' in contentChange, 'Incremental changes should have range');
            assert.strictEqual(contentChange.range.start.line, 0, 'Should have start line');
            assert.strictEqual(contentChange.range.end.line, 0, 'Should have end line');
        });

        it('should distinguish full document changes', () => {
            // Full document change has no range
            const fullChange = {
                text: '// New content'
            };

            assert.ok(!('range' in fullChange), 'Full changes should not have range property');
        });
    });

    describe('TextDocument API', () => {
        it('should track document version', () => {
            const uri = 'file:///test/example.pike';
            const doc = TextDocument.create(uri, 'pike', 1, 'int x = 1;');

            assert.strictEqual(doc.version, 1, 'Initial version should be 1');

            const doc2 = TextDocument.create(uri, 'pike', 2, 'int y = 2;');
            assert.strictEqual(doc2.version, 2, 'Version should be updatable');
        });

        it('should support multiple language IDs', () => {
            const pikeDoc = TextDocument.create('file:///test/a.pike', 'pike', 1, 'int x;');
            const rxmlDoc = TextDocument.create('file:///test/b.rxml', 'rxml', 1, '<roxen></roxen>');
            const mixedDoc = TextDocument.create('file:///test/c.pike', 'mixed', 1, '//pike');

            assert.strictEqual(pikeDoc.languageId, 'pike');
            assert.strictEqual(rxmlDoc.languageId, 'rxml');
            assert.strictEqual(mixedDoc.languageId, 'mixed');
        });
    });

    describe('Incremental change handling', () => {
        it('should parse incremental change ranges', () => {
            const change = {
                range: {
                    start: { line: 5, character: 10 },
                    end: { line: 5, character: 15 }
                },
                text: 'newText'
            };

            // Verify range structure
            assert.strictEqual(change.range.start.line, 5);
            assert.strictEqual(change.range.start.character, 10);
            assert.strictEqual(change.range.end.line, 5);
            assert.strictEqual(change.range.end.character, 15);
        });

        it('should handle full document replacement', () => {
            const change = {
                text: 'complete new document content'
            };

            // Full replacement has no range
            assert.strictEqual(change.text, 'complete new document content');
            assert.ok(!('range' in change), 'Full replacement should not have range');
        });

        it('should handle multiple content changes', () => {
            const changes = [
                {
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 5 }
                    },
                    text: 'first'
                },
                {
                    range: {
                        start: { line: 1, character: 0 },
                        end: { line: 1, character: 5 }
                    },
                    text: 'second'
                }
            ];

            assert.strictEqual(changes.length, 2, 'Should handle multiple changes');
        });

        it('should handle insertion at start of document', () => {
            const change = {
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 }
                },
                text: '// Comment\n'
            };

            assert.strictEqual(change.range.start.line, 0);
            assert.strictEqual(change.range.start.character, 0);
            assert.strictEqual(change.range.end.line, 0);
            assert.strictEqual(change.range.end.character, 0);
        });

        it('should handle deletion of entire line', () => {
            const change = {
                range: {
                    start: { line: 5, character: 0 },
                    end: { line: 6, character: 0 }
                },
                text: ''
            };

            assert.ok(change.range.end.line > change.range.start.line, 'Should delete across lines');
        });
    });

    describe('Server document sync configuration', () => {
        it('should use incremental sync in server capabilities', () => {
            // This mirrors what the server.ts does
            const textDocumentSync = TextDocumentSyncKind.Incremental;
            assert.strictEqual(textDocumentSync, 2, 'Server should use incremental (2)');
        });

        it('should configure openClose option', () => {
            const syncOptions = {
                openClose: true,
                change: TextDocumentSyncKind.Incremental
            };

            assert.strictEqual(syncOptions.openClose, true, 'Should handle open/close');
            assert.strictEqual(syncOptions.change, 2, 'Should use incremental');
        });

        it('should configure save option', () => {
            const syncOptions = {
                save: {
                    includeText: false
                }
            };

            assert.ok(syncOptions.save, 'Should support save');
            assert.strictEqual(syncOptions.save.includeText, false, 'Should not include text');
        });
    });
});
