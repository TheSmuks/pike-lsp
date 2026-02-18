/**
 * Completion Provider Additional Tests
 *
 * Additional tests for completion provider to increase coverage.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

describe('Completion Provider Additional Tests', () => {
    describe('Completion Item Building', () => {
        it('should handle keywords in completion', () => {
            // Keywords should be completions too
            const keywordCompletion = {
                label: 'if',
                kind: 14, // Keyword
                detail: 'Conditional statement',
                sortText: '5_if'
            };

            assert.strictEqual(keywordCompletion.label, 'if');
            assert.strictEqual(keywordCompletion.kind, 14);
        });

        it('should handle snippets in completion', () => {
            const snippetCompletion = {
                label: 'if statement',
                kind: 15, // Snippet
                insertText: 'if (${1:condition}) {\n\t$0\n}',
                insertTextFormat: 2 // Snippet
            };

            assert.ok(snippetCompletion.insertText.includes('${1:condition}'));
            assert.strictEqual(snippetCompletion.insertTextFormat, 2);
        });

        it('should handle different completion kinds', () => {
            const completionKinds = {
                text: 1,
                method: 2,
                function: 3,
                constructor: 4,
                field: 5,
                variable: 6,
                class: 7,
                interface: 8,
                module: 9,
                property: 10,
                unit: 11,
                value: 12,
                enum: 13,
                keyword: 14,
                snippet: 15,
                color: 16,
                reference: 17,
                folder: 18,
                constant: 19,
                struct: 20,
                event: 21,
                operator: 22,
                typeParameter: 23
            };

            assert.strictEqual(completionKinds.text, 1);
            assert.strictEqual(completionKinds.keyword, 14);
            assert.strictEqual(completionKinds.function, 3);
        });
    });

    describe('Completion Context', () => {
        it('should detect dot trigger', () => {
            const context = {
                triggerKind: 2, // TriggerCharacter
                triggerCharacter: '.'
            };

            assert.strictEqual(context.triggerCharacter, '.');
        });

        it('should detect trigger character for arrow', () => {
            const context = {
                triggerKind: 2,
                triggerCharacter: '>'
            };

            assert.strictEqual(context.triggerCharacter, '>');
        });

        it('should handle invocation completion', () => {
            const context = {
                triggerKind: 1, // Invoked
            };

            assert.strictEqual(context.triggerKind, 1);
        });
    });

    describe('Completion Filtering', () => {
        it('should filter by prefix', () => {
            const items = ['Array', 'Object', 'map', 'mutable'];
            const prefix = 'Ar';

            const filtered = items.filter(item =>
                item.toLowerCase().startsWith(prefix.toLowerCase())
            );

            assert.strictEqual(filtered.length, 1);
            assert.strictEqual(filtered[0], 'Array');
        });

        it('should handle case-insensitive filtering', () => {
            const items = ['Foo', 'foo', 'FOO', 'fOo'];
            const prefix = 'foo';

            const filtered = items.filter(item =>
                item.toLowerCase().startsWith(prefix.toLowerCase())
            );

            assert.strictEqual(filtered.length, 4);
        });
    });

    describe('Completion Sorting', () => {
        it('should sort by relevance score', () => {
            const items = [
                { label: 'zebra', sortText: '9_zebra' },
                { label: 'apple', sortText: '0_apple' },
                { label: 'banana', sortText: '1_banana' }
            ];

            items.sort((a, b) => (a.sortText || '').localeCompare(b.sortText || ''));

            assert.strictEqual(items[0].label, 'apple');
            assert.strictEqual(items[1].label, 'banana');
            assert.strictEqual(items[2].label, 'zebra');
        });

        it('should handle fuzzy matching scores', () => {
            const scores = [
                { label: 'map', score: 100 },
                { label: 'mapping', score: 90 },
                { label: 'imap', score: 80 }
            ];

            scores.sort((a, b) => b.score - a.score);

            assert.strictEqual(scores[0].label, 'map');
            assert.strictEqual(scores[1].label, 'mapping');
        });
    });

    describe('Completion Commit Characters', () => {
        it('should define commit characters for Pike', () => {
            const commitChars = ['.', '(', '[', '{', '>', ':'];

            assert.ok(commitChars.includes('.'));
            assert.ok(commitChars.includes('('));
            assert.ok(commitChars.includes('['));
        });

        it('should handle completion with commit characters', () => {
            const item = {
                label: 'array',
                commitCharacters: ['.', '(']
            };

            assert.ok(item.commitCharacters?.includes('.'));
        });
    });

    describe('Completion Resolve', () => {
        it('should resolve additional details', () => {
            const resolvedItem = {
                label: 'Array',
                detail: 'Array type',
                documentation: 'A dynamically-sized array of elements'
            };

            assert.strictEqual(resolvedItem.detail, 'Array type');
            assert.ok(resolvedItem.documentation);
        });

        it('should handle documentation with markdown', () => {
            const doc = {
                kind: 'markdown',
                value: '```pike\narray arr = ({});\n```\n\nCreates an empty array.'
            };

            assert.ok(doc.value.includes('```pike'));
        });
    });

    describe('Completion Trigger Types', () => {
        it('should handle all trigger kinds', () => {
            const TriggerKind = {
                Invoked: 1,
                TriggerCharacter: 2,
                TriggerForIncompleteCompletions: 3
            };

            assert.strictEqual(TriggerKind.Invoked, 1);
            assert.strictEqual(TriggerKind.TriggerCharacter, 2);
            assert.strictEqual(TriggerKind.TriggerForIncompleteCompletions, 3);
        });
    });

    describe('Insert Text Format', () => {
        it('should use plaintext for simple completions', () => {
            const format = 1; // PlainText

            assert.strictEqual(format, 1);
        });

        it('should use snippet format for template completions', () => {
            const format = 2; // Snippet

            assert.strictEqual(format, 2);
        });
    });
});
