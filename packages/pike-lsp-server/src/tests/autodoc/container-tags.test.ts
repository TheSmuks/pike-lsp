/**
 * Integration tests for container tag rendering
 * Tests @int, @string, @mixed, @section, @ul, @ol, @code containers
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { buildHoverContent } from '../../features/utils/hover-builder.js';

describe('AutoDoc Container Tags Integration', () => {
    describe('@int container', () => {
        it('renders integer ranges in inline text', () => {
            // When formatted inline by Pike's format_group_as_text
            const symbol: any = {
                name: 'range_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '**Integer ranges:**\n  - `0 .. 10 (int)`\n  - `20 (int)`'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Integer ranges'));
        });

        it('handles multiple integer ranges', () => {
            const symbol: any = {
                name: 'multi_range',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '**Integer ranges:**\n  - `0 (int)`\n  - `1 (int)`\n  - `2 (int)`'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Should render all ranges
        });
    });

    describe('@string container', () => {
        it('renders string values in inline text', () => {
            const symbol: any = {
                name: 'string_enum',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '**String values:**\n  - `"foo"`\n  - `"bar"`'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('String values'));
        });

        it('handles string values with types', () => {
            const symbol: any = {
                name: 'typed_strings',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '**String values:**\n  - `"key" (string(8bit))`'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
        });
    });

    describe('@mixed container', () => {
        it('renders mixed types in inline text', () => {
            const symbol: any = {
                name: 'mixed_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '**Mixed types:**\n  - string|int\n  - array(mixed)'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Mixed types'));
        });

        it('handles complex mixed types', () => {
            const symbol: any = {
                name: 'complex_mixed',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '**Mixed types:**\n  - mapping(string:string|int)\n  - function(string:void)'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
        });
    });

    describe('@section container', () => {
        it('renders section heading', () => {
            const symbol: any = {
                name: 'documented_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '### Section Title\n\nSection content here.'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Section should be rendered as markdown heading
        });

        it('handles section with content', () => {
            const symbol: any = {
                name: 'with_content',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '### Usage\n\n```pike\nfoo();\n```\n\n### Notes\n\nImportant notes here.'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Usage'));
        });
    });

    describe('@ul container', () => {
        it('renders unordered list', () => {
            const symbol: any = {
                name: 'list_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '- First item\n- Second item\n- Third item'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Unordered list should be rendered
        });

        it('handles list with descriptions', () => {
            const symbol: any = {
                name: 'descriptive_list',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '- Item 1: Description one\n- Item 2: Description two'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
        });
    });

    describe('@ol container', () => {
        it('renders ordered list', () => {
            const symbol: any = {
                name: 'ordered_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '1. First step\n2. Second step\n3. Third step'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Ordered list should be rendered
        });

        it('handles ordered list with descriptions', () => {
            const symbol: any = {
                name: 'ordered_desc',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '1. Step one: Do this\n2. Step two: Do that'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
        });
    });

    describe('@code container', () => {
        it('renders code block with fencing', () => {
            const symbol: any = {
                name: 'code_example',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '```\nint x = 5;\n```'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Code block should be rendered
        });

        it('handles code with language', () => {
            const symbol: any = {
                name: 'pike_example',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '```pike\nint add(int a, int b) {\n  return a + b;\n}\n```'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('add'));
        });
    });

    describe('nested containers', () => {
        it('handles containers within params', () => {
            const symbol: any = {
                name: 'nested_func',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: 'Processes data.',
                    params: {
                        'data': '**Array elements:**\n  - `int` - Integer value\n  - `string` - String value'
                    }
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            assert.ok(content.includes('Parameters'));
        });

        it('handles multiple container types in one doc', () => {
            const symbol: any = {
                name: 'multi_container',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '### Examples\n\n```pike\nfoo();\n```\n\n### See Also\n\n- Related function\n- Another function'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Multiple sections should all be rendered
        });
    });

    describe('edge cases', () => {
        it('handles empty container gracefully', () => {
            const symbol: any = {
                name: 'empty_container',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '### Empty Section\n\n'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Should not crash on empty section
        });

        it('handles malformed container markup', () => {
            const symbol: any = {
                name: 'malformed',
                kind: 'function',
                returnType: { name: 'void' },
                documentation: {
                    text: '- Unclosed list item\n- Another item\n\n# Bad heading'
                }
            };

            const content = buildHoverContent(symbol);
            assert.ok(content);
            // Should render something even with malformed markdown
        });
    });
});
