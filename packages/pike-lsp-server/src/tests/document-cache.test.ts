/**
 * Document Cache Tests
 *
 * Tests for the document cache that stores parsed symbols and diagnostics:
 * - Basic CRUD operations (get, set, delete, has)
 * - Iteration methods (entries, keys)
 * - Cache clearing
 * - Version tracking
 * - Multiple document management
 *
 * Run with: bun test dist/src/tests/document-cache.test.js
 */

import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import { DocumentCache } from '../services/document-cache.js';
import type { DocumentCacheEntry } from '../core/types.js';
import { DiagnosticSeverity, type Position } from 'vscode-languageserver/node.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock DocumentCacheEntry for testing.
 * Uses 'as DocumentCacheEntry' to allow partial/mock data in tests.
 */
function createMockEntry(overrides: {
    version?: number;
    symbols?: any[];
    diagnostics?: any[];
    symbolPositions?: Map<string, Position[]>;
} = {}): DocumentCacheEntry {
    return {
        version: overrides.version ?? 1,
        symbols: overrides.symbols ?? [],
        diagnostics: overrides.diagnostics ?? [],
        symbolPositions: overrides.symbolPositions ?? new Map<string, Position[]>(),
    } as DocumentCacheEntry;
}

// ============================================================================
// Unit Tests - Basic Operations
// ============================================================================

describe('DocumentCache - Basic Operations', () => {
    it('should return undefined for non-existent document', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act
        const result = cache.get('file:///test.pike');

        // Assert
        assert.equal(result, undefined);
    });

    it('should store and retrieve a document', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        const entry = createMockEntry({ version: 1 });

        // Act
        cache.set(uri, entry);
        const result = cache.get(uri);

        // Assert
        assert.ok(result);
        assert.equal(result!.version, 1);
    });

    it('should overwrite existing document with same URI', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        const entry1 = createMockEntry({ version: 1 });
        const entry2 = createMockEntry({ version: 2 });

        // Act
        cache.set(uri, entry1);
        cache.set(uri, entry2);
        const result = cache.get(uri);

        // Assert
        assert.equal(result!.version, 2, 'Should have updated version');
    });

    it('should report has() correctly', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';

        // Assert - before adding
        assert.equal(cache.has(uri), false);

        // Act
        cache.set(uri, createMockEntry());

        // Assert - after adding
        assert.equal(cache.has(uri), true);
        assert.equal(cache.has('file:///other.pike'), false);
    });

    it('should delete a document', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        cache.set(uri, createMockEntry());

        // Act
        const deleted = cache.delete(uri);

        // Assert
        assert.equal(deleted, true, 'Should return true when document existed');
        assert.equal(cache.has(uri), false, 'Document should be removed');
    });

    it('should return false when deleting non-existent document', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act
        const deleted = cache.delete('file:///nonexistent.pike');

        // Assert
        assert.equal(deleted, false);
    });

    it('should track size correctly', () => {
        // Arrange
        const cache = new DocumentCache();

        // Assert - initial
        assert.equal(cache.size, 0);

        // Act & Assert
        cache.set('file:///a.pike', createMockEntry());
        assert.equal(cache.size, 1);

        cache.set('file:///b.pike', createMockEntry());
        assert.equal(cache.size, 2);

        cache.delete('file:///a.pike');
        assert.equal(cache.size, 1);
    });
});

// ============================================================================
// Unit Tests - Clear Operation
// ============================================================================

describe('DocumentCache - Clear Operation', () => {
    it('should clear all documents', () => {
        // Arrange
        const cache = new DocumentCache();
        cache.set('file:///a.pike', createMockEntry());
        cache.set('file:///b.pike', createMockEntry());
        cache.set('file:///c.pike', createMockEntry());

        // Act
        cache.clear();

        // Assert
        assert.equal(cache.size, 0);
        assert.equal(cache.has('file:///a.pike'), false);
        assert.equal(cache.has('file:///b.pike'), false);
        assert.equal(cache.has('file:///c.pike'), false);
    });

    it('should handle clear on empty cache', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act & Assert - should not throw
        cache.clear();
        assert.equal(cache.size, 0);
    });
});

// ============================================================================
// Unit Tests - Iteration Methods
// ============================================================================

describe('DocumentCache - Iteration Methods', () => {
    it('should iterate over entries', () => {
        // Arrange
        const cache = new DocumentCache();
        cache.set('file:///a.pike', createMockEntry({ version: 1 }));
        cache.set('file:///b.pike', createMockEntry({ version: 2 }));

        // Act
        const entries = Array.from(cache.entries());

        // Assert
        assert.equal(entries.length, 2);
        const uris = entries.map(([uri]) => uri);
        assert.ok(uris.includes('file:///a.pike'));
        assert.ok(uris.includes('file:///b.pike'));
    });

    it('should iterate over keys', () => {
        // Arrange
        const cache = new DocumentCache();
        cache.set('file:///a.pike', createMockEntry());
        cache.set('file:///b.pike', createMockEntry());

        // Act
        const keys = Array.from(cache.keys());

        // Assert
        assert.equal(keys.length, 2);
        assert.ok(keys.includes('file:///a.pike'));
        assert.ok(keys.includes('file:///b.pike'));
    });

    it('should return empty iterators for empty cache', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act
        const entries = Array.from(cache.entries());
        const keys = Array.from(cache.keys());

        // Assert
        assert.equal(entries.length, 0);
        assert.equal(keys.length, 0);
    });
});

// ============================================================================
// Unit Tests - Version Tracking
// ============================================================================

describe('DocumentCache - Version Tracking', () => {
    it('should store document version', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';

        // Act
        cache.set(uri, createMockEntry({ version: 5 }));

        // Assert
        assert.equal(cache.get(uri)!.version, 5);
    });

    it('should update version on document change', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        cache.set(uri, createMockEntry({ version: 1 }));

        // Act - Simulate document update
        cache.set(uri, createMockEntry({ version: 2 }));

        // Assert
        assert.equal(cache.get(uri)!.version, 2);
    });

    it('should preserve other entry properties on update', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        // Using 'as any' since we only need partial symbol data for cache testing
        const symbols = [{ name: 'test', kind: 'method', modifiers: [], position: { line: 1, column: 1 } }] as any;

        // Act
        cache.set(uri, createMockEntry({
            version: 1,
            symbols,
        }));

        // Assert
        const entry = cache.get(uri);
        assert.equal(entry!.symbols.length, 1);
        assert.equal(entry!.symbols[0]!.name, 'test');
    });
});

// ============================================================================
// Unit Tests - Symbol Positions Index
// ============================================================================

describe('DocumentCache - Symbol Positions Index', () => {
    it('should store symbol positions map', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        const positions = new Map<string, Position[]>();
        positions.set('counter', [
            { line: 0, character: 4 },
            { line: 5, character: 4 },
        ]);

        // Act
        cache.set(uri, createMockEntry({ symbolPositions: positions }));

        // Assert
        const entry = cache.get(uri);
        assert.ok(entry!.symbolPositions);
        assert.equal(entry!.symbolPositions.size, 1);
        assert.equal(entry!.symbolPositions.get('counter')!.length, 2);
    });

    it('should support looking up symbol positions', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        const positions = new Map<string, Position[]>();
        positions.set('myFunction', [
            { line: 10, character: 5 },
            { line: 20, character: 8 },
            { line: 30, character: 4 },
        ]);

        cache.set(uri, createMockEntry({ symbolPositions: positions }));

        // Act
        const entry = cache.get(uri);
        const functionPositions = entry!.symbolPositions.get('myFunction');

        // Assert
        assert.ok(functionPositions);
        assert.equal(functionPositions!.length, 3);
        assert.equal(functionPositions![0]!.line, 10);
        assert.equal(functionPositions![1]!.line, 20);
        assert.equal(functionPositions![2]!.line, 30);
    });
});

// ============================================================================
// Unit Tests - Diagnostics Storage
// ============================================================================

describe('DocumentCache - Diagnostics Storage', () => {
    it('should store diagnostics array', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        const diagnostics = [
            {
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 10 },
                },
                message: 'Test error',
                severity: DiagnosticSeverity.Error,
            },
        ] as any;

        // Act
        cache.set(uri, createMockEntry({ diagnostics }));

        // Assert
        const entry = cache.get(uri);
        assert.equal(entry!.diagnostics.length, 1);
        assert.equal(entry!.diagnostics[0]!.message, 'Test error');
    });

    it('should store multiple diagnostics', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        const diagnostics = [
            { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, message: 'Error 1', severity: DiagnosticSeverity.Error },
            { range: { start: { line: 5, character: 0 }, end: { line: 5, character: 5 } }, message: 'Warning 1', severity: DiagnosticSeverity.Warning },
            { range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } }, message: 'Info 1', severity: DiagnosticSeverity.Information },
        ] as any;

        // Act
        cache.set(uri, createMockEntry({ diagnostics }));

        // Assert
        const entry = cache.get(uri);
        assert.equal(entry!.diagnostics.length, 3);
    });
});

// ============================================================================
// Unit Tests - Multiple Documents
// ============================================================================

describe('DocumentCache - Multiple Documents', () => {
    it('should handle multiple documents independently', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act
        cache.set('file:///a.pike', createMockEntry({ version: 1 }));
        cache.set('file:///b.pike', createMockEntry({ version: 2 }));
        cache.set('file:///c.pike', createMockEntry({ version: 3 }));

        // Assert
        assert.equal(cache.get('file:///a.pike')!.version, 1);
        assert.equal(cache.get('file:///b.pike')!.version, 2);
        assert.equal(cache.get('file:///c.pike')!.version, 3);
    });

    it('should delete one document without affecting others', () => {
        // Arrange
        const cache = new DocumentCache();
        cache.set('file:///a.pike', createMockEntry({ version: 1 }));
        cache.set('file:///b.pike', createMockEntry({ version: 2 }));

        // Act
        cache.delete('file:///a.pike');

        // Assert
        assert.equal(cache.has('file:///a.pike'), false);
        assert.equal(cache.has('file:///b.pike'), true);
        assert.equal(cache.get('file:///b.pike')!.version, 2);
    });

    it('should update one document without affecting others', () => {
        // Arrange
        const cache = new DocumentCache();
        cache.set('file:///a.pike', createMockEntry({ version: 1 }));
        cache.set('file:///b.pike', createMockEntry({ version: 2 }));

        // Act
        cache.set('file:///a.pike', createMockEntry({ version: 10 }));

        // Assert
        assert.equal(cache.get('file:///a.pike')!.version, 10);
        assert.equal(cache.get('file:///b.pike')!.version, 2);
    });
});

// ============================================================================
// Unit Tests - Edge Cases
// ============================================================================

describe('DocumentCache - Edge Cases', () => {
    it('should handle URIs with special characters', () => {
        // Arrange
        const cache = new DocumentCache();
        const specialUri = 'file:///path/with spaces/and-dashes/test%20file.pike';

        // Act
        cache.set(specialUri, createMockEntry({ version: 1 }));

        // Assert
        assert.ok(cache.has(specialUri));
        assert.equal(cache.get(specialUri)!.version, 1);
    });

    it('should handle URIs with different schemes', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act
        cache.set('file:///local.pike', createMockEntry({ version: 1 }));
        cache.set('untitled:Untitled-1', createMockEntry({ version: 2 }));
        cache.set('vscode-notebook-cell://test/cell', createMockEntry({ version: 3 }));

        // Assert
        assert.equal(cache.size, 3);
        assert.equal(cache.get('file:///local.pike')!.version, 1);
        assert.equal(cache.get('untitled:Untitled-1')!.version, 2);
    });

    it('should handle empty symbols array', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act
        cache.set('file:///empty.pike', createMockEntry({ symbols: [] }));

        // Assert
        const entry = cache.get('file:///empty.pike');
        assert.ok(entry);
        assert.equal(entry!.symbols.length, 0);
    });

    it('should handle empty diagnostics array', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act
        cache.set('file:///clean.pike', createMockEntry({ diagnostics: [] }));

        // Assert
        const entry = cache.get('file:///clean.pike');
        assert.ok(entry);
        assert.equal(entry!.diagnostics.length, 0);
    });

    it('should handle empty symbolPositions map', () => {
        // Arrange
        const cache = new DocumentCache();

        // Act
        cache.set('file:///nopositions.pike', createMockEntry({
            symbolPositions: new Map(),
        }));

        // Assert
        const entry = cache.get('file:///nopositions.pike');
        assert.ok(entry);
        assert.equal(entry!.symbolPositions.size, 0);
    });

    it('should handle very long URIs', () => {
        // Arrange
        const cache = new DocumentCache();
        const longPath = 'a'.repeat(1000);
        const longUri = `file:///${longPath}/test.pike`;

        // Act
        cache.set(longUri, createMockEntry());

        // Assert
        assert.ok(cache.has(longUri));
    });

    it('should handle case-sensitive URIs', () => {
        // Arrange - URIs should be case-sensitive
        const cache = new DocumentCache();

        // Act
        cache.set('file:///Test.pike', createMockEntry({ version: 1 }));
        cache.set('file:///test.pike', createMockEntry({ version: 2 }));

        // Assert
        assert.equal(cache.size, 2, 'URIs with different case should be treated as different');
        assert.equal(cache.get('file:///Test.pike')!.version, 1);
        assert.equal(cache.get('file:///test.pike')!.version, 2);
    });
});

// ============================================================================
// Unit Tests - Symbols Storage
// ============================================================================

describe('DocumentCache - Symbols Storage', () => {
    it('should store symbols with all properties', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        // Using 'as any' since we only need partial symbol data for cache testing
        const symbols = [
            {
                name: 'myFunction',
                kind: 'method',
                position: { line: 10, column: 1 },
                children: [
                    { name: 'localVar', kind: 'variable', position: { line: 11, column: 5 } },
                ],
            },
        ] as any;

        // Act
        cache.set(uri, createMockEntry({ symbols }));

        // Assert
        const entry = cache.get(uri);
        assert.equal(entry!.symbols.length, 1);
        assert.equal(entry!.symbols[0]!.name, 'myFunction');
        assert.equal(entry!.symbols[0]!.kind, 'method');
        assert.ok(entry!.symbols[0]!.children);
        assert.equal(entry!.symbols[0]!.children!.length, 1);
    });

    it('should store nested symbol hierarchies', () => {
        // Arrange
        const cache = new DocumentCache();
        const uri = 'file:///test.pike';
        // Using 'as any' since we only need partial symbol data for cache testing
        const symbols = [
            {
                name: 'MyClass',
                kind: 'class',
                position: { line: 1, column: 1 },
                children: [
                    {
                        name: 'myMethod',
                        kind: 'method',
                        position: { line: 2, column: 5 },
                        children: [
                            { name: 'localVar', kind: 'variable', position: { line: 3, column: 9 } },
                        ],
                    },
                ],
            },
        ] as any;

        // Act
        cache.set(uri, createMockEntry({ symbols }));

        // Assert
        const entry = cache.get(uri);
        const classSymbol = entry!.symbols[0]!;
        assert.equal(classSymbol.name, 'MyClass');
        assert.equal(classSymbol.children![0]!.name, 'myMethod');
        assert.equal(classSymbol.children![0]!.children![0]!.name, 'localVar');
    });
});
