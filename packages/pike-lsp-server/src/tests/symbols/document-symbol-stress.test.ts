/**
 * Stress Tests for Document Symbols
 *
 * Comprehensive stress testing for document symbols (outline view) covering:
 * - Large file handling (100+ symbols, deeply nested)
 * - Performance under stress (large files, rapid requests)
 * - Edge cases with complex hierarchies
 * - Symbol navigation and outline
 * - Complex constructs (inheritance, nested classes, enums)
 *
 * These tests verify the document symbol provider handles various Pike constructs
 * correctly under stress conditions.
 */

import { describe, it, expect } from 'bun:test';
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
// Test Infrastructure: Helper Functions
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
// Stress Tests: Document Symbols
// =============================================================================

describe('Document Symbol Provider Stress Tests', () => {

    // =========================================================================
    // 1. Large File Stress Tests
    // =========================================================================

    describe('1. Large File Handling', () => {

        it('should handle file with 100+ symbols efficiently', async () => {
            const symbols: PikeSymbol[] = [];
            for (let i = 0; i < 150; i++) {
                symbols.push(sym(`field_${i}`, 'variable', {
                    position: { file: 'test.pike', line: i + 1 },
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const start = performance.now();
            const result = await documentSymbol();
            const elapsed = performance.now() - start;

            expect(result).not.toBeNull();
            expect(result!.length).toBe(150);
            expect(elapsed).toBeLessThan(100);
        });

        it('should handle file with 500 symbols', async () => {
            const symbols: PikeSymbol[] = [];
            for (let i = 0; i < 500; i++) {
                symbols.push(sym(`method_${i}`, 'method', {
                    position: { file: 'test.pike', line: i + 1 },
                    returnType: { name: 'void' },
                    argTypes: [],
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const start = performance.now();
            const result = await documentSymbol();
            const elapsed = performance.now() - start;

            expect(result).not.toBeNull();
            expect(result!.length).toBe(500);
            expect(elapsed).toBeLessThan(200);
        });

        it('should handle 1000 symbols within 500ms', async () => {
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

        it('should handle mixed symbol types in large file', async () => {
            const symbols: PikeSymbol[] = [];
            for (let i = 0; i < 100; i++) {
                // Mix of classes, methods, variables, constants
                if (i % 4 === 0) {
                    symbols.push(sym(`Class${i}`, 'class', {
                        position: { file: 'test.pike', line: i + 1 },
                    }));
                } else if (i % 4 === 1) {
                    symbols.push(sym(`method${i}`, 'method', {
                        position: { file: 'test.pike', line: i + 1 },
                    }));
                } else if (i % 4 === 2) {
                    symbols.push(sym(`var${i}`, 'variable', {
                        position: { file: 'test.pike', line: i + 1 },
                    }));
                } else {
                    symbols.push(sym(`CONST${i}`, 'constant', {
                        position: { file: 'test.pike', line: i + 1 },
                    }));
                }
            }

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(100);

            // Verify all symbol kinds are present
            const kinds = new Set(result!.map(s => s.kind));
            expect(kinds.has(SymbolKind.Class)).toBe(true);
            expect(kinds.has(SymbolKind.Method)).toBe(true);
            expect(kinds.has(SymbolKind.Variable)).toBe(true);
            expect(kinds.has(SymbolKind.Constant)).toBe(true);
        });
    });

    // =========================================================================
    // 2. Deeply Nested Class Hierarchy Stress Tests
    // =========================================================================

    describe('2. Deeply Nested Class Hierarchy', () => {

        it('should handle 10-level nested classes', async () => {
            const symbols: PikeSymbol[] = [];
            let currentLine = 1;

            // Build 10-level nesting
            symbols.push(sym('Level1', 'class', {
                position: { file: 'test.pike', line: currentLine++ },
                children: [
                    sym('Level2', 'class', {
                        position: { file: 'test.pike', line: currentLine++ },
                        children: [
                            sym('Level3', 'class', {
                                position: { file: 'test.pike', line: currentLine++ },
                                children: [
                                    sym('Level4', 'class', {
                                        position: { file: 'test.pike', line: currentLine++ },
                                        children: [
                                            sym('Level5', 'class', {
                                                position: { file: 'test.pike', line: currentLine++ },
                                                children: [
                                                    sym('Level6', 'class', {
                                                        position: { file: 'test.pike', line: currentLine++ },
                                                        children: [
                                                            sym('Level7', 'class', {
                                                                position: { file: 'test.pike', line: currentLine++ },
                                                                children: [
                                                                    sym('Level8', 'class', {
                                                                        position: { file: 'test.pike', line: currentLine++ },
                                                                        children: [
                                                                            sym('Level9', 'class', {
                                                                                position: { file: 'test.pike', line: currentLine++ },
                                                                                children: [
                                                                                    sym('Level10', 'class', {
                                                                                        position: { file: 'test.pike', line: currentLine++ },
                                                                                    }),
                                                                                ],
                                                                            }),
                                                                        ],
                                                                    }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }));

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);

            // Verify nested depth
            let current = result![0];
            let depth = 1;
            while (current.children && current.children.length > 0) {
                current = current.children[0];
                depth++;
            }
            expect(depth).toBe(10);
        });

        it('should handle 20-level nested classes', async () => {
            // Build 20-level nesting
            let nested: PikeSymbol = sym('Leaf', 'class', {
                position: { file: 'test.pike', line: 20 },
            });

            for (let i = 19; i >= 1; i--) {
                nested = sym(`Level${i}`, 'class', {
                    position: { file: 'test.pike', line: i },
                    children: [nested],
                }) as PikeSymbol;
            }

            const { documentSymbol } = setup({
                symbols: [sym('Level1', 'class', {
                    position: { file: 'test.pike', line: 1 },
                    children: [nested],
                })],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();

            // Verify we can traverse the depth (root + 20 levels = 21)
            let current = result![0];
            let depth = 1;
            while (current.children && current.children.length > 0) {
                current = current.children[0];
                depth++;
            }
            expect(depth).toBe(21);
        });

        it('should handle class with many nested members', async () => {
            const symbols: PikeSymbol[] = [];

            // Outer class with 50 nested members
            const children: PikeSymbol[] = [];
            for (let i = 0; i < 50; i++) {
                children.push(sym(`member_${i}`, 'method', {
                    position: { file: 'test.pike', line: i + 2 },
                }));
            }

            symbols.push(sym('Container', 'class', {
                position: { file: 'test.pike', line: 1 },
                children,
            }));

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);
            expect(result![0]!.children!.length).toBe(50);
        });

        it('should handle multiple sibling nested classes', async () => {
            const symbols: PikeSymbol[] = [];

            // Outer class with 10 nested classes, each with methods
            const children: PikeSymbol[] = [];
            for (let i = 0; i < 10; i++) {
                children.push(sym(`Nested${i}`, 'class', {
                    position: { file: 'test.pike', line: i * 5 + 2 },
                    children: [
                        sym(`method_a_${i}`, 'method', { position: { file: 'test.pike', line: i * 5 + 3 } }),
                        sym(`method_b_${i}`, 'method', { position: { file: 'test.pike', line: i * 5 + 4 } }),
                    ],
                }));
            }

            symbols.push(sym('Outer', 'class', {
                position: { file: 'test.pike', line: 1 },
                children,
            }));

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);
            expect(result![0]!.children!.length).toBe(10);

            // Each nested class should have 2 methods
            for (const child of result![0]!.children!) {
                expect(child.children!.length).toBe(2);
            }
        });
    });

    // =========================================================================
    // 3. Performance Stress Tests
    // =========================================================================

    describe('3. Performance', () => {

        it('should handle rapid consecutive document symbol requests', async () => {
            const symbols: PikeSymbol[] = [];
            for (let i = 0; i < 100; i++) {
                symbols.push(sym(`sym${i}`, 'variable', {
                    position: { file: 'test.pike', line: i + 1 },
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const start = performance.now();
            for (let i = 0; i < 50; i++) {
                await documentSymbol();
            }
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(1000); // 50 requests in 1 second
        });

        it('should handle concurrent requests with different files', async () => {
            const symbolsA: PikeSymbol[] = [];
            const symbolsB: PikeSymbol[] = [];
            const symbolsC: PikeSymbol[] = [];

            for (let i = 0; i < 100; i++) {
                symbolsA.push(sym(`a_${i}`, 'variable', {
                    position: { file: 'a.pike', line: i + 1 },
                }));
                symbolsB.push(sym(`b_${i}`, 'variable', {
                    position: { file: 'b.pike', line: i + 1 },
                }));
                symbolsC.push(sym(`c_${i}`, 'variable', {
                    position: { file: 'c.pike', line: i + 1 },
                }));
            }

            const setupA = setup({ symbols: symbolsA, uri: 'file:///a.pike' });
            const setupB = setup({ symbols: symbolsB, uri: 'file:///b.pike' });
            const setupC = setup({ symbols: symbolsC, uri: 'file:///c.pike' });

            const start = performance.now();
            const [resultA, resultB, resultC] = await Promise.all([
                setupA.documentSymbol(),
                setupB.documentSymbol(),
                setupC.documentSymbol(),
            ]);
            const elapsed = performance.now() - start;

            expect(resultA!.length).toBe(100);
            expect(resultB!.length).toBe(100);
            expect(resultC!.length).toBe(100);
            expect(elapsed).toBeLessThan(200);
        });

        it('should handle increasingly complex symbol hierarchies', async () => {
            // Test with exponential growth of children
            const sizes = [10, 50, 100, 200];

            for (const size of sizes) {
                const symbols: PikeSymbol[] = [];
                const children: PikeSymbol[] = [];
                for (let i = 0; i < size; i++) {
                    children.push(sym(`child_${i}`, 'method', {
                        position: { file: 'test.pike', line: i + 2 },
                    }));
                }

                symbols.push(sym('Root', 'class', {
                    position: { file: 'test.pike', line: 1 },
                    children,
                }));

                const { documentSymbol } = setup({ symbols });

                const start = performance.now();
                const result = await documentSymbol();
                const elapsed = performance.now() - start;

                expect(result!.length).toBe(1);
                expect(result![0]!.children!.length).toBe(size);
                expect(elapsed).toBeLessThan(200); // Should handle even 200 children quickly
            }
        });
    });

    // =========================================================================
    // 4. Edge Cases: Complex Constructs
    // =========================================================================

    describe('4. Complex Constructs', () => {

        it('should handle class with multiple inheritance', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('Derived', 'class', { position: { file: 'test.pike', line: 1 } }),
                    sym('Base1', 'inherit', { position: { file: 'test.pike', line: 2 } }),
                    sym('Base2', 'inherit', { position: { file: 'test.pike', line: 3 } }),
                    sym('Base3', 'inherit', { position: { file: 'test.pike', line: 4 } }),
                    sym('method1', 'method', { position: { file: 'test.pike', line: 5 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(5);
        });

        it('should handle enum with many members', async () => {
            const symbols: PikeSymbol[] = [
                sym('Color', 'enum', { position: { file: 'test.pike', line: 1 } }),
            ];

            for (let i = 0; i < 50; i++) {
                symbols.push(sym(`COLOR_${i}`, 'enum_constant', {
                    position: { file: 'test.pike', line: i + 2 },
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(51);
            expect(result![0]!.kind).toBe(SymbolKind.Enum);
        });

        it('should handle class with complex typedef members', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('MyClass', 'class', { position: { file: 'test.pike', line: 1 } }),
                    sym('CallbackType', 'typedef', { position: { file: 'test.pike', line: 2 } }),
                    sym('HandlerFunc', 'typedef', { position: { file: 'test.pike', line: 3 } }),
                    sym('ComplexType', 'typedef', { position: { file: 'test.pike', line: 4 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(4);

            // All typedefs should be TypeParameter kind
            const typedefs = result!.filter(s => s.kind === SymbolKind.TypeParameter);
            expect(typedefs.length).toBe(3);
        });

        it('should handle module with many imports and symbols', async () => {
            const symbols: PikeSymbol[] = [];

            symbols.push(sym('MyModule', 'module', { position: { file: 'test.pike', line: 1 } }));

            // Add many imports
            for (let i = 0; i < 20; i++) {
                symbols.push(sym(`Import${i}`, 'import', {
                    position: { file: 'test.pike', line: i + 2 },
                }));
            }

            // Add symbols in module
            for (let i = 0; i < 30; i++) {
                symbols.push(sym(`func${i}`, 'method', {
                    position: { file: 'test.pike', line: i + 22 },
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(51);
        });

        it('should handle lambda and function type symbols', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('myLambda', 'variable', {
                        position: { file: 'test.pike', line: 1 },
                        type: { name: 'function' },
                    }),
                    sym('callback', 'variable', {
                        position: { file: 'test.pike', line: 2 },
                        type: { name: 'function(int:string)' },
                    }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(2);
        });
    });

    // =========================================================================
    // 5. Symbol Navigation Edge Cases
    // =========================================================================

    describe('5. Symbol Navigation', () => {

        it('should provide accurate ranges for navigation', async () => {
            const symbols: PikeSymbol[] = [];

            for (let i = 0; i < 10; i++) {
                symbols.push(sym(`symbol_${i}`, 'method', {
                    position: { file: 'test.pike', line: i + 1 },
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();

            // Verify all symbols have valid ranges
            for (let i = 0; i < result!.length; i++) {
                const symbol = result![i];
                expect(symbol.range.start.line).toBe(i);
                expect(symbol.range.start.character).toBe(0);
                expect(symbol.selectionRange.end.character).toBe(`symbol_${i}`.length);
            }
        });

        it('should handle symbols with very long names', async () => {
            const longName = 'a'.repeat(200);
            const { documentSymbol } = setup({
                symbols: [
                    sym(longName, 'method', { position: { file: 'test.pike', line: 1 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result![0]!.name).toBe(longName);
            expect(result![0]!.selectionRange.end.character).toBe(200);
        });

        it('should preserve symbol order from input', async () => {
            const symbols: PikeSymbol[] = [];
            for (let i = 0; i < 50; i++) {
                symbols.push(sym(`Z${50 - i}`, 'variable', {
                    position: { file: 'test.pike', line: i + 1 },
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();

            // Verify order is preserved
            for (let i = 0; i < result!.length; i++) {
                expect(result![i]!.name).toBe(`Z${50 - i}`);
            }
        });

        it('should handle symbols with special Pike names', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('_private', 'variable', { position: { file: 'test.pike', line: 1 } }),
                    sym('__init__', 'method', { position: { file: 'test.pike', line: 2 } }),
                    sym('__eq__', 'method', { position: { file: 'test.pike', line: 3 } }),
                    sym('operator+', 'method', { position: { file: 'test.pike', line: 4 } }),
                    sym('test_123', 'method', { position: { file: 'test.pike', line: 5 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(5);
        });
    });

    // =========================================================================
    // 6. Error Handling and Edge Cases
    // =========================================================================

    describe('6. Error Handling', () => {

        it('should handle empty symbol list', async () => {
            const { documentSymbol } = setup({ symbols: [] });

            const result = await documentSymbol();
            expect(result).toEqual([]);
        });

        it('should handle null cache entry gracefully', async () => {
            const { documentSymbol } = setup({ noCache: true });

            const result = await documentSymbol();
            expect(result).toBeNull();
        });

        it('should handle symbols with null position', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('test', 'variable'), // No position
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result![0]!.name).toBe('test');
        });

        it('should handle duplicate symbol names gracefully', async () => {
            const { documentSymbol } = setup({
                symbols: [
                    sym('dup', 'variable', { position: { file: 'test.pike', line: 1 } }),
                    sym('dup', 'variable', { position: { file: 'test.pike', line: 3 } }),
                    sym('dup', 'method', { position: { file: 'test.pike', line: 5 } }),
                ],
            });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(3);
        });

        it('should handle symbol with unknown kind', async () => {
            // Should not crash, uses fallback kind
            const result = await setup({ symbols: [
                { name: 'unknown_symbol', kind: 'unknown' as any, modifiers: [] } as any,
            ]}).documentSymbol();
            expect(result).not.toBeNull();
        });
    });

    // =========================================================================
    // 7. Conditional Compilation Symbols
    // =========================================================================

    describe('7. Conditional Compilation', () => {

        it('should handle many conditional symbols', async () => {
            const symbols: PikeSymbol[] = [];

            for (let i = 0; i < 50; i++) {
                symbols.push({
                    name: `cond_var_${i}`,
                    kind: 'variable' as const,
                    modifiers: [],
                    position: { file: 'test.pike', line: i + 1 },
                    conditional: { condition: `COND_${i}`, branch: i % 2 },
                });
            }

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(50);
        });

        it('should handle nested conditionals', async () => {
            const symbols: PikeSymbol[] = [];

            for (let i = 0; i < 20; i++) {
                symbols.push({
                    name: `nested_${i}`,
                    kind: 'variable' as const,
                    modifiers: [],
                    position: { file: 'test.pike', line: i + 1 },
                    conditional: { condition: `A${i} && B${i}`, branch: 0 },
                });
            }

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(20);
        });
    });

    // =========================================================================
    // 8. Mixed Content Stress
    // =========================================================================

    describe('8. Mixed Content', () => {

        it('should handle file with all symbol types mixed', async () => {
            const symbols: PikeSymbol[] = [];
            let line = 1;

            // Mix classes, methods, variables, constants, enums, typedefs, imports, modules
            const types: Array<'class' | 'method' | 'variable' | 'constant' | 'enum' | 'enum_constant' | 'typedef' | 'import' | 'module'> = [
                'class', 'method', 'variable', 'constant', 'enum', 'enum_constant', 'typedef', 'import', 'module'
            ];

            for (let i = 0; i < 90; i++) {
                const type = types[i % types.length];
                symbols.push(sym(`${type}_${i}`, type, {
                    position: { file: 'test.pike', line: line++ },
                }));
            }

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(90);

            // Verify all kinds present
            const kinds = new Set(result!.map(s => s.kind));
            expect(kinds.has(SymbolKind.Class)).toBe(true);
            expect(kinds.has(SymbolKind.Method)).toBe(true);
            expect(kinds.has(SymbolKind.Variable)).toBe(true);
            expect(kinds.has(SymbolKind.Constant)).toBe(true);
            expect(kinds.has(SymbolKind.Enum)).toBe(true);
            expect(kinds.has(SymbolKind.EnumMember)).toBe(true);
            expect(kinds.has(SymbolKind.TypeParameter)).toBe(true);
            expect(kinds.has(SymbolKind.Module)).toBe(true);
        });

        it('should handle deeply nested mixed content', async () => {
            const symbols: PikeSymbol[] = [];

            // Build: class -> class -> method + variable + constant + enum
            const innerChildren: PikeSymbol[] = [
                sym('innerMethod', 'method', { position: { file: 'test.pike', line: 4 } }),
                sym('innerVar', 'variable', { position: { file: 'test.pike', line: 5 } }),
                sym('INNER_CONST', 'constant', { position: { file: 'test.pike', line: 6 } }),
                sym('InnerEnum', 'enum', {
                    position: { file: 'test.pike', line: 7 },
                    children: [
                        sym('A', 'enum_constant', { position: { file: 'test.pike', line: 8 } }),
                        sym('B', 'enum_constant', { position: { file: 'test.pike', line: 9 } }),
                    ],
                }),
            ];

            const outerChildren: PikeSymbol[] = [
                sym('OuterClass', 'class', {
                    position: { file: 'test.pike', line: 3 },
                    children: innerChildren,
                }),
                sym('outerMethod', 'method', { position: { file: 'test.pike', line: 10 } }),
                sym('outerVar', 'variable', { position: { file: 'test.pike', line: 11 } }),
            ];

            symbols.push(sym('RootClass', 'class', {
                position: { file: 'test.pike', line: 1 },
                children: outerChildren,
            }));

            const { documentSymbol } = setup({ symbols });

            const result = await documentSymbol();
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);

            // Root -> Outer (3 children: OuterClass, outerMethod, outerVar)
            expect(result![0]!.children!.length).toBe(3);
            const outerClass = result![0]!.children!.find(c => c.name === 'OuterClass');
            expect(outerClass).toBeDefined();

            // Outer -> Inner + methods
            expect(outerClass!.children!.length).toBe(4);
        });
    });
});

// =============================================================================
// Summary
// =============================================================================

describe('Document Symbols Stress Tests Summary', () => {

    it('report test coverage', () => {
        console.log('=== Document Symbol Provider Stress Test Summary ===');
        console.log('');
        console.log('Document Symbol Tests:');
        console.log('1. Large File Handling (4 tests)');
        console.log('2. Deeply Nested Class Hierarchy (4 tests)');
        console.log('3. Performance (3 tests)');
        console.log('4. Complex Constructs (5 tests)');
        console.log('5. Symbol Navigation (4 tests)');
        console.log('6. Error Handling (5 tests)');
        console.log('7. Conditional Compilation (2 tests)');
        console.log('8. Mixed Content (2 tests)');
        console.log('');
        console.log('Total: 29 stress tests');
        console.log('========================================================');
        expect(true).toBe(true);
    });
});
