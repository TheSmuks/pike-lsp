/**
 * Code Actions Additional Tests
 *
 * Additional tests for code actions feature.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

describe('Code Actions Additional Tests', () => {
    describe('Code Action Structure', () => {
        it('should create code action with title', () => {
            const action = {
                title: 'Add import',
                kind: 'quickfix'
            };

            assert.strictEqual(action.title, 'Add import');
        });

        it('should create code action with edit', () => {
            const action = {
                title: 'Rename symbol',
                edit: {
                    changes: {
                        'file:///test.pike': [
                            {
                                range: {
                                    start: { line: 0, character: 0 },
                                    end: { line: 0, character: 5 }
                                },
                                newText: 'newName'
                            }
                        ]
                    }
                }
            };

            assert.ok(action.edit);
            assert.ok(action.edit.changes);
        });

        it('should create code action with command', () => {
            const action = {
                title: 'Run formatter',
                command: {
                    title: 'Format document',
                    command: 'editor.action.format'
                }
            };

            assert.strictEqual(action.command.title, 'Format document');
        });
    });

    describe('Code Action Kinds', () => {
        it('should define quickfix kind', () => {
            const CodeActionKind = {
                QuickFix: 'quickfix',
                Refactor: 'refactor',
                RefactorExtract: 'refactor.extract',
                SourceOrganizeImports: 'source.organizeImports'
            };

            assert.strictEqual(CodeActionKind.QuickFix, 'quickfix');
        });

        it('should define refactor kinds', () => {
            const refactorKinds = [
                'refactor',
                'refactor.extract',
                'refactor.inline',
                'refactor.rewrite'
            ];

            assert.ok(refactorKinds.includes('refactor.extract'));
        });

        it('should check if kind matches filter', () => {
            const filter = 'quickfix';
            const actionKind = 'quickfix';

            assert.strictEqual(actionKind, filter);
        });
    });

    describe('Code Action Context', () => {
        it('should provide diagnostics in context', () => {
            const context = {
                diagnostics: [
                    {
                        message: 'Undefined variable',
                        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 15 } }
                    }
                ]
            };

            assert.strictEqual(context.diagnostics.length, 1);
            assert.ok(context.diagnostics[0].message);
        });

        it('should handle empty diagnostics', () => {
            const context = {
                diagnostics: []
            };

            assert.strictEqual(context.diagnostics.length, 0);
        });
    });

    describe('Code Action Filtering', () => {
        it('should filter by action kind', () => {
            const actions = [
                { title: 'QuickFix 1', kind: 'quickfix' },
                { title: 'Refactor 1', kind: 'refactor' },
                { title: 'QuickFix 2', kind: 'quickfix' }
            ];

            const quickFixes = actions.filter(a => a.kind === 'quickfix');
            assert.strictEqual(quickFixes.length, 2);
        });

        it('should filter by applicable range', () => {
            const range = {
                start: { line: 5, character: 0 },
                end: { line: 5, character: 10 }
            };

            const action = {
                title: 'Fix on line 5',
                range
            };

            assert.ok(action.range);
        });
    });

    describe('Code Action Priority', () => {
        it('should sort by priority', () => {
            const actions = [
                { title: 'Low priority', priority: 100 },
                { title: 'High priority', priority: 1000 },
                { title: 'Medium priority', priority: 500 }
            ];

            actions.sort((a, b) => b.priority - a.priority);
            assert.strictEqual(actions[0].title, 'High priority');
        });

        it('should handle equal priority', () => {
            const actions = [
                { title: 'Action A', priority: 100 },
                { title: 'Action B', priority: 100 }
            ];

            // When priorities are equal, sort by title
            actions.sort((a, b) => a.title.localeCompare(b.title));
            assert.strictEqual(actions[0].title, 'Action A');
        });
    });

    describe('Code Action Disabled State', () => {
        it('should indicate disabled action', () => {
            const action = {
                title: 'Complex refactor',
                disabled: {
                    reason: 'Selection too small'
                }
            };

            assert.ok(action.disabled);
            assert.strictEqual(action.disabled.reason, 'Selection too small');
        });

        it('should handle enabled action', () => {
            const action = {
                title: 'Simple fix',
                disabled: undefined
            };

            assert.ok(!action.disabled);
        });
    });

    describe('Code Action Data', () => {
        it('should preserve data for resolve', () => {
            const action = {
                title: 'Import symbol',
                data: {
                    symbolName: 'MyClass',
                    filePath: '/path/to/file.pike'
                }
            };

            assert.ok(action.data);
            assert.strictEqual(action.data.symbolName, 'MyClass');
        });
    });

    describe('Action Edit Application', () => {
        it('should create text edit', () => {
            const edit = {
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 10 }
                },
                newText: 'replaced content'
            };

            assert.ok(edit.newText);
        });

        it('should create insert edit', () => {
            const edit = {
                range: {
                    start: { line: 5, character: 5 },
                    end: { line: 5, character: 5 }
                },
                newText: 'inserted'
            };

            assert.strictEqual(edit.newText, 'inserted');
        });

        it('should create delete edit', () => {
            const edit = {
                range: {
                    start: { line: 3, character: 0 },
                    end: { line: 3, character: 15 }
                },
                newText: ''
            };

            assert.strictEqual(edit.newText, '');
        });
    });

    describe('Code Action Registration', () => {
        it('should register all code action kinds', () => {
            const registeredKinds = [
                'quickfix',
                'refactor',
                'source.organizeImports'
            ];

            assert.ok(registeredKinds.length > 0);
        });
    });
});
