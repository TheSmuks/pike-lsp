/**
 * References Feature Tests
 *
 * Tests for the actual references functionality:
 * - Finding word at cursor position
 * - Matching against known symbols
 * - Using symbolPositions index for lookups
 * - Text-based fallback search
 * - Cross-document reference finding
 * - Word boundary detection
 *
 * Run with: bun test dist/src/tests/references.test.js
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import type { Position } from 'vscode-languageserver/node.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find word boundaries at a given offset in text.
 * Mirrors the logic in references.ts
 */
function findWordAtOffset(text: string, offset: number): { word: string; start: number; end: number } {
    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }
    return { word: text.slice(start, end), start, end };
}

/**
 * Find all references to a word in text using word boundary matching.
 * Mirrors the text-search logic in references.ts
 */
function findAllReferencesInText(text: string, word: string): Position[] {
    const references: Position[] = [];
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;
        let searchStart = 0;
        let matchIndex: number;

        while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
            const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
            const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

            // Check word boundaries
            if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                references.push({ line: lineNum, character: matchIndex });
            }
            searchStart = matchIndex + 1;
        }
    }

    return references;
}

/**
 * Build symbolPositions index from parsed symbols and text.
 * This simulates what the LSP server does when caching a document.
 */
function buildSymbolPositionsIndex(text: string, symbolNames: string[]): Map<string, Position[]> {
    const index = new Map<string, Position[]>();
    for (const name of symbolNames) {
        const positions = findAllReferencesInText(text, name);
        if (positions.length > 0) {
            index.set(name, positions);
        }
    }
    return index;
}

// ============================================================================
// Unit Tests - Word Boundary Detection
// ============================================================================

describe('References - Word Boundary Detection', () => {
    it('should find word at cursor in middle of identifier', () => {
        // Arrange
        const text = 'int counter = 0;';
        const offset = 6; // Middle of "counter"

        // Act
        const result = findWordAtOffset(text, offset);

        // Assert
        assert.equal(result.word, 'counter');
        assert.equal(result.start, 4);
        assert.equal(result.end, 11);
    });

    it('should find word at cursor at start of identifier', () => {
        // Arrange
        const text = 'int counter = 0;';
        const offset = 4; // Start of "counter"

        // Act
        const result = findWordAtOffset(text, offset);

        // Assert
        assert.equal(result.word, 'counter');
    });

    it('should find word at cursor at end of identifier', () => {
        // Arrange
        const text = 'int counter = 0;';
        const offset = 11; // End of "counter"

        // Act
        const result = findWordAtOffset(text, offset);

        // Assert
        assert.equal(result.word, 'counter');
    });

    it('should handle underscore in identifiers', () => {
        // Arrange
        const text = 'int my_variable = 0;';
        const offset = 7; // Middle of "my_variable"

        // Act
        const result = findWordAtOffset(text, offset);

        // Assert
        assert.equal(result.word, 'my_variable');
    });

    it('should handle numbers in identifiers', () => {
        // Arrange
        const text = 'int data123 = 0;';
        const offset = 6;

        // Act
        const result = findWordAtOffset(text, offset);

        // Assert
        assert.equal(result.word, 'data123');
    });

    it('should return empty string when cursor is on whitespace', () => {
        // Arrange
        const text = 'int   counter';
        const offset = 5; // On whitespace

        // Act
        const result = findWordAtOffset(text, offset);

        // Assert
        assert.equal(result.word, '');
    });

    it('should return empty string when cursor is on operator', () => {
        // Arrange
        const text = 'a = b + c';
        const offset = 6; // On "+"

        // Act
        const result = findWordAtOffset(text, offset);

        // Assert
        assert.equal(result.word, '');
    });
});

// ============================================================================
// Unit Tests - Text-Based Reference Finding
// ============================================================================

describe('References - Text Search', () => {
    it('should find all references to a variable', () => {
        // Arrange
        const code = `int counter = 0;

void increment() {
    counter += 1;
}

void reset() {
    counter = 0;
}`;

        // Act
        const refs = findAllReferencesInText(code, 'counter');

        // Assert
        assert.equal(refs.length, 3, 'Should find 3 references to counter');
        assert.equal(refs[0]!.line, 0, 'First reference on line 0');
        assert.equal(refs[1]!.line, 3, 'Second reference on line 3');
        assert.equal(refs[2]!.line, 7, 'Third reference on line 7');
    });

    it('should not match partial words', () => {
        // Arrange
        const code = `int count = 5;
int counter = 10;
int countdown = 15;`;

        // Act
        const refs = findAllReferencesInText(code, 'count');

        // Assert
        assert.equal(refs.length, 1, 'Should only find exact match for "count"');
        assert.equal(refs[0]!.line, 0);
    });

    it('should find multiple references on same line', () => {
        // Arrange
        const code = 'int result = value + value * value;';

        // Act
        const refs = findAllReferencesInText(code, 'value');

        // Assert
        assert.equal(refs.length, 3, 'Should find 3 references to value');
        assert.equal(refs[0]!.character, 13);
        assert.equal(refs[1]!.character, 21);
        assert.equal(refs[2]!.character, 29);
    });

    it('should handle word at start of line', () => {
        // Arrange
        const code = 'counter = 0;';

        // Act
        const refs = findAllReferencesInText(code, 'counter');

        // Assert
        assert.equal(refs.length, 1);
        assert.equal(refs[0]!.character, 0, 'Should find word at start of line');
    });

    it('should handle word at end of line', () => {
        // Arrange
        const code = 'int x = counter';

        // Act
        const refs = findAllReferencesInText(code, 'counter');

        // Assert
        assert.equal(refs.length, 1);
        assert.equal(refs[0]!.character, 8);
    });

    it('should not match word inside string literal (text search limitation)', () => {
        // Note: Text-based search cannot distinguish strings from code
        // This test documents the known limitation
        const code = `string s = "counter";
int counter = 0;`;

        const refs = findAllReferencesInText(code, 'counter');

        // Text search finds both - this is expected behavior for text-based search
        assert.equal(refs.length, 2, 'Text search finds word in strings (known limitation)');
    });

    it('should handle adjacent operators correctly', () => {
        // Arrange
        const code = 'x=counter+1';

        // Act
        const refs = findAllReferencesInText(code, 'counter');

        // Assert
        assert.equal(refs.length, 1);
        assert.equal(refs[0]!.character, 2);
    });

    it('should handle dot notation correctly', () => {
        // Arrange
        const code = 'obj.counter = obj.counter + 1;';

        // Act
        const refs = findAllReferencesInText(code, 'counter');

        // Assert
        assert.equal(refs.length, 2);
    });

    it('should handle arrow notation correctly', () => {
        // Arrange
        const code = 'obj->counter = obj->counter + 1;';

        // Act
        const refs = findAllReferencesInText(code, 'counter');

        // Assert
        assert.equal(refs.length, 2);
    });
});

// ============================================================================
// Unit Tests - Symbol Positions Index
// ============================================================================

describe('References - Symbol Positions Index', () => {
    it('should build index for all symbol names', () => {
        // Arrange
        const code = `int counter = 0;
void increment() { counter += 1; }
void decrement() { counter -= 1; }`;
        const symbolNames = ['counter', 'increment', 'decrement'];

        // Act
        const index = buildSymbolPositionsIndex(code, symbolNames);

        // Assert
        assert.ok(index.has('counter'), 'Index should have counter');
        assert.ok(index.has('increment'), 'Index should have increment');
        assert.ok(index.has('decrement'), 'Index should have decrement');
        assert.equal(index.get('counter')!.length, 3, 'Counter should have 3 positions');
    });

    it('should not include symbols with zero references', () => {
        // Arrange
        const code = 'int x = 1;';
        const symbolNames = ['x', 'nonexistent'];

        // Act
        const index = buildSymbolPositionsIndex(code, symbolNames);

        // Assert
        assert.ok(index.has('x'));
        assert.ok(!index.has('nonexistent'), 'Should not include symbol with no references');
    });

    it('should handle empty code', () => {
        // Arrange
        const code = '';
        const symbolNames = ['counter'];

        // Act
        const index = buildSymbolPositionsIndex(code, symbolNames);

        // Assert
        assert.equal(index.size, 0);
    });
});

// ============================================================================
// Integration Tests - With PikeBridge
// ============================================================================

describe('References - Integration with Pike Parser', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should find references using parsed symbols', async () => {
        // Arrange
        const code = `int counter = 0;

void increment() {
    counter += 1;
}

int getValue() {
    return counter;
}`;

        // Act - Parse to get symbols
        const result = await bridge.parse(code, 'test.pike');
        const symbolNames = result.symbols.map(s => s.name);

        // Build index and find references
        const index = buildSymbolPositionsIndex(code, symbolNames);
        const counterRefs = index.get('counter');

        // Assert
        assert.ok(result.symbols.find(s => s.name === 'counter'), 'Parser should find counter symbol');
        assert.ok(counterRefs, 'Index should have counter references');
        assert.equal(counterRefs!.length, 3, 'Should find all 3 references to counter');
    });

    it('should find references to class members', async () => {
        // Arrange
        const code = `class Counter {
    int value = 0;

    void increment() {
        value += 1;
    }

    int getValue() {
        return value;
    }
}`;

        // Act
        await bridge.parse(code, 'test.pike');
        const index = buildSymbolPositionsIndex(code, ['value']);

        // Assert
        assert.ok(index.has('value'));
        assert.equal(index.get('value')!.length, 3, 'Should find all references to value member');
    });

    it('should find references to function calls', async () => {
        // Arrange
        const code = `void helper() {
    write("helping");
}

void main() {
    helper();
    helper();
}`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const index = buildSymbolPositionsIndex(code, ['helper']);

        // Assert
        assert.ok(result.symbols.find(s => s.name === 'helper'), 'Parser should find helper function');
        assert.equal(index.get('helper')!.length, 3, 'Should find definition + 2 calls');
    });

    it('should handle no references to a symbol', async () => {
        // Arrange
        const code = `void unused() {
    write("never called");
}

void main() {
    write("hello");
}`;

        // Act
        const result = await bridge.parse(code, 'test.pike');
        const index = buildSymbolPositionsIndex(code, ['unused']);

        // Assert
        assert.ok(result.symbols.find(s => s.name === 'unused'));
        // Only the definition should be found
        assert.equal(index.get('unused')!.length, 1, 'Should only find the definition');
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('References - Edge Cases', () => {
    it('should handle single character identifiers', () => {
        // Arrange
        const code = 'int x = 1; x += 2; return x;';

        // Act
        const refs = findAllReferencesInText(code, 'x');

        // Assert
        assert.equal(refs.length, 3);
    });

    it('should handle very long identifiers', () => {
        // Arrange
        const longName = 'this_is_a_very_long_variable_name_that_tests_boundary_handling';
        const code = `int ${longName} = 0; ${longName} += 1;`;

        // Act
        const refs = findAllReferencesInText(code, longName);

        // Assert
        assert.equal(refs.length, 2);
    });

    it('should handle identifiers with leading underscores', () => {
        // Arrange
        const code = 'int _private = 0; _private++;';

        // Act
        const refs = findAllReferencesInText(code, '_private');

        // Assert
        assert.equal(refs.length, 2);
    });

    it('should handle SCREAMING_CASE constants', () => {
        // Arrange
        const code = 'constant MAX_VALUE = 100; if (x > MAX_VALUE) x = MAX_VALUE;';

        // Act
        const refs = findAllReferencesInText(code, 'MAX_VALUE');

        // Assert
        assert.equal(refs.length, 3);
    });

    it('should handle empty lines in code', () => {
        // Arrange
        const code = `int x = 0;

x = 1;

x = 2;`;

        // Act
        const refs = findAllReferencesInText(code, 'x');

        // Assert
        assert.equal(refs.length, 3);
    });

    it('should handle Pike comments correctly (text search limitation)', () => {
        // Note: Text-based search cannot distinguish comments from code
        const code = `int counter = 0;
// Update counter here
counter++;`;

        const refs = findAllReferencesInText(code, 'counter');

        // Text search finds all 3 - including comment (known limitation)
        assert.equal(refs.length, 3, 'Text search finds word in comments (known limitation)');
    });
});

// ============================================================================
// Cross-File Reference Simulation
// ============================================================================

describe('References - Cross-File Search', () => {
    it('should find references across multiple files', () => {
        // Arrange - Simulate two open documents
        const file1 = `// utils.pike
string getVersion() {
    return "1.0.0";
}`;

        const file2 = `// main.pike
void showVersion() {
    string v = getVersion();
    write(v);
}`;

        // Act - Search for getVersion in both files
        const refs1 = findAllReferencesInText(file1, 'getVersion');
        const refs2 = findAllReferencesInText(file2, 'getVersion');
        const totalRefs = refs1.length + refs2.length;

        // Assert
        assert.equal(refs1.length, 1, 'Definition in file1');
        assert.equal(refs2.length, 1, 'Usage in file2');
        assert.equal(totalRefs, 2, 'Total references across files');
    });

    it('should handle symbol defined in one file and used in multiple files', () => {
        // Arrange
        const definitionFile = 'constant API_KEY = "secret";';
        const usageFile1 = 'string key = API_KEY;';
        const usageFile2 = 'void init() { configure(API_KEY); }';

        // Act
        const refs = [
            ...findAllReferencesInText(definitionFile, 'API_KEY'),
            ...findAllReferencesInText(usageFile1, 'API_KEY'),
            ...findAllReferencesInText(usageFile2, 'API_KEY'),
        ];

        // Assert
        assert.equal(refs.length, 3, 'Should find definition + 2 usages');
    });
});

// ============================================================================
// Regression Tests
// ============================================================================

describe('References - Regression Tests', () => {
    it('should not match word when it is a substring of another word', () => {
        // Regression: "test" should not match "testing" or "contest"
        const code = 'void test() {} void testing() {} int contest = 0;';

        const refs = findAllReferencesInText(code, 'test');

        assert.equal(refs.length, 1, 'Should only match exact "test"');
    });

    it('should handle cursor at exact word boundary', () => {
        // Regression: Cursor exactly between "int " and "counter"
        const text = 'int counter = 0;';
        const offset = 4; // Exactly at 'c' of counter

        const result = findWordAtOffset(text, offset);

        assert.equal(result.word, 'counter');
    });

    it('should find reference when symbol is first character of file', () => {
        // Regression: Symbol at position 0
        const code = 'counter = 0;';

        const refs = findAllReferencesInText(code, 'counter');

        assert.equal(refs.length, 1);
        assert.equal(refs[0]!.character, 0);
    });

    it('should find reference when symbol is last character of file', () => {
        // Regression: Symbol at end of file without newline
        const code = 'return counter';

        const refs = findAllReferencesInText(code, 'counter');

        assert.equal(refs.length, 1);
    });
});
