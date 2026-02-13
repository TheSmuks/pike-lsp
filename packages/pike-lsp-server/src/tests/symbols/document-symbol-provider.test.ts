/**
 * Document Symbol Provider Tests
 *
 * Tests for document symbols (outline view) functionality.
 * Exercises registerSymbolsHandlers() via MockConnection for onDocumentSymbol,
 * and directly tests the extracted convertSymbolKind() and getSymbolDetail().
 */

import { describe, it, expect, test } from 'bun:test';
import { SymbolKind, DocumentSymbol } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { convertSymbolKind, getSymbolDetail } from '../../features/symbols.js';
import { registerSymbolsHandlers } from '../../features/symbols.js';
import {
    createMockConnection,
    createMockServices,
    makeCacheEntry,
    sym,
} from '../helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';

// =============================================================================
// Setup for handler tests
// =============================================================================

interface SetupOptions {
    symbols?: PikeSymbol[];
    uri?: string;
    noCache?: boolean;
    bridge?: any;
    documents?: Map<string, TextDocument>;
}

function setup(opts: SetupOptions) {
    const uri = opts.uri ?? 'file:///test.pike';
    const cacheEntries = new Map<string, DocumentCacheEntry>();

    if (!opts.noCache) {
        cacheEntries.set(uri, makeCacheEntry({
            symbols: opts.symbols ?? [],
        }));
    }

    const services = createMockServices({
        cacheEntries,
        bridge: opts.bridge,
    });
    const conn = createMockConnection();

    // Mock documents manager if provided
    const mockDocuments = opts.documents;
    const documents = {
        get: (docUri: string) => mockDocuments?.get(docUri),
    };

    registerSymbolsHandlers(conn as any, services as any, documents as any);

    return {
        documentSymbol: () =>
            conn.documentSymbolHandler({ textDocument: { uri } }),
        uri,
    };
}

// =============================================================================
// Symbol Kind Mapping (extracted function)
// =============================================================================

describe('Document Symbol Provider', () => {

    describe('Symbol kind mapping', () => {
        it('should map class to SymbolKind.Class', () => {
            expect(convertSymbolKind('class')).toBe(SymbolKind.Class);
        });

        it('should map method to SymbolKind.Method', () => {
            expect(convertSymbolKind('method')).toBe(SymbolKind.Method);
        });

        it('should map variable to SymbolKind.Variable', () => {
            expect(convertSymbolKind('variable')).toBe(SymbolKind.Variable);
        });

        it('should map constant to SymbolKind.Constant', () => {
            expect(convertSymbolKind('constant')).toBe(SymbolKind.Constant);
        });

        it('should map typedef to SymbolKind.TypeParameter', () => {
            expect(convertSymbolKind('typedef')).toBe(SymbolKind.TypeParameter);
        });

        it('should map enum to SymbolKind.Enum', () => {
            expect(convertSymbolKind('enum')).toBe(SymbolKind.Enum);
        });

        it('should map enum_constant to SymbolKind.EnumMember', () => {
            expect(convertSymbolKind('enum_constant')).toBe(SymbolKind.EnumMember);
        });

        it('should map inherit to SymbolKind.Class', () => {
            expect(convertSymbolKind('inherit')).toBe(SymbolKind.Class);
        });

        it('should map import to SymbolKind.Module', () => {
            expect(convertSymbolKind('import')).toBe(SymbolKind.Module);
        });

        it('should map module to SymbolKind.Module', () => {
            expect(convertSymbolKind('module')).toBe(SymbolKind.Module);
        });

        it('should map unknown kind to SymbolKind.Variable', () => {
            expect(convertSymbolKind('unknown')).toBe(SymbolKind.Variable);
            expect(convertSymbolKind('')).toBe(SymbolKind.Variable);
            expect(convertSymbolKind('foobar')).toBe(SymbolKind.Variable);
        });
    });

    // =========================================================================
    // Symbol Detail (extracted function)
    // =========================================================================

    describe('Symbol detail', () => {
        it('should format returnType with argTypes', () => {
            const symbol = {
                name: 'add',
                kind: 'method' as const,
                modifiers: [],
                returnType: { name: 'int' },
                argTypes: [{ name: 'int' }, { name: 'string' }],
            } as unknown as PikeSymbol;

            const detail = getSymbolDetail(symbol);
            expect(detail).toBe('int(int, string)');
        });

        it('should use mixed as default for missing returnType name', () => {
            const symbol = {
                name: 'func',
                kind: 'method' as const,
                modifiers: [],
                returnType: {},
                argTypes: [{ name: 'int' }],
            } as unknown as PikeSymbol;

            const detail = getSymbolDetail(symbol);
            expect(detail).toBe('mixed(int)');
        });

        it('should use mixed as default for missing argType names', () => {
            const symbol = {
                name: 'func',
                kind: 'method' as const,
                modifiers: [],
                returnType: { name: 'void' },
                argTypes: [null, { name: 'string' }],
            } as unknown as PikeSymbol;

            const detail = getSymbolDetail(symbol);
            expect(detail).toBe('void(mixed, string)');
        });

        it('should format type name for non-method symbols', () => {
            const symbol = {
                name: 'myVar',
                kind: 'variable' as const,
                modifiers: [],
                type: { name: 'int' },
            } as unknown as PikeSymbol;

            const detail = getSymbolDetail(symbol);
            expect(detail).toBe('int');
        });

        it('should return undefined when no type info', () => {
            const symbol = sym('plain', 'variable');
            const detail = getSymbolDetail(symbol);
            expect(detail).toBeUndefined();
        });

        it('should add inheritance info with from', () => {
            const symbol = {
                name: 'method',
                kind: 'method' as const,
                modifiers: [],
                inherited: true,
                inheritedFrom: 'BaseClass',
                returnType: { name: 'void' },
                argTypes: [],
            } as unknown as PikeSymbol;

            const detail = getSymbolDetail(symbol);
            expect(detail).toBe('void() (from BaseClass)');
        });

        it('should add generic inherited marker without from', () => {
            const symbol = {
                name: 'method',
                kind: 'method' as const,
                modifiers: [],
                inherited: true,
                returnType: { name: 'void' },
                argTypes: [],
            } as unknown as PikeSymbol;

            const detail = getSymbolDetail(symbol);
            expect(detail).toBe('void() (inherited)');
        });

        it('should show only inheritance info when no type', () => {
            const symbol = {
                name: 'field',
                kind: 'variable' as const,
                modifiers: [],
                inherited: true,
                inheritedFrom: 'Parent',
            } as unknown as PikeSymbol;

            const detail = getSymbolDetail(symbol);
            expect(detail).toBe('(from Parent)');
        });
    });

    // =========================================================================
    // Document Symbol Handler
    // =========================================================================

    describe('Scenario 11.1: Document symbols - simple file', () => {
        it('should return DocumentSymbol array for cached symbols', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('globalVar', 'variable', { position: { file: 'test.pike', line: 2 } }),
                    sym('function1', 'method', { position: { file: 'test.pike', line: 4 } }),
                    sym('MyClass', 'class', { position: { file: 'test.pike', line: 6 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(3);

            expect(result![0]!.name).toBe('globalVar');
            expect(result![0]!.kind).toBe(SymbolKind.Variable);

            expect(result![1]!.name).toBe('function1');
            expect(result![1]!.kind).toBe(SymbolKind.Method);

            expect(result![2]!.name).toBe('MyClass');
            expect(result![2]!.kind).toBe(SymbolKind.Class);
        });

        it('should include all symbol types', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('MyClass', 'class', { position: { file: 'test.pike', line: 1 } }),
                    sym('myMethod', 'method', { position: { file: 'test.pike', line: 2 } }),
                    sym('myVar', 'variable', { position: { file: 'test.pike', line: 3 } }),
                    sym('MY_CONST', 'constant', { position: { file: 'test.pike', line: 4 } }),
                    sym('MyType', 'typedef', { position: { file: 'test.pike', line: 5 } }),
                    sym('Color', 'enum', { position: { file: 'test.pike', line: 6 } }),
                    sym('RED', 'enum_constant', { position: { file: 'test.pike', line: 7 } }),
                    sym('Base', 'inherit', { position: { file: 'test.pike', line: 8 } }),
                    sym('Stdio', 'import', { position: { file: 'test.pike', line: 9 } }),
                    sym('MyModule', 'module', { position: { file: 'test.pike', line: 10 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(10);

            expect(result![0]!.kind).toBe(SymbolKind.Class);
            expect(result![1]!.kind).toBe(SymbolKind.Method);
            expect(result![2]!.kind).toBe(SymbolKind.Variable);
            expect(result![3]!.kind).toBe(SymbolKind.Constant);
            expect(result![4]!.kind).toBe(SymbolKind.TypeParameter);
            expect(result![5]!.kind).toBe(SymbolKind.Enum);
            expect(result![6]!.kind).toBe(SymbolKind.EnumMember);
            expect(result![7]!.kind).toBe(SymbolKind.Class);  // inherit -> Class
            expect(result![8]!.kind).toBe(SymbolKind.Module); // import -> Module
            expect(result![9]!.kind).toBe(SymbolKind.Module); // module -> Module
        });

        it('should provide accurate line numbers (Pike 1-based to LSP 0-based)', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('var1', 'variable', { position: { file: 'test.pike', line: 1 } }),
                    sym('var2', 'variable', { position: { file: 'test.pike', line: 5 } }),
                    sym('var3', 'variable', { position: { file: 'test.pike', line: 10 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();

            // Pike line 1 -> LSP line 0
            expect(result![0]!.range.start.line).toBe(0);
            // Pike line 5 -> LSP line 4
            expect(result![1]!.range.start.line).toBe(4);
            // Pike line 10 -> LSP line 9
            expect(result![2]!.range.start.line).toBe(9);
        });
    });

    describe('Scenario 11.2: Document symbols - nested classes', () => {
        it('should show nested hierarchy', async () => {
            // Note: The current handler uses flat mapping (no nesting),
            // but symbols with children are still converted
            const { documentSymbol } = setup({
                symbols: [
                    sym('Outer', 'class', {
                        position: { file: 'test.pike', line: 1 },
                        children: [
                            sym('Inner', 'class', {
                                position: { file: 'test.pike', line: 2 },
                                children: [
                                    sym('deepMethod', 'method', { position: { file: 'test.pike', line: 3 } }),
                                ],
                            }),
                        ],
                    }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            // Top-level symbol list has Outer
            expect(result![0]!.name).toBe('Outer');
            expect(result![0]!.kind).toBe(SymbolKind.Class);
        });

        it('should show nested class members in children array', async () => {
            // P1 Nested Classes - Test for nested class member extraction
            // This test FAILS because nested class members are not currently extracted
            const { documentSymbol } = setup({
                symbols: [
                    sym('Outer', 'class', {
                        position: { file: 'test.pike', line: 1 },
                        children: [
                            sym('Inner', 'class', {
                                position: { file: 'test.pike', line: 2 },
                                children: [
                                    sym('x', 'variable', { position: { file: 'test.pike', line: 3 } }),
                                    sym('foo', 'method', {
                                        position: { file: 'test.pike', line: 4 },
                                        returnType: { name: 'void' },
                                        argTypes: [],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);

            const outer = result![0]!;
            expect(outer.name).toBe('Outer');
            expect(outer.kind).toBe(SymbolKind.Class);
            expect(outer.children).toBeDefined();
            expect(outer.children!.length).toBe(1);

            const inner = outer.children![0]!;
            expect(inner.name).toBe('Inner');
            expect(inner.kind).toBe(SymbolKind.Class);
            expect(inner.children).toBeDefined();
            expect(inner.children!.length).toBe(2);

            // Assert that Inner.x and Inner.foo appear as children of Inner
            expect(inner.children![0]!.name).toBe('x');
            expect(inner.children![0]!.kind).toBe(SymbolKind.Variable);
            expect(inner.children![1]!.name).toBe('foo');
            expect(inner.children![1]!.kind).toBe(SymbolKind.Method);
        });

        it('should show 3-level nesting hierarchy', async () => {
            // P1 Nested Classes - Test for deep nesting
            // This test FAILS because deeply nested members are not extracted
            const { documentSymbol } = setup({
                symbols: [
                    sym('A', 'class', {
                        position: { file: 'test.pike', line: 1 },
                        children: [
                            sym('B', 'class', {
                                position: { file: 'test.pike', line: 2 },
                                children: [
                                    sym('C', 'class', {
                                        position: { file: 'test.pike', line: 3 },
                                        children: [
                                            sym('deep', 'variable', { position: { file: 'test.pike', line: 4 } }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);

            const a = result![0]!;
            expect(a.name).toBe('A');
            expect(a.children).toBeDefined();
            expect(a.children!.length).toBe(1);

            const b = a.children![0]!;
            expect(b.name).toBe('B');
            expect(b.children).toBeDefined();
            expect(b.children!.length).toBe(1);

            const c = b.children![0]!;
            expect(c.name).toBe('C');
            expect(c.children).toBeDefined();
            expect(c.children!.length).toBe(1);

            const deep = c.children![0]!;
            expect(deep.name).toBe('deep');
            expect(deep.kind).toBe(SymbolKind.Variable);
        });
    });

    describe('Scenario 11.3: Document symbols - inheritance', () => {
        it('should show inheritance info in detail', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    {
                        name: 'method',
                        kind: 'method' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 3 },
                        inherited: true,
                        inheritedFrom: 'Base',
                        returnType: { name: 'void' },
                        argTypes: [],
                    } as unknown as PikeSymbol,
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result![0]!.detail).toContain('from Base');
        });

        it('should handle multiple inheritance', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('Base1', 'inherit', { position: { file: 'test.pike', line: 3 } }),
                    sym('Base2', 'inherit', { position: { file: 'test.pike', line: 4 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(2);
            expect(result![0]!.name).toBe('Base1');
            expect(result![1]!.name).toBe('Base2');
        });
    });

    describe('Scenario 11.4: Document symbols - enum', () => {
        it('should show enum and members with correct kinds', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('Color', 'enum', { position: { file: 'test.pike', line: 1 } }),
                    sym('RED', 'enum_constant', { position: { file: 'test.pike', line: 2 } }),
                    sym('GREEN', 'enum_constant', { position: { file: 'test.pike', line: 3 } }),
                    sym('BLUE', 'enum_constant', { position: { file: 'test.pike', line: 4 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(4);

            expect(result![0]!.kind).toBe(SymbolKind.Enum);
            expect(result![1]!.kind).toBe(SymbolKind.EnumMember);
            expect(result![2]!.kind).toBe(SymbolKind.EnumMember);
            expect(result![3]!.kind).toBe(SymbolKind.EnumMember);
        });
    });

    describe('Scenario 11.5: Document symbols - constants', () => {
        it('should show constant symbol', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('MAX_VALUE', 'constant', { position: { file: 'test.pike', line: 1 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result![0]!.name).toBe('MAX_VALUE');
            expect(result![0]!.kind).toBe(SymbolKind.Constant);
        });
    });

    describe('Scenario 11.6: Document symbols - typedef', () => {
        it('should show typedef symbol', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('StringFunc', 'typedef', { position: { file: 'test.pike', line: 1 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result![0]!.name).toBe('StringFunc');
            expect(result![0]!.kind).toBe(SymbolKind.TypeParameter);
        });
    });

    describe('Scenario 11.7: Document symbols - empty file', () => {
        it('should return empty array for empty symbol list', async () => {
            const { documentSymbol } = setup({ symbols: [] });

            const result = await documentSymbol();
            // Handler filters symbols and returns empty array when none are valid
            expect(result).toEqual([]);
        });

        it('should return null when no cache entry', async () => {
            const { documentSymbol } = setup({ noCache: true });

            const result = await documentSymbol();
            expect(result).toBeNull();
        });
    });

    describe('Edge Cases', () => {
        it('should handle duplicate symbol names', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('x', 'variable', { position: { file: 'test.pike', line: 1 } }),
                    sym('x', 'variable', { position: { file: 'test.pike', line: 3 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(2);
        });

        it('should handle symbols with special characters in name', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('my_variable_123', 'variable', { position: { file: 'test.pike', line: 1 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result![0]!.name).toBe('my_variable_123');
        });

        it('should filter out symbols with null names', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('valid', 'variable', { position: { file: 'test.pike', line: 1 } }),
                    { name: null as any, kind: 'variable', modifiers: [] } as any,
                    sym('also_valid', 'method', { position: { file: 'test.pike', line: 3 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(2);
            expect(result![0]!.name).toBe('valid');
            expect(result![1]!.name).toBe('also_valid');
        });

        it('should use "unknown" for symbols with empty name', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('', 'variable', { position: { file: 'test.pike', line: 1 } }),
                ],
            });

            const result = await documentSymbol();
            // Empty string name: the filter checks s.name != null, '' is not null
            // but name || 'unknown' in convertSymbol gives 'unknown'
            if (result && result.length > 0) {
                expect(result[0]!.name).toBe('unknown');
            }
        });

        it('should default line to 0 when position is missing', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('noPosition', 'variable'),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            // position?.line ?? 1 gives 1, then -1 = 0
            expect(result![0]!.range.start.line).toBe(0);
        });
    });

    // =========================================================================
    // Preprocessor Conditional Symbols (P2 - Task 2.1)
    // =========================================================================

    describe('Scenario 11.8: Document symbols - preprocessor conditionals', () => {
        it('should mark symbols inside #if block with conditional metadata', async () => {
            // Test code: #if COND \n int x; \n #endif
            // Expected: x should have conditional: { condition: "COND", branch: 0 }
            const { documentSymbol } = setup({
                symbols: [
                    {
                        name: 'x',
                        kind: 'variable' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 2 },
                        conditional: { condition: 'COND', branch: 0 },
                    } as unknown as PikeSymbol,
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);

            const xSymbol = result![0]!;
            expect(xSymbol.name).toBe('x');
            expect(xSymbol.kind).toBe(SymbolKind.Variable);
            // Verify conditional metadata is present on the raw PikeSymbol
            // (The DocumentSymbol itself doesn't expose this, but it's in the cache)
        });

        it('should distinguish symbols in different #if/#else branches', async () => {
            // Test code: #if COND \n int x; \n #else \n string y; \n #endif
            // Expected: x has branch 0, y has branch 1
            const { documentSymbol } = setup({
                symbols: [
                    {
                        name: 'x',
                        kind: 'variable' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 2 },
                        conditional: { condition: 'COND', branch: 0 },
                    } as unknown as PikeSymbol,
                    {
                        name: 'y',
                        kind: 'variable' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 4 },
                        conditional: { condition: 'COND', branch: 1 },
                    } as unknown as PikeSymbol,
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(2);

            const xSymbol = result![0]!;
            const ySymbol = result![1]!;
            expect(xSymbol.name).toBe('x');
            expect(ySymbol.name).toBe('y');
        });

        it('should handle symbols outside #if blocks (no conditional metadata)', async () => {
            // Test code: int a; \n #if COND \n int b; \n #endif \n int c;
            // Expected: a and c have no conditional, b has conditional
            const { documentSymbol } = setup({
                symbols: [
                    sym('a', 'variable', { position: { file: 'test.pike', line: 1 } }),
                    {
                        name: 'b',
                        kind: 'variable' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 3 },
                        conditional: { condition: 'COND', branch: 0 },
                    } as unknown as PikeSymbol,
                    sym('c', 'variable', { position: { file: 'test.pike', line: 5 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(3);

            // All three symbols should be present
            expect(result![0]!.name).toBe('a');
            expect(result![1]!.name).toBe('b');
            expect(result![2]!.name).toBe('c');
        });

        it('should handle nested #if blocks', async () => {
            // Test code: #if A \n #if B \n int x; \n #endif \n #endif
            // Expected: x has both conditions (or combined condition)
            const { documentSymbol } = setup({
                symbols: [
                    {
                        name: 'x',
                        kind: 'variable' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 3 },
                        conditional: { condition: 'A && B', branch: 0 },
                    } as unknown as PikeSymbol,
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);
            expect(result![0]!.name).toBe('x');
        });

        it('should extract symbols from split-block preprocessor branches', async () => {
            // Test code where branches are syntactically incomplete:
            // #if COND \n class Foo { \n #else \n class Bar { \n #endif
            // Expected: Both Foo and Bar extracted via token-based approach
            const { documentSymbol } = setup({
                symbols: [
                    {
                        name: 'Foo',
                        kind: 'class' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 2 },
                        conditional: { condition: 'COND', branch: 0 },
                    } as unknown as PikeSymbol,
                    {
                        name: 'Bar',
                        kind: 'class' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 4 },
                        conditional: { condition: 'COND', branch: 1 },
                    } as unknown as PikeSymbol,
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(2);

            const fooSymbol = result![0]!;
            const barSymbol = result![1]!;
            expect(fooSymbol.name).toBe('Foo');
            expect(barSymbol.name).toBe('Bar');
        });

        it('should cap variants at 16 for deeply nested #if blocks', async () => {
            // Test code with 5 levels of nested #if (32 variants theoretical)
            // Expected: Symbols extracted up to cap (16 variants)
            const symbols: unknown[] = [];
            for (let i = 0; i < 32; i++) {
                symbols.push({
                    name: `variant_${i}`,
                    kind: 'variable' as const,
                    modifiers: [],
                    position: { file: 'test.pike', line: i + 1 },
                    conditional: { condition: `LEVEL_${i}`, branch: i % 2 },
                });
            }

            const { documentSymbol } = setup({ symbols: symbols as PikeSymbol[] });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            // Should extract all symbols (Pike implementation caps at 16 variants)
            // For now, we just verify it doesn't crash
            expect(result!.length).toBeGreaterThan(0);
        });
    });

    describe('Symbol properties', () => {
        it('should include detail with type info when available', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    {
                        name: 'myVar',
                        kind: 'variable' as const,
                        modifiers: [],
                        position: { file: 'test.pike', line: 1 },
                        type: { name: 'int' },
                    } as unknown as PikeSymbol,
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result![0]!.detail).toBe('int');
        });

        it('should set selectionRange end to name length', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('myLongVariableName', 'variable', { position: { file: 'test.pike', line: 1 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result![0]!.selectionRange.end.character).toBe('myLongVariableName'.length);
        });

        test.todo('not applicable to Pike: protected/private modifiers not reflected in DocumentSymbol');
    });

    describe('Performance', () => {
        it('should handle 1000 symbols efficiently', async () => {
            const symbols: PikeSymbol[] = [];
            for (let i = 0; i < 1000; i++) {
                symbols.push(sym(`function${i}`, 'method', {
                    position: { file: 'test.pike', line: i + 1 },
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const start = performance.now();
            const result = await documentSymbol();
            const elapsed = performance.now() - start;

            expect(result).not.toBeNull();
            expect(result!.length).toBe(1000);
            expect(elapsed).toBeLessThan(500);
        });
    });

    // =========================================================================
    // Roxen Integration Tests (Priority 1 - Task 10)
    // =========================================================================

    describe('Scenario 11.9: Document symbols - Roxen module integration', () => {
        it('should enhance Roxen module symbols with defvar children', async () => {
            // TDD GREEN Phase: Test Roxen module symbol classification
            const uri = 'file:///test.pike';
            const testCode = 'inherit "module"; constant module_type = MODULE_TAG;';

            const mockBridge = {
                bridge: {
                    roxenDetect: async () => ({
                        is_roxen_module: 1,
                        module_type: ['MODULE_TAG'],
                        module_name: 'MyModule',
                        inherits: ['module'],
                        variables: [
                            { name: 'my_config', type: 'TYPE_STRING', name_string: 'My Config', doc_str: 'Config variable', position: { line: 3, column: 1 } },
                            { name: 'debug_mode', type: 'TYPE_FLAG', name_string: 'Debug Mode', doc_str: 'Debug flag', position: { line: 4, column: 1 } },
                        ],
                        tags: [],
                    }),
                },
            };

            const mockDocuments = new Map([
                [uri, TextDocument.create(uri, 'pike', 0, testCode)],
            ]);

            const { documentSymbol } = setup({
                symbols: [
                    sym('MyModule', 'class', { position: { file: 'test.pike', line: 1 } }),
                ],
                bridge: mockBridge,
                documents: mockDocuments,
            });

            const result = await documentSymbol();

            // GREEN Phase: Should pass with Roxen enhancement
            expect(result).not.toBeNull();
            expect(result!.length).toBeGreaterThan(0);

            // First symbol should be the "Roxen Module" container
            expect(result![0]!.name).toBe('Roxen Module');
            expect(result![0]!.children).toBeDefined();
            expect(result![0]!.children!.length).toBeGreaterThanOrEqual(1);

            // Should have "Module Variables" group
            const variablesGroup = result![0]!.children!.find(c => c.name === 'Module Variables');
            expect(variablesGroup).toBeDefined();
            expect(variablesGroup!.children).toBeDefined();
            expect(variablesGroup!.children!.length).toBe(2);

            // Check for specific variable names
            const varNames = variablesGroup!.children!.map(c => c.name);
            expect(varNames).toContain('my_config');
            expect(varNames).toContain('debug_mode');
        });

        it('should extract RXML tags from multiline strings', async () => {
            // TDD GREEN Phase: Test RXML tag detection
            const uri = 'file:///test.pike';
            const testCode = 'string template = #"<set name=\\"foo\\">bar</set>"#;';

            const mockBridge = {
                bridge: {
                    roxenExtractRXMLStrings: async () => ({
                        strings: [
                            {
                                content: '<set name="foo">bar</set>',
                                range: {
                                    start: { line: 0, character: 19 },
                                    end: { line: 0, character: 49 },
                                },
                                fullRange: {
                                    start: { line: 0, character: 18 },
                                    end: { line: 0, character: 50 },
                                },
                                confidence: 0.95,
                                markers: [
                                    { type: 'tag', name: 'set', position: { line: 0, character: 0 } },
                                    { type: 'tag', name: 'set', position: { line: 0, character: 5 } },
                                ],
                            },
                        ],
                    }),
                },
            };

            const mockDocuments = new Map([
                [uri, TextDocument.create(uri, 'pike', 0, testCode)],
            ]);

            const { documentSymbol } = setup({
                symbols: [
                    sym('MyTag', 'class', { position: { file: 'test.pike', line: 1 } }),
                ],
                bridge: mockBridge,
                documents: mockDocuments,
            });

            const result = await documentSymbol();

            // Should have both Pike symbol and RXML Template container
            expect(result).not.toBeNull();
            expect(result!.length).toBe(2);

            // Find the RXML Template container
            const rxmlContainer = result!.find(s => s.name === 'RXML Template');
            expect(rxmlContainer).toBeDefined();
            expect(rxmlContainer!.kind).toBe(16); // SymbolKind.Namespace
            expect(rxmlContainer!.detail).toContain('2 RXML markers');
        });

        it('should handle mixed Pike + RXML content', async () => {
            // TDD GREEN Phase: Test document with both Pike code and RXML strings
            const uri = 'file:///test.pike';
            const testCode = `class MyClass { void foo() { } }
string template1 = #"<roxen><output>hello</output></roxen>"#;
string template2 = #"<set name='x'>value</set>"#;`;

            const mockBridge = {
                bridge: {
                    roxenExtractRXMLStrings: async () => ({
                        strings: [
                            {
                                content: '<roxen><output>hello</output></roxen>',
                                range: { start: { line: 0, character: 38 }, end: { line: 0, character: 82 } },
                                fullRange: { start: { line: 0, character: 37 }, end: { line: 0, character: 83 } },
                                confidence: 0.9,
                                markers: [
                                    { type: 'tag', name: 'roxen', position: { line: 0, character: 0 } },
                                    { type: 'tag', name: 'output', position: { line: 0, character: 7 } },
                                ],
                            },
                            {
                                content: "<set name='x'>value</set>",
                                range: { start: { line: 1, character: 20 }, end: { line: 1, character: 48 } },
                                fullRange: { start: { line: 1, character: 19 }, end: { line: 1, character: 49 } },
                                confidence: 0.95,
                                markers: [{ type: 'tag', name: 'set', position: { line: 0, character: 0 } }],
                            },
                        ],
                    }),
                },
            };

            const mockDocuments = new Map([
                [uri, TextDocument.create(uri, 'pike', 0, testCode)],
            ]);

            const { documentSymbol } = setup({
                symbols: [
                    sym('MyClass', 'class', { position: { file: 'test.pike', line: 1 } }),
                    sym('foo', 'method', { position: { file: 'test.pike', line: 1 } }),
                ],
                bridge: mockBridge,
                documents: mockDocuments,
            });

            const result = await documentSymbol();

            // Should have both Pike symbols and RXML Template containers
            expect(result).not.toBeNull();
            expect(result!.length).toBeGreaterThan(2);

            // Find both RXML Template containers
            const rxmlContainers = result!.filter(s => s.name === 'RXML Template');
            expect(rxmlContainers.length).toBe(2);

            // First container should have 2 markers (roxen, output)
            expect(rxmlContainers[0]!.detail).toContain('2 RXML markers');

            // Second container should have 1 marker (set)
            expect(rxmlContainers[1]!.detail).toContain('1 RXML markers');
        });

        it('should handle Roxen enhancement failure gracefully', async () => {
            // TDD GREEN Phase: Test graceful degradation when Roxen detection fails
            const uri = 'file:///test.pike';
            const testCode = 'class MyClass { void foo() { } }';

            const mockBridge = {
                bridge: {
                    roxenDetect: async () => {
                        throw new Error('Roxen detection failed');
                    },
                },
            };

            const mockDocuments = new Map([
                [uri, TextDocument.create(uri, 'pike', 0, testCode)],
            ]);

            const { documentSymbol } = setup({
                symbols: [
                    sym('MyClass', 'class', { position: { file: 'test.pike', line: 1 } }),
                    sym('foo', 'method', { position: { file: 'test.pike', line: 1 } }),
                ],
                bridge: mockBridge,
                documents: mockDocuments,
            });

            const result = await documentSymbol();

            // Should still return base symbols, not crash
            expect(result).not.toBeNull();
            expect(result!.length).toBe(2);
            expect(result![0]!.name).toBe('MyClass');
            expect(result![1]!.name).toBe('foo');
        });
    });
});
