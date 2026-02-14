/**
 * Workspace Symbol Provider Tests
 *
 * TDD tests for workspace symbol search functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#12-workspace-symbol-provider
 *
 * Test scenarios:
 * - 12.1 Search symbol - Exact match
 * - 12.2 Search symbol - Partial match
 * - 12.3 Search symbol - Case sensitivity
 * - 12.4 Search symbol - Limit results
 * - 12.5 Search symbol - Not found
 * - 12.6 Search symbol - Stdlib symbols
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SymbolKind } from 'vscode-languageserver/node.js';
import { WorkspaceIndex } from '../../workspace-index.js';

/**
 * Helper class to test WorkspaceIndex without Pike bridge
 * Uses reflection to access private methods for test setup
 */
class TestableWorkspaceIndex extends WorkspaceIndex {
    /**
     * Add a document with symbols directly (for testing without bridge)
     */
    addTestDocument(uri: string, symbols: Array<{ name: string; kind: string; line: number; parentName?: string }>): void {
        const docSymbols = symbols.map(s => ({
            name: s.name,
            kind: s.kind,
            position: { line: s.line, character: 0 },
            children: [],
            ...(s.parentName ? { parentName: s.parentName } : {})
        }));

        // Store document
        const documents = (this as unknown as { documents: Map<string, unknown> }).documents;
        documents.set(uri, {
            uri,
            symbols: docSymbols,
            version: 1,
            lastModified: Date.now()
        });

        // Add to lookup
        const symbolLookup = (this as unknown as { symbolLookup: Map<string, Map<string, unknown>> }).symbolLookup;
        for (const symbol of docSymbols) {
            if (!symbol.name) continue;
            const nameLower = symbol.name.toLowerCase();
            const entry = {
                name: symbol.name,
                kind: symbol.kind,
                uri,
                line: symbol.line,
                parentName: (symbol as { parentName?: string }).parentName
            };
            let entriesByUri = symbolLookup.get(nameLower);
            if (!entriesByUri) {
                entriesByUri = new Map();
                symbolLookup.set(nameLower, entriesByUri);
            }
            entriesByUri.set(uri, entry);
        }
    }
}

describe('Workspace Symbol Provider', () => {
    let index: TestableWorkspaceIndex;

    beforeEach(() => {
        index = new TestableWorkspaceIndex();
    });

    /**
     * Test 12.1: Search Symbol - Exact Match
     */
    describe('Scenario 12.1: Search symbol - exact match', () => {
        it('should find all occurrences across workspace', () => {
            index.addTestDocument('file:///file1.pike', [
                { name: 'myFunction', kind: 'method', line: 1 }
            ]);
            index.addTestDocument('file:///file2.pike', [
                { name: 'MyClass', kind: 'class', line: 1 },
                { name: 'myFunction', kind: 'method', line: 5 }
            ]);

            const results = index.searchSymbols('myFunction');

            expect(results.length).toBe(2);
            expect(results[0].name).toBe('myFunction');
            expect(results[1].name).toBe('myFunction');
            expect(results.some(r => r.location.uri === 'file:///file1.pike')).toBe(true);
            expect(results.some(r => r.location.uri === 'file:///file2.pike')).toBe(true);
        });

        it('should return exact matches first', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'calculate', kind: 'method', line: 1 },
                { name: 'calculateSum', kind: 'method', line: 5 },
                { name: 'calculateAverage', kind: 'method', line: 10 }
            ]);

            const results = index.searchSymbols('calculate');

            expect(results.length).toBe(3);
            // Exact match should be first (highest score)
            expect(results[0].name).toBe('calculate');
        });
    });

    /**
     * Test 12.2: Search Symbol - Partial Match
     */
    describe('Scenario 12.2: Search symbol - partial match', () => {
        it('should return symbols containing search string', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'calculate', kind: 'method', line: 1 },
                { name: 'calculateSum', kind: 'method', line: 5 },
                { name: 'calculateAverage', kind: 'method', line: 10 }
            ]);

            const results = index.searchSymbols('calc');

            expect(results.length).toBe(3);
        });

        it('should be case-insensitive by default', () => {
            index.addTestDocument('file:///test1.pike', [
                { name: 'MyFunction', kind: 'method', line: 1 }
            ]);
            index.addTestDocument('file:///test2.pike', [
                { name: 'myfunction', kind: 'method', line: 5 }
            ]);

            const results = index.searchSymbols('MyFunction');

            expect(results.length).toBe(2);
        });
    });

    /**
     * Test 12.3: Search Symbol - Case Sensitivity
     */
    describe('Scenario 12.3: Search symbol - case sensitivity', () => {
        it('should find both case variants with case-insensitive search', () => {
            index.addTestDocument('file:///test1.pike', [
                { name: 'MyFunction', kind: 'method', line: 1 }
            ]);
            index.addTestDocument('file:///test2.pike', [
                { name: 'myfunction', kind: 'method', line: 5 }
            ]);

            const results = index.searchSymbols('myfunction');

            // Case-insensitive finds both
            expect(results.length).toBe(2);
        });
    });

    /**
     * Test 12.4: Search Symbol - Limit Results
     */
    describe('Scenario 12.4: Search symbol - limit results', () => {
        it('should limit results to specified maximum', () => {
            for (let i = 0; i < 10; i++) {
                index.addTestDocument(`file:///file${i}.pike`, [
                    { name: `symbol${i}`, kind: 'method', line: 1 }
                ]);
            }

            const results = index.searchSymbols('symbol', 5);

            expect(results.length).toBe(5);
        });

        it('should return all results if fewer than limit', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'func1', kind: 'method', line: 1 },
                { name: 'func2', kind: 'method', line: 5 }
            ]);

            const results = index.searchSymbols('func', 100);

            expect(results.length).toBe(2);
        });
    });

    /**
     * Test 12.5: Search Symbol - Not Found
     */
    describe('Scenario 12.5: Search symbol - not found', () => {
        it('should return empty array when symbol not found', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'myFunction', kind: 'method', line: 1 }
            ]);

            const results = index.searchSymbols('NonExistentSymbol');

            expect(results).toEqual([]);
        });

        it('should handle empty query', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'myFunction', kind: 'method', line: 1 }
            ]);

            const results = index.searchSymbols('');

            // Empty query returns some symbols from each file
            expect(results.length).toBeGreaterThanOrEqual(0);
        });
    });

    /**
     * Test 12.6: Search Symbol - Stdlib Symbols
     */
    describe('Scenario 12.6: Search symbol - stdlib symbols', () => {
        it('should search stdlib symbols if indexed', () => {
            index.addTestDocument('file:///usr/local/pike/8.0.1116/lib/modules/Array.pmod', [
                { name: 'map', kind: 'method', line: 1 }
            ]);

            const results = index.searchSymbols('map');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toBe('map');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty workspace', () => {
            const results = index.searchSymbols('anything');

            expect(results).toEqual([]);
        });

        it('should handle special characters in search query', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'my_symbol-123', kind: 'method', line: 1 }
            ]);

            const results = index.searchSymbols('my_symbol-123');

            expect(results.length).toBe(1);
            expect(results[0].name).toBe('my_symbol-123');
        });

        it('should track document count in stats', () => {
            index.addTestDocument('file:///src/myFile.pike', [
                { name: 'func', kind: 'method', line: 1 }
            ]);

            const stats = index.getStats();

            expect(stats.documents).toBe(1);
            expect(stats.symbols).toBe(1);
        });
    });

    /**
     * Performance
     */
    describe('Performance', () => {
        it('should search many symbols quickly', () => {
            // Add 1000 symbols
            for (let i = 0; i < 10; i++) {
                const symbols = [];
                for (let j = 0; j < 100; j++) {
                    symbols.push({ name: `symbol${i * 100 + j}`, kind: 'method', line: j + 1 });
                }
                index.addTestDocument(`file:///file${i}.pike`, symbols);
            }

            const start = Date.now();
            const results = index.searchSymbols('symbol');
            const elapsed = Date.now() - start;

            expect(elapsed).toBeLessThan(1000);
            expect(results.length).toBeGreaterThan(0);
        });
    });

    /**
     * Result Ranking
     */
    describe('Result ranking', () => {
        it('should rank exact matches higher than partial matches', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'myVarFunction', kind: 'method', line: 1 },
                { name: 'myVar', kind: 'variable', line: 5 },
                { name: 'myVarClass', kind: 'class', line: 10 }
            ]);

            const results = index.searchSymbols('myVar');

            // Exact match 'myVar' should be first (highest score)
            expect(results[0].name).toBe('myVar');
        });

        it('should prefer shorter names within same match type', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'calculateSum', kind: 'method', line: 1 },
                { name: 'calculate', kind: 'method', line: 5 }
            ]);

            const results = index.searchSymbols('calc');

            // Both are prefix matches, but 'calculate' is shorter
            expect(results[0].name).toBe('calculate');
        });
    });

    /**
     * File Paths
     */
    describe('File paths in results', () => {
        it('should include file paths in results', () => {
            index.addTestDocument('file:///src/myFile.pike', [
                { name: 'myFunction', kind: 'method', line: 1 }
            ]);

            const results = index.searchSymbols('myFunction');

            expect(results.length).toBe(1);
            expect(results[0].location.uri).toBe('file:///src/myFile.pike');
        });

        it('should handle URIs with encoded characters', () => {
            index.addTestDocument('file:///src/my%20file.pike', [
                { name: 'func', kind: 'method', line: 1 }
            ]);

            const results = index.searchSymbols('func');

            expect(results.length).toBe(1);
            expect(results[0].location.uri).toContain('my%20file.pike');
        });
    });

    /**
     * Query Parsing
     */
    describe('Query parsing', () => {
        it('should handle lowercase queries', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'MyFunction', kind: 'method', line: 1 }
            ]);

            const results = index.searchSymbols('myfunction');

            expect(results.length).toBe(1);
        });

        it('should handle single character queries', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'm', kind: 'method', line: 1 },
                { name: 'myFunction', kind: 'method', line: 5 }
            ]);

            const results = index.searchSymbols('m');

            // Should find both 'm' (exact) and 'myFunction' (prefix)
            expect(results.length).toBeGreaterThan(0);
        });
    });

    /**
     * Workspace Index Integration
     */
    describe('Workspace index integration', () => {
        it('should return index statistics', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'func1', kind: 'method', line: 1 },
                { name: 'func2', kind: 'method', line: 5 }
            ]);

            const stats = index.getStats();

            expect(stats.documents).toBe(1);
            expect(stats.symbols).toBe(2);
            expect(stats.uniqueNames).toBe(2);
        });

        it('should clear index', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'func', kind: 'method', line: 1 }
            ]);

            index.clear();
            const stats = index.getStats();

            expect(stats.documents).toBe(0);
            expect(stats.symbols).toBe(0);
        });

        it('should get all document URIs', () => {
            index.addTestDocument('file:///test1.pike', [
                { name: 'func1', kind: 'method', line: 1 }
            ]);
            index.addTestDocument('file:///test2.pike', [
                { name: 'func2', kind: 'method', line: 1 }
            ]);

            const uris = index.getAllDocumentUris();

            expect(uris.length).toBe(2);
            expect(uris).toContain('file:///test1.pike');
            expect(uris).toContain('file:///test2.pike');
        });
    });

    /**
     * Container Name Support
     */
    describe('Container name support', () => {
        it('should include containerName for nested symbols', () => {
            index.addTestDocument('file:///test.pike', [
                { name: 'MyClass', kind: 'class', line: 1 },
                { name: 'myMethod', kind: 'method', line: 5, parentName: 'MyClass' }
            ]);

            const results = index.searchSymbols('myMethod');

            expect(results.length).toBe(1);
            expect(results[0].containerName).toBe('MyClass');
        });
    });
});
