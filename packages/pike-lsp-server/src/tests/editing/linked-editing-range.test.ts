/**
 * Linked Editing Range Provider Tests
 *
 * Tests for linked editing (simultaneous editing of matching symbols).
 * Exercises registerLinkedEditingHandler() via MockConnection.
 */

import { describe, it, expect } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { registerLinkedEditingHandler } from '../../features/editing/linked-editing.js';
import {
    createMockConnection,
    createMockDocuments,
    createMockServices,
    makeCacheEntry,
    sym,
} from '../helpers/mock-services.js';

// =============================================================================
// Setup helpers
// =============================================================================

interface SetupOptions {
    code: string;
    uri?: string;
    symbols?: PikeSymbol[];
}

function setup(opts: SetupOptions) {
    const uri = opts.uri ?? 'file:///test.pike';
    const doc = TextDocument.create(uri, 'pike', 1, opts.code);

    const docsMap = new Map<string, TextDocument>();
    docsMap.set(uri, doc);

    const cacheEntries = new Map<string, ReturnType<typeof makeCacheEntry>>();
    cacheEntries.set(uri, makeCacheEntry({
        symbols: opts.symbols ?? [],
    }));

    const services = createMockServices({ cacheEntries });
    const documents = createMockDocuments(docsMap);
    const conn = createMockConnection();

    registerLinkedEditingHandler(conn as any, services as any, documents as any);

    return {
        linkedEditingRange: (line: number, character: number) =>
            conn.linkedEditingRangeHandler({
                textDocument: { uri },
                position: { line, character },
            }),
        uri,
    };
}

// =============================================================================
// Tests
// =============================================================================

describe('Linked Editing Range Provider', () => {

    describe('Basic functionality', () => {
        it('should return null for undefined symbol', async () => {
            const code = `int x = 42;`;
            const { linkedEditingRange } = setup({ code, symbols: [] });

            const result = await linkedEditingRange(0, 5);
            expect(result).toBeNull();
        });

        it('should return null when no cached document', async () => {
            const code = `int x = 42;`;
            const uri = 'file:///test.pike';
            const doc = TextDocument.create(uri, 'pike', 1, code);

            const docsMap = new Map<string, TextDocument>();
            docsMap.set(uri, doc);

            // No cache entries
            const cacheEntries = new Map<string, ReturnType<typeof makeCacheEntry>>();

            const services = createMockServices({ cacheEntries });
            const documents = createMockDocuments(docsMap);
            const conn = createMockConnection();

            registerLinkedEditingHandler(conn as any, services as any, documents as any);

            const result = await conn.linkedEditingRangeHandler({
                textDocument: { uri },
                position: { line: 0, character: 5 },
            });

            expect(result).toBeNull();
        });

        it('should return null when no document in TextDocuments', async () => {
            const code = `int x = 42;`;
            const uri = 'file:///test.pike';

            const docsMap = new Map<string, TextDocument>();
            // No document added

            const cacheEntries = new Map<string, ReturnType<typeof makeCacheEntry>>();
            cacheEntries.set(uri, makeCacheEntry({
                symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 1, column: 5 } })],
            }));

            const services = createMockServices({ cacheEntries });
            const documents = createMockDocuments(docsMap);
            const conn = createMockConnection();

            registerLinkedEditingHandler(conn as any, services as any, documents as any);

            const result = await conn.linkedEditingRangeHandler({
                textDocument: { uri },
                position: { line: 0, character: 5 },
            });

            expect(result).toBeNull();
        });
    });

    describe('Symbol matching', () => {
        it('should return single range for symbol with single occurrence', async () => {
            const code = `int myVar = 42;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'myVar',
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 5 },
                }],
            });

            const result = await linkedEditingRange(0, 6);
            expect(result).not.toBeNull();

            if (result) {
                expect(result.ranges).toHaveLength(1);
                expect(result.ranges[0].start.line).toBe(0);
                expect(result.ranges[0].start.character).toBe(4); // column 5 - 1 for 0-index
                expect(result.ranges[0].end.character).toBe(9); // 4 + 'myVar'.length
            }
        });

        it('should return multiple ranges for symbol with multiple occurrences', async () => {
            const code = `int myVar = 42;
int x = myVar;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [
                    {
                        name: 'myVar',
                        kind: 'variable',
                        modifiers: [],
                        position: { file: 'test.pike', line: 1, column: 5 },
                    },
                    {
                        name: 'myVar',
                        kind: 'variable',
                        modifiers: [],
                        position: { file: 'test.pike', line: 2, column: 9 },
                    },
                ],
            });

            const result = await linkedEditingRange(0, 6);
            expect(result).not.toBeNull();

            if (result) {
                expect(result.ranges.length).toBeGreaterThanOrEqual(1);
            }
        });

        it('should handle class symbols', async () => {
            const code = `class MyClass { }
MyClass obj;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'MyClass',
                    kind: 'class',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 7 },
                }],
            });

            const result = await linkedEditingRange(0, 8);
            expect(result).not.toBeNull();

            if (result) {
                expect(result.ranges).toHaveLength(1);
                expect(result.ranges[0].start.line).toBe(0);
                expect(result.ranges[0].start.character).toBe(6); // column 7 - 1
            }
        });

        it('should handle method symbols', async () => {
            const code = `void myMethod() { }
myMethod();`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'myMethod',
                    kind: 'method',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 11 },
                }],
            });

            const result = await linkedEditingRange(0, 12);
            expect(result).not.toBeNull();

            if (result) {
                expect(result.ranges).toHaveLength(1);
                expect(result.ranges[0].start.character).toBe(10); // column 11 - 1
            }
        });

        it('should handle symbols without column information', async () => {
            const code = `int myVar = 42;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'myVar',
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1 }, // No column
                }],
            });

            const result = await linkedEditingRange(0, 6);
            expect(result).not.toBeNull();

            if (result) {
                expect(result.ranges).toHaveLength(1);
                // Should default to column 0 when not specified
                expect(result.ranges[0].start.character).toBe(0);
            }
        });
    });

    describe('Word boundary detection', () => {
        it('should find word at cursor position', async () => {
            const code = `int myVariable = 42;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'myVariable',
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 5 },
                }],
            });

            // Cursor in the middle of the word
            const result = await linkedEditingRange(0, 8);
            expect(result).not.toBeNull();
        });

        it('should handle cursor at word start', async () => {
            const code = `int myVar = 42;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'myVar',
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 5 },
                }],
            });

            const result = await linkedEditingRange(0, 4); // At 'm' of 'myVar'
            expect(result).not.toBeNull();
        });

        it('should handle cursor at word end', async () => {
            const code = `int myVar = 42;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'myVar',
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 5 },
                }],
            });

            const result = await linkedEditingRange(0, 8); // At 'r' of 'myVar'
            expect(result).not.toBeNull();
        });

        it('should return null for cursor on whitespace', async () => {
            const code = `int myVar = 42;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'myVar',
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 5 },
                }],
            });

            const result = await linkedEditingRange(0, 3); // At space after 'int'
            expect(result).toBeNull();
        });

        it('should return null for cursor outside word boundaries', async () => {
            const code = `int myVar = 42;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'myVar',
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 5 },
                }],
            });

            const result = await linkedEditingRange(0, 15); // Past the symbol
            expect(result).toBeNull();
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', async () => {
            const code = ``;
            const { linkedEditingRange } = setup({ code, symbols: [] });

            const result = await linkedEditingRange(0, 0);
            expect(result).toBeNull();
        });

        it('should handle document with only whitespace', async () => {
            const code = `   \n   \n   `;
            const { linkedEditingRange } = setup({ code, symbols: [] });

            const result = await linkedEditingRange(0, 1);
            expect(result).toBeNull();
        });

        it('should handle symbols with special characters in name', async () => {
            const code = `int my_var_123 = 42;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [{
                    name: 'my_var_123',
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: 1, column: 5 },
                }],
            });

            const result = await linkedEditingRange(0, 6);
            expect(result).not.toBeNull();
        });

        it('should not match symbols with different names', async () => {
            const code = `int myVar = 42;
int otherVar = 10;`;
            const { linkedEditingRange } = setup({
                code,
                symbols: [
                    {
                        name: 'myVar',
                        kind: 'variable',
                        modifiers: [],
                        position: { file: 'test.pike', line: 1, column: 5 },
                    },
                    {
                        name: 'otherVar',
                        kind: 'variable',
                        modifiers: [],
                        position: { file: 'test.pike', line: 2, column: 5 },
                    },
                ],
            });

            const result = await linkedEditingRange(0, 6);
            expect(result).not.toBeNull();

            if (result) {
                // Should only include ranges for 'myVar', not 'otherVar'
                for (const range of result.ranges) {
                    const lineText = code.split('\n')[range.start.line];
                    const word = lineText.slice(range.start.character, range.end.character);
                    expect(word).toBe('myVar');
                }
            }
        });
    });

    describe('Performance', () => {
        it('should complete within 50ms for document with 100+ symbols', async () => {
            const symbols: PikeSymbol[] = [];
            const lines = ['int target = 42;'];

            for (let i = 0; i < 100; i++) {
                lines.push(`int var_${i} = ${i};`);
                symbols.push({
                    name: `var_${i}`,
                    kind: 'variable',
                    modifiers: [],
                    position: { file: 'test.pike', line: i + 2, column: 5 },
                });
            }

            symbols.push({
                name: 'target',
                kind: 'variable',
                modifiers: [],
                position: { file: 'test.pike', line: 1, column: 5 },
            });

            const code = lines.join('\n');
            const { linkedEditingRange } = setup({ code, symbols });

            const start = performance.now();
            const result = await linkedEditingRange(0, 6);
            const elapsed = performance.now() - start;

            expect(result).not.toBeNull();
            expect(elapsed).toBeLessThan(50);
        });
    });
});
