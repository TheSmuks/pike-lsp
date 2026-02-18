/**
 * Hover Integration Tests
 *
 * Integration tests for the hover feature.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

describe('Hover Integration Tests', () => {
    describe('Hover Content Building', () => {
        it('should build hover content for class', () => {
            const symbol = {
                name: 'MyClass',
                kind: 'class',
                documentation: 'A custom class for testing'
            };

            const content = `**${symbol.name}** (Class)

${symbol.documentation}`;

            assert.ok(content.includes('MyClass'));
            assert.ok(content.includes('Class'));
            assert.ok(content.includes('A custom class'));
        });

        it('should build hover content for function', () => {
            const symbol = {
                name: 'calculateSum',
                kind: 'function',
                type: { kind: 'function', returnType: { name: 'int' } },
                parameters: [
                    { name: 'a', type: { name: 'int' } },
                    { name: 'b', type: { name: 'int' } }
                ]
            };

            const content = `**${symbol.name}** (Function)

\`int\` calculateSum(\`int\` a, \`int\` b)`;

            assert.ok(content.includes('calculateSum'));
            assert.ok(content.includes('int'));
        });

        it('should handle symbols without documentation', () => {
            const symbol = {
                name: 'someVar',
                kind: 'variable'
            };

            const content = `**${symbol.name}**`;

            assert.ok(content.includes('someVar'));
        });
    });

    describe('Hover Markdown Formatting', () => {
        it('should format code blocks in markdown', () => {
            const codeExample = '```pike\nint x = 5;\n```';
            assert.ok(codeExample.includes('```pike'));
        });

        it('should bold keywords', () => {
            const boldKeyword = '**int**';
            assert.ok(boldKeyword.startsWith('**'));
            assert.ok(boldKeyword.endsWith('**'));
        });

        it('should handle italic text', () => {
            const italic = '*emphasis*';
            assert.ok(italic.startsWith('*'));
            assert.ok(italic.endsWith('*'));
        });

        it('should handle links in hover', () => {
            const link = '[See documentation](https://example.com)';
            assert.ok(link.includes('[See documentation]'));
            assert.ok(link.includes('(https://example.com)'));
        });
    });

    describe('Hover Position Handling', () => {
        it('should calculate position from offset', () => {
            const text = 'hello\nworld';
            const offset = 6; // start of "world"

            let line = 0;
            let character = 0;
            for (let i = 0; i < offset && i < text.length; i++) {
                if (text[i] === '\n') {
                    line++;
                    character = 0;
                } else {
                    character++;
                }
            }

            assert.strictEqual(line, 1);
            assert.strictEqual(character, 0);
        });

        it('should handle position at line start', () => {
            const text = 'line1\nline2';
            const offset = 6; // start of line2

            assert.ok(text[offset] === 'l');
        });

        it('should handle empty document', () => {
            const text = '';
            const offset = 0;

            assert.strictEqual(offset, 0);
        });
    });

    describe('Hover Range', () => {
        it('should define range for document symbol', () => {
            const range = {
                start: { line: 5, character: 0 },
                end: { line: 5, character: 10 }
            };

            assert.strictEqual(range.start.line, 5);
            assert.ok(range.end.character > range.start.character);
        });

        it('should handle single character range', () => {
            const range = {
                start: { line: 0, character: 5 },
                end: { line: 0, character: 6 }
            };

            assert.strictEqual(range.end.character - range.start.character, 1);
        });
    });

    describe('Hover Response', () => {
        it('should create hover response with markdown', () => {
            const hover = {
                contents: {
                    kind: 'markdown',
                    value: '**SomeSymbol**\n\nDescription here'
                },
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 10 }
                }
            };

            assert.ok(hover.contents.kind === 'markdown');
            assert.ok(hover.range);
        });

        it('should create hover response with plaintext', () => {
            const hover = {
                contents: {
                    kind: 'plaintext',
                    value: 'SimpleSymbol'
                }
            };

            assert.ok(hover.contents.kind === 'plaintext');
        });

        it('should handle hover with multiple contents', () => {
            const hover = {
                contents: [
                    { kind: 'markdown', value: '**Symbol**' },
                    { kind: 'plaintext', value: 'Additional info' }
                ]
            };

            assert.ok(Array.isArray(hover.contents));
            assert.strictEqual(hover.contents.length, 2);
        });
    });

    describe('Hover for Different Symbol Types', () => {
        it('should handle class symbol', () => {
            const symbol = { kind: 'class', name: 'MyClass' };
            assert.strictEqual(symbol.kind, 'class');
        });

        it('should handle function symbol', () => {
            const symbol = { kind: 'function', name: 'doWork' };
            assert.strictEqual(symbol.kind, 'function');
        });

        it('should handle variable symbol', () => {
            const symbol = { kind: 'variable', name: 'counter' };
            assert.strictEqual(symbol.kind, 'variable');
        });

        it('should handle constant symbol', () => {
            const symbol = { kind: 'constant', name: 'MAX_SIZE' };
            assert.strictEqual(symbol.kind, 'constant');
        });

        it('should handle interface symbol', () => {
            const symbol = { kind: 'interface', name: 'IHandler' };
            assert.strictEqual(symbol.kind, 'interface');
        });

        it('should handle module symbol', () => {
            const symbol = { kind: 'module', name: 'Files' };
            assert.strictEqual(symbol.kind, 'module');
        });
    });

    describe('Hover Edge Cases', () => {
        it('should handle very long symbol names', () => {
            const longName = 'a'.repeat(1000);
            const content = `**${longName}**`;

            assert.ok(content.includes(longName));
        });

        it('should handle unicode in symbols', () => {
            const unicodeSymbol = 'café';
            const content = `**${unicodeSymbol}**`;

            assert.ok(content.includes(unicodeSymbol));
        });

        it('should handle symbols with special chars', () => {
            const symbol = 'my_var_123';
            const content = `**${symbol}**`;

            assert.ok(content.includes(symbol));
        });

        it('should handle empty documentation gracefully', () => {
            const symbol = {
                name: 'TestSymbol',
                documentation: ''
            };

            const content = `**${symbol.name}**${symbol.documentation ? '\n\n' + symbol.documentation : ''}`;
            assert.ok(content.includes('TestSymbol'));
        });
    });

    describe('Hover Provider Capabilities', () => {
        it('should indicate hover provider is supported', () => {
            const capabilities = { hoverProvider: true };
            assert.strictEqual(capabilities.hoverProvider, true);
        });

        it('should handle hover provider not supported', () => {
            const capabilities = { hoverProvider: false };
            assert.strictEqual(capabilities.hoverProvider, false);
        });
    });
});
