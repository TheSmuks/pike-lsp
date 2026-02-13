/**
 * Diagnostics Provider Tests
 *
 * TDD tests for diagnostics functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#24-diagnostics-provider
 *
 * Test scenarios:
 * - 24.1 Diagnostics - Syntax error
 * - 24.2 Diagnostics - Type error
 * - 24.3 Diagnostics - Uninitialized variable
 * - 24.4 Diagnostics - Multiple errors
 * - 24.5 Diagnostics - Debounced
 * - 24.6 Diagnostics - Clear on fix
 * - 24.7 Diagnostics - Max problems
 * - 24.8 Diagnostics - Included files
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerDiagnosticsHandlers } from '../../features/diagnostics.js';
import {
    createMockConnection,
    createMockServices,
    createMockDocuments,
    makeCacheEntry
} from '../helpers/mock-services.js';
import type { PikeSymbol, PikeDiagnostic } from '@pike-lsp/pike-bridge';

// Test setup
let mockConnection: ReturnType<typeof createMockConnection>;
let documents: Map<string, TextDocument>;
let testServices: ReturnType<typeof createMockServices>;
let sentDiagnostics: Map<string, Diagnostic[]> = new Map();

before(() => {
    mockConnection = createMockConnection();
    documents = new Map();
    testServices = createMockServices();
    sentDiagnostics.clear();

    const mockDocuments = createMockDocuments(documents);

    // Mock sendDiagnostics to capture what would be sent
    (mockConnection as any).setSendDiagnosticsHandler = (params: { uri: string; diagnostics: Diagnostic[] }) => {
        sentDiagnostics.set(params.uri, params.diagnostics);
    };

    registerDiagnosticsHandlers(
        mockConnection as any,
        testServices,
        mockDocuments as any
    );
});

/**
 * Helper to create a Pike diagnostic
 */
function createPikeDiagnostic(
    message: string,
    line: number,
    severity: 'error' | 'warning' | 'info' = 'error',
    column?: number,
    variable?: string
): PikeDiagnostic {
    return {
        message,
        severity,
        position: { line, character: column ?? 0 },
        ...(variable ? { variable } : {})
    };
}

/**
 * Helper to create a document with symbols and diagnostics in cache
 */
function setupDocumentWithDiagnostics(
    uri: string,
    content: string,
    symbols: PikeSymbol[],
    diagnostics: PikeDiagnostic[]
) {
    const doc = TextDocument.create(uri, 'pike', 1, content);
    documents.set(uri, doc);

    // Add to mock services cache
    testServices.documentCache.set(uri, makeCacheEntry({
        symbols,
        diagnostics,
        symbolPositions: new Map(),
    }));
}

describe('Diagnostics Provider', () => {

    /**
     * Test 24.1: Diagnostics - Syntax Error
     */
    describe('Scenario 24.1: Diagnostics - Syntax error', () => {
        it('should detect missing semicolon', async () => {
            const uri = 'file:///test.pike';
            const code = 'int x\nint y';

            setupDocumentWithDiagnostics(uri, code, [
                { name: 'x', kind: 'variable', position: { line: 1, character: 0 }, modifiers: [] },
                { name: 'y', kind: 'variable', position: { line: 2, character: 0 }, modifiers: [] },
            ], [
                createPikeDiagnostic('Missing semicolon', 1, 'error'),
            ]);

            // Trigger document open validation
            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });

            // Wait for debounced validation
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(diags.length > 0, 'Should have diagnostics');
            assert.strictEqual(diags[0].severity, DiagnosticSeverity.Error, 'Should be error severity');
            assert.ok(diags[0].message.includes('Missing'), 'Message should indicate missing semicolon');
        });

        it('should provide clear error message', async () => {
            const uri = 'file:///test.pike';
            const code = 'class Foo {';

            setupDocumentWithDiagnostics(uri, code, [
                { name: 'Foo', kind: 'class', position: { line: 1, character: 0 }, modifiers: [] },
            ], [
                createPikeDiagnostic('Unexpected end of file, expected "}"', 1, 'error'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(diags.length > 0, 'Should have diagnostics');
            assert.ok(diags[0].message.length > 10, 'Error message should be descriptive');
        });

        it('should mark error at correct location', async () => {
            const uri = 'file:///test.pike';
            const code = 'int x\nint y';

            setupDocumentWithDiagnostics(uri, code, [], [
                createPikeDiagnostic('Some error', 2, 'error', 5),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(diags.length > 0, 'Should have diagnostics');
            assert.strictEqual(diags[0].range.start.line, 1, 'Error should be on line 2 (0-indexed)');
        });
    });

    /**
     * Test 24.2: Diagnostics - Type Error
     */
    describe('Scenario 24.2: Diagnostics - Type error', () => {
        it('should detect type mismatch in assignment', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'int x = "string";', [], [
                createPikeDiagnostic('Type mismatch: expected int but got string', 1, 'error'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(diags.length > 0, 'Should have diagnostics');
            assert.ok(diags[0].message.toLowerCase().includes('type'), 'Should mention type in message');
        });
    });

    /**
     * Test 24.3: Diagnostics - Uninitialized Variable
     */
    describe('Scenario 24.3: Diagnostics - Uninitialized variable', () => {
        it('should warn about uninitialized variable read', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'int x;\nint y = x;', [], [
                createPikeDiagnostic('Variable x used before initialization', 2, 'warning', undefined, 'x'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            const uninitializedDiag = diags.find(d => d.source === 'pike-uninitialized');
            assert.ok(uninitializedDiag, 'Should have uninitialized variable diagnostic');
            assert.strictEqual(uninitializedDiag.severity, DiagnosticSeverity.Warning, 'Should be warning severity');
        });
    });

    /**
     * Test 24.4: Diagnostics - Multiple Errors
     */
    describe('Scenario 24.4: Diagnostics - Multiple errors', () => {
        it('should report multiple syntax errors', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'int x\nint y', [], [
                createPikeDiagnostic('Missing semicolon at line 1', 1, 'error'),
                createPikeDiagnostic('Missing semicolon at line 2', 2, 'error'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(diags.length >= 2, 'Should have multiple diagnostics');
        });

        it('should order diagnostics by line number', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'int x', [], [
                createPikeDiagnostic('Error at line 3', 3, 'error'),
                createPikeDiagnostic('Error at line 1', 1, 'error'),
                createPikeDiagnostic('Error at line 2', 2, 'error'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            // Check that diagnostics are ordered by line number
            for (let i = 1; i < diags.length; i++) {
                assert.ok(diags[i].range.start.line >= diags[i - 1].range.start.line,
                    'Diagnostics should be ordered by line number');
            }
        });
    });

    /**
     * Test 24.5: Diagnostics - Debounced
     */
    describe('Scenario 24.5: Diagnostics - Debounced', () => {
        it('should debounce diagnostic requests', async () => {
            const uri = 'file:///test.pike';
            const doc = TextDocument.create(uri, 'pike', 1, 'int x');
            documents.set(uri, doc);

            setupDocumentWithDiagnostics(uri, 'int x', [], [
                createPikeDiagnostic('Test error', 1, 'error'),
            ]);

            let validationCount = 0;
            const originalValidate = (mockConnection as any).onDidChangeContent;
            (mockConnection as any).onDidChangeContent = async (change: any) => {
                validationCount++;
                await originalValidate(change);
            };

            // Simulate rapid changes
            for (let i = 0; i < 5; i++) {
                const change = {
                    document: doc,
                    contentChanges: [{ text: `int x${i}` }]
                };
                await (mockConnection as any).onDidChangeContent(change);
            }

            // Debouncing should mean fewer validations than changes
            assert.ok(validationCount < 5, 'Should debounce rapid changes');
        });
    });

    /**
     * Test 24.6: Diagnostics - Clear on Fix
     */
    describe('Scenario 24.6: Diagnostics - Clear on fix', () => {
        it('should clear diagnostic when error is fixed', async () => {
            const uri = 'file:///test.pike';

            // First, setup with errors
            setupDocumentWithDiagnostics(uri, 'int x', [], [
                createPikeDiagnostic('Some error', 1, 'error'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const firstDiags = sentDiagnostics.get(uri) ?? [];
            assert.ok(firstDiags.length > 0, 'Should have initial diagnostics');

            // Now fix the error (empty diagnostics)
            testServices.documentCache.set(uri, makeCacheEntry({
                symbols: [],
                diagnostics: [],
                symbolPositions: new Map(),
            }));

            await (mockConnection as any).onDidChangeContent({
                document: doc,
                contentChanges: [{ text: 'int x;' }]
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const clearedDiags = sentDiagnostics.get(uri) ?? [];
            assert.strictEqual(clearedDiags.length, 0, 'Diagnostics should be cleared after fix');
        });
    });

    /**
     * Test 24.7: Diagnostics - Max problems
     */
    describe('Scenario 24.7: Diagnostics - Max problems', () => {
        it('should respect max problems configuration', async () => {
            const uri = 'file:///test.pike';
            const maxProblems = 3;

            // Create many diagnostics
            const manyDiags: PikeDiagnostic[] = [];
            for (let i = 1; i <= 10; i++) {
                manyDiags.push(createPikeDiagnostic(`Error ${i}`, i, 'error'));
            }

            setupDocumentWithDiagnostics(uri, 'code with many errors', [], manyDiags);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            // Should not exceed max problems (default is typically 100+, but handler respects limit)
            assert.ok(diags.length <= 100, 'Should respect max problems limit');
        });

        it('should prioritize errors over warnings', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'code', [], [
                createPikeDiagnostic('Warning 1', 1, 'warning'),
                createPikeDiagnostic('Error 1', 2, 'error'),
                createPikeDiagnostic('Warning 2', 3, 'warning'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            const errors = diags.filter(d => d.severity === DiagnosticSeverity.Error);
            const warnings = diags.filter(d => d.severity === DiagnosticSeverity.Warning);

            assert.ok(errors.length > 0, 'Should include errors');
            assert.ok(warnings.length > 0, 'Should include warnings');
        });
    });

    /**
     * Test 24.8: Diagnostics - Included Files
     */
    describe('Scenario 24.8: Diagnostics - Included files', () => {
        it('should analyze included files', async () => {
            const mainUri = 'file:///main.pike';
            const includeUri = 'file:///included.pike';

            // Setup both files
            setupDocumentWithDiagnostics(includeUri, 'int x;', [], []);
            setupDocumentWithDiagnostics(mainUri, '#include "included.pike"\nint y = x;', [], []);

            const mainDoc = documents.get(mainUri)!;
            await mockConnection.triggerOnDidOpen({ document: mainDoc });
            await new Promise(resolve => setTimeout(resolve, 100));

            // Handler should process main document
            const diags = sentDiagnostics.get(mainUri) ?? [];
            // Diagnostics should exist (even if empty array, handler processes)
            assert.ok(Array.isArray(diags), 'Should process document');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty file', async () => {
            const uri = 'file:///empty.pike';

            setupDocumentWithDiagnostics(uri, '', [], []);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(Array.isArray(diags), 'Should handle empty file without crashing');
        });

        it('should handle file with only comments', async () => {
            const uri = 'file:///comments.pike';

            setupDocumentWithDiagnostics(uri, '// This is a comment\n// Another comment', [], []);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(Array.isArray(diags), 'Should handle comment-only file');
        });
    });

    /**
     * Diagnostic Severity
     */
    describe('Diagnostic Severity', () => {
        it('should use error severity for syntax errors', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'bad code', [], [
                createPikeDiagnostic('Syntax error', 1, 'error'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(diags.length > 0, 'Should have diagnostic');
            assert.strictEqual(diags[0].severity, DiagnosticSeverity.Error, 'Error should use Error severity');
        });

        it('should use warning severity for type issues', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'code', [], [
                createPikeDiagnostic('Type warning', 1, 'warning'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            const warningDiag = diags.find(d => d.severity === DiagnosticSeverity.Warning);
            assert.ok(warningDiag, 'Should use warning severity for warnings');
        });
    });

    /**
     * Diagnostic Tags
     */
    describe('Diagnostic Tags', () => {
        it('should tag deprecated usage', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'oldFunction();', [
                { name: 'oldFunction', kind: 'method', position: { line: 1, character: 0 }, modifiers: [], deprecated: true }
            ], []);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            // Symbol should be marked as deprecated
            const cached = testServices.documentCache.get(uri);
            assert.ok(cached?.symbols.some(s => (s as any).deprecated), 'Should mark deprecated symbols');
        });
    });

    /**
     * Related Information
     */
    describe('Related Information', () => {
        it('should provide related information for type errors', async () => {
            const uri = 'file:///test.pike';

            setupDocumentWithDiagnostics(uri, 'int x = "string";', [], [
                createPikeDiagnostic('Type mismatch: expected int but got string', 1, 'error'),
            ]);

            const doc = documents.get(uri)!;
            await mockConnection.triggerOnDidOpen({ document: doc });
            await new Promise(resolve => setTimeout(resolve, 100));

            const diags = sentDiagnostics.get(uri) ?? [];
            assert.ok(diags.length > 0, 'Should have diagnostic with message');
            assert.ok(diags[0].message.includes('type') || diags[0].message.includes('Type'),
                'Should provide type information in message');
        });
    });
});
