/**
 * Pike LSP Server Tests
 * 
 * Automated tests that verify LSP protocol compliance and functionality.
 * Run with: node --test dist/tests/lsp-tests.js
 */

import { describe, it } from 'bun:test';
import * as assert from 'node:assert';
import { PikeBridge, PikeSymbol } from '@pike-lsp/pike-bridge';
import { buildCodeLensCommand } from '../utils/code-lens.js';

// LSP range validation - selectionRange must be contained in range
function validateDocumentSymbolRanges(
    symbol: { name: string; line: number },
    range: { start: { line: number; character: number }; end: { line: number; character: number } },
    selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } }
): void {
    // selectionRange.start must be >= range.start
    assert.ok(
        selectionRange.start.line > range.start.line ||
        (selectionRange.start.line === range.start.line && selectionRange.start.character >= range.start.character),
        `Symbol "${symbol.name}": selectionRange.start must be >= range.start`
    );

    // selectionRange.end must be <= range.end
    assert.ok(
        selectionRange.end.line < range.end.line ||
        (selectionRange.end.line === range.end.line && selectionRange.end.character <= range.end.character),
        `Symbol "${symbol.name}": selectionRange.end (line ${selectionRange.end.line}, char ${selectionRange.end.character}) must be <= range.end (line ${range.end.line}, char ${range.end.character})`
    );
}

// Simulate the convertSymbol function from server.ts
function convertSymbol(pikeSymbol: PikeSymbol): {
    name: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
} {
    const line = Math.max(0, (pikeSymbol.position?.line ?? 1) - 1);

    return {
        name: pikeSymbol.name,
        range: {
            start: { line, character: 0 },
            end: { line, character: 1000 }, // Full line range
        },
        selectionRange: {
            start: { line, character: 0 },
            end: { line, character: pikeSymbol.name.length },
        },
    };
}

describe('Pike Bridge Tests', () => {
    let bridge: PikeBridge;

    it('should start and stop bridge', async () => {
        bridge = new PikeBridge();
        await bridge.start();
        // If we get here without error, bridge started successfully
        await bridge.stop();
    });

    it('should parse Pike code and extract symbols', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int x = 5;
string name = "test";
void hello(string msg) {}
class MyClass {}
`, 'test.pike');

        assert.ok(result.symbols.length >= 4, `Expected at least 4 symbols, got ${result.symbols.length}`);

        const symbolNames = result.symbols.map(s => s.name);
        assert.ok(symbolNames.includes('x'), 'Should find variable x');
        assert.ok(symbolNames.includes('name'), 'Should find variable name');
        assert.ok(symbolNames.includes('hello'), 'Should find method hello');
        assert.ok(symbolNames.includes('MyClass'), 'Should find class MyClass');

        await bridge.stop();
    });

    it('should detect syntax errors', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.compile('int x = ;', 'error.pike');

        assert.ok(result.diagnostics.length >= 1, 'Should have at least 1 diagnostic');
        const firstDiag = result.diagnostics[0];
        assert.ok(firstDiag, 'First diagnostic should exist');
        assert.strictEqual(firstDiag.severity, 'error', 'Should be error severity');

        await bridge.stop();
    });

    it('should tokenize Pike code', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const tokens = await bridge.tokenize('int x = 5;');

        assert.ok(tokens.length > 0, 'Should have tokens');
        const textTokens = tokens.map(t => t.text.trim()).filter(t => t);
        assert.ok(textTokens.includes('int'), 'Should have int token');
        assert.ok(textTokens.includes('x'), 'Should have x token');

        await bridge.stop();
    });
});

describe('LSP Document Symbol Range Validation', () => {
    let bridge: PikeBridge;

    it('should produce valid DocumentSymbol ranges', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int counter = 0;
string message = "hello";
void greet(string name) {}
class Person { int age; }
constant VERSION = "1.0";
`, 'test.pike');

        for (const pikeSymbol of result.symbols) {
            const docSymbol = convertSymbol(pikeSymbol);

            // This must not throw - validates LSP compliance
            validateDocumentSymbolRanges(
                { name: docSymbol.name, line: docSymbol.range.start.line },
                docSymbol.range,
                docSymbol.selectionRange
            );
        }

        await bridge.stop();
    });

    it('should handle symbols with long names', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int very_long_variable_name_that_might_cause_issues = 42;
`, 'test.pike');

        for (const pikeSymbol of result.symbols) {
            const docSymbol = convertSymbol(pikeSymbol);
            validateDocumentSymbolRanges(
                { name: docSymbol.name, line: docSymbol.range.start.line },
                docSymbol.range,
                docSymbol.selectionRange
            );
        }

        await bridge.stop();
    });
});

describe('LSP Code Lens Command Payload', () => {
    it('should build a references command payload with position and symbol name', () => {
        const command = buildCodeLensCommand(2, 'file:///test.pike', { line: 3, character: 7 }, 'test_function');

        assert.strictEqual(command.command, 'pike.showReferences', 'Should use Pike show references command');
        assert.strictEqual(command.title, '2 references', 'Should pluralize title correctly');
        assert.deepStrictEqual(command.arguments, [
            'file:///test.pike',
            { line: 3, character: 7 },
            'test_function'
        ]);
    });

    it('should format singular reference titles', () => {
        const command = buildCodeLensCommand(1, 'file:///test.pike', { line: 0, character: 0 }, 'single_ref');

        assert.strictEqual(command.title, '1 reference', 'Should use singular title for 1 reference');
    });
});

describe('Pike Type Detection', () => {
    let bridge: PikeBridge;

    it('should detect correct symbol kinds', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int x = 5;
void foo() {}
class Bar {}
`, 'test.pike');

        const kinds = new Map(result.symbols.map(s => [s.name, s.kind]));

        assert.strictEqual(kinds.get('x'), 'variable', 'x should be variable');
        assert.strictEqual(kinds.get('foo'), 'method', 'foo should be method');
        assert.strictEqual(kinds.get('Bar'), 'class', 'Bar should be class');

        await bridge.stop();
    });

    it('should extract type information', async () => {
        bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.parse(`
int x = 5;
string name = "test";
array(int) nums = ({});
mapping(string:int) lookup = ([]);
`, 'test.pike');

        // Check that types are present in symbols
        for (const symbol of result.symbols) {
            const sym = symbol as unknown as Record<string, unknown>;
            if (symbol.kind === 'variable') {
                assert.ok(sym['type'], `Variable ${symbol.name} should have type`);
                const type = sym['type'] as { name?: string };
                assert.ok(type.name, `Variable ${symbol.name} should have type.name`);
            }
        }

        await bridge.stop();
    });
});

// Run all tests
console.log('Running Pike LSP Tests...\n');
