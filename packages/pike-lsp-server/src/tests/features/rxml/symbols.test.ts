/**
 * RXML Document Symbol Provider Tests
 *
 * Tests for RXML template document symbols (outline view) functionality.
 * Follows Phase 2 of ROXEN_SUPPORT_ROADMAP.md.
 */

import { describe, it, expect } from 'bun:test';
import { DocumentSymbol } from 'vscode-languageserver/node.js';
import { provideRXMLSymbols } from '../../../features/rxml/symbols.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';

// =============================================================================
// Mock TextDocument
// =============================================================================

function createMockDocument(content: string, uri = 'file:///test.html'): TextDocument {
    return {
        uri,
        languageId: 'html',
        version: 1,
        getText: () => content,
        lineCount: content.split('\n').length,
        positionAt: (offset: number) => {
            const text = content.substring(0, offset);
            const lines = text.split('\n');
            return {
                line: lines.length - 1,
                character: lines[lines.length - 1].length
            };
        },
        offsetAt: () => 0
    } as TextDocument;
}

// =============================================================================
// RXML Symbols Tests
// =============================================================================

describe('RXML Document Symbol Provider', () => {

    describe('provideRXMLSymbols', () => {
        it('should return empty array for document with no RXML tags', () => {
            const content = `
                <html>
                    <body>
                        <p>Hello World</p>
                    </body>
                </html>
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toEqual([]);
        });

        it('should return empty array for empty document', () => {
            const doc = createMockDocument('');
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toEqual([]);
        });

        it('should extract flat RXML tags', () => {
            const content = `
                <set variable="foo">bar</set>
                <set variable="baz">qux</set>
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toHaveLength(2);
            expect(symbols[0].name).toBe('set');
            expect(symbols[0].kind).toBe(5); // Function
            expect(symbols[1].name).toBe('set');
            expect(symbols[1].kind).toBe(5);
        });

        it('should build hierarchy for nested container tags', () => {
            const content = `
                <roxen>
                    <container name="box">
                        <contents>...</contents>
                    </container>
                </roxen>
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('roxen');
            expect(symbols[0].children).toBeDefined();
            expect(symbols[0].children).toHaveLength(1);
            expect(symbols[0].children![0].name).toBe('container');
            expect(symbols[0].children![0].children).toHaveLength(1);
            expect(symbols[0].children![0].children![0].name).toBe('contents');
        });

        it('should handle mixed content (nested and flat tags)', () => {
            const content = `
                <set variable="title">My Page</set>
                <roxen>
                    <container name="box">
                        <contents>...</contents>
                    </container>
                </roxen>
                <emit source="sql">SELECT * FROM table</emit>
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toHaveLength(3);
            expect(symbols[0].name).toBe('set');
            expect(symbols[1].name).toBe('roxen');
            expect(symbols[1].children).toHaveLength(1);
            expect(symbols[2].name).toBe('emit');
        });

        it('should include selectionRange for all symbols', () => {
            const content = `<set variable="foo">bar</set>`;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toHaveLength(1);
            const symbol = symbols[0];

            expect(symbol.selectionRange).toBeDefined();
            expect(symbol.range).toBeDefined();
            expect(symbol.selectionRange.start.line).toBeGreaterThanOrEqual(0);
            expect(symbol.selectionRange.start.character).toBeGreaterThanOrEqual(0);
        });

        it('should handle self-closing RXML tags', () => {
            const content = `
                <output variable="foo" />
                <config variable="baz" />
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toHaveLength(2);
            expect(symbols[0].name).toBe('output');
            expect(symbols[1].name).toBe('config');
        });

        it('should handle deeply nested RXML structures', () => {
            const content = `
                <roxen>
                    <container name="outer">
                        <container name="middle">
                            <contents>...</contents>
                        </container>
                    </container>
                </roxen>
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('roxen');
            expect(symbols[0].children![0].name).toBe('container');
            expect(symbols[0].children![0].children![0].name).toBe('container');
            expect(symbols[0].children![0].children![0].children![0].name).toBe('contents');
        });

        it('should handle attributes in tag names for detail field', () => {
            const content = `
                <set variable="foo">bar</set>
                <emit source="sql">SELECT * FROM table</emit>
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toHaveLength(2);
            expect(symbols[0].detail).toBeDefined();
            expect(symbols[0].detail).toContain('variable');
            expect(symbols[1].detail).toContain('source');
        });

        it('should handle malformed XML gracefully', () => {
            const content = `
                <set variable="foo">bar
                <emit source="sql">SELECT * FROM table</emit>
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            // Should extract what it can, not crash
            expect(Array.isArray(symbols)).toBe(true);
            expect(symbols.length).toBeGreaterThanOrEqual(0);
        });

        it('should handle comments and processing instructions', () => {
            const content = `
                <!-- This is a comment -->
                <?xml version="1.0" ?>
                <set variable="foo">bar</set>
            `;
            const doc = createMockDocument(content);
            const symbols = provideRXMLSymbols(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('set');
        });
    });
});
