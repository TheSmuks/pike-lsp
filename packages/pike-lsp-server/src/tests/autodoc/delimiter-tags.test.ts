/**
 * Unit tests for missing DELIMITERKEYWORD tags
 * Tests @index, @type, @obsolete, @copyright, @thanks, @fixme, @constant
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHoverContent } from '../../features/utils/hover-builder.js';

describe('AutoDoc Delimiter Tags', () => {
    describe('@index (used with @multiset)', () => {
        it('renders index in documentation', () => {
            const symbol: any = {
                name: 'create_multiset',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: 'Creates a multiset.',
                    indexes: [
                        { label: 'index_name', text: 'The index' }
                    ]
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Indexes should be rendered in a section
            assert.ok(content.includes('Indexes'));
        });

        it('handles multiple indexes', () => {
            const symbol: any = {
                name: 'multi_index',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: 'Test.',
                    indexes: [
                        { label: 'idx1', text: 'First index' },
                        { label: 'idx2', text: 'Second index' }
                    ]
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Indexes'));
        });
    });

    describe('@type (used with @mixed)', () => {
        it('renders type in documentation', () => {
            const symbol: any = {
                name: 'mixed_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: 'Accepts multiple types.',
                    types: ['string|int', 'array(mixed)']
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Types'));
        });

        it('handles single type', () => {
            const symbol: any = {
                name: 'single_type',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: 'Test.',
                    types: ['int']
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('int'));
        });
    });

    describe('@obsolete', () => {
        it('renders obsolete warning', () => {
            const symbol: any = {
                name: 'old_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: 'This is old.',
                    obsolete: 'Use new_func() instead.'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('OBSOLETE'));
            assert.ok(content.includes('new_func'));
        });

        it('shows obsolete in output', () => {
            const symbol: any = {
                name: 'deprecated_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    obsolete: 'This is obsolete.',
                    text: 'Main description here.'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Both should be present
            assert.ok(content.includes('OBSOLETE'));
            assert.ok(content.includes('Main description'));
        });
    });

    describe('@copyright', () => {
        it('renders copyright notice', () => {
            const symbol: any = {
                name: 'module',
                kind: 'module',
                documentation: {
                    text: 'Module description.',
                    copyright: ['2025 Example Corp']
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Copyright'));
            assert.ok(content.includes('2025'));
        });

        it('handles multiple copyright notices', () => {
            const symbol: any = {
                name: 'module',
                kind: 'module',
                documentation: {
                    text: 'Test.',
                    copyright: ['2025 Author 1', '2024 Author 2']
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Author 1'));
            assert.ok(content.includes('Author 2'));
        });
    });

    describe('@thanks', () => {
        it('renders thanks/acknowledgments', () => {
            const symbol: any = {
                name: 'contrib_module',
                kind: 'module',
                documentation: {
                    text: 'Module description.',
                    thanks: ['To all contributors']
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Thanks'));
            assert.ok(content.includes('contributors'));
        });

        it('handles multiple thanks entries', () => {
            const symbol: any = {
                name: 'module',
                kind: 'module',
                documentation: {
                    text: 'Test.',
                    thanks: ['To contributor A', 'To contributor B']
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('contributor A'));
            assert.ok(content.includes('contributor B'));
        });
    });

    describe('@fixme', () => {
        it('renders fixme note', () => {
            const symbol: any = {
                name: 'incomplete_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: 'Function description.',
                    fixme: ['This needs refactoring']
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('FIXME'));
            assert.ok(content.includes('refactoring'));
        });

        it('handles multiple fixme entries', () => {
            const symbol: any = {
                name: 'buggy_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: 'Test.',
                    fixme: ['Issue 1', 'Issue 2']
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Issue 1'));
            assert.ok(content.includes('Issue 2'));
        });
    });

    describe('@constant', () => {
        it('renders enum constants', () => {
            const symbol: any = {
                name: 'Color',
                kind: 'class',
                documentation: {
                    text: 'Color constants.',
                    constants: {
                        'RED': 'int',
                        'GREEN': 'int',
                        'BLUE': 'int'
                    }
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Constants'));
            assert.ok(content.includes('RED'));
            assert.ok(content.includes('GREEN'));
            assert.ok(content.includes('BLUE'));
        });

        it('handles constant with complex type', () => {
            const symbol: any = {
                name: 'Config',
                kind: 'class',
                documentation: {
                    text: 'Configuration constants.',
                    constants: {
                        'DEFAULT_PATH': 'string',
                        'MAX_SIZE': 'int',
                        'OPTIONS': 'mapping(string:mixed)'
                    }
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('DEFAULT_PATH'));
            assert.ok(content.includes('string'));
        });
    });

    describe('combined tags', () => {
        it('handles symbol with multiple new tags', () => {
            const symbol: any = {
                name: 'complex_module',
                kind: 'module',
                documentation: {
                    text: 'Module with many tags.',
                    copyright: ['2025 Author'],
                    thanks: ['To contributors'],
                    constants: {
                        'CONST1': 'int'
                    }
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Copyright'));
            assert.ok(content.includes('Thanks'));
            assert.ok(content.includes('Constants'));
        });
    });
});
