import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import {
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    Range,
    SymbolKind
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerHierarchyHandlers } from '../../features/hierarchy.js';
import {
    createMockHierarchyConnection,
    createMockServices,
    createMockDocuments,
    makeCacheEntry,
    sym
} from '../helpers/mock-services.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

// Test setup
let mockConnection: ReturnType<typeof createMockHierarchyConnection>;
let documents: Map<string, TextDocument>;
let testServices: ReturnType<typeof createMockServices>;
const testUri = 'file:///test.pike';

before(() => {
    mockConnection = createMockHierarchyConnection();
    documents = new Map();
    testServices = createMockServices();

    const mockDocuments = createMockDocuments(documents);

    registerHierarchyHandlers(
        mockConnection as any,
        testServices,
        mockDocuments as any
    );
});

// Helper to create a test document with content
function setupDocument(content: string, symbols: PikeSymbol[]) {
    const doc = TextDocument.create(
        testUri,
        'pike',
        0,
        content
    );
    documents.set(testUri, doc);

    const symbolPositions = new Map<string, { line: number; character: number }[]>();
    for (const symbol of symbols) {
        if (symbol.position) {
            const pos = { line: (symbol.position.line ?? 1) - 1, character: symbol.position.character ?? 0 };
            if (!symbolPositions.has(symbol.name)) {
                symbolPositions.set(symbol.name, []);
            }
            symbolPositions.get(symbol.name)!.push(pos);
        }
    }

    (testServices.documentCache as any).set(testUri, makeCacheEntry({
        symbols,
        symbolPositions
    }));
}

describe('Call Hierarchy Provider', () => {
    describe('onPrepare', () => {
        it('should return null when document is not cached', async () => {
            documents.clear();
            (testServices.documentCache as any).set = () => {};

            const handler = mockConnection.callHierarchyPrepareHandler;
            assert.ok(handler, 'Prepare handler should be registered');

            const result = await handler!({
                textDocument: { uri: testUri },
                position: { line: 0, character: 5 }
            });

            assert.strictEqual(result, null, 'Should return null for uncached document');
        });

        it('should return CallHierarchyItem for method at position', async () => {
            const content = 'int myFunction() {\n  return 1;\n}';
            setupDocument(content, [
                sym('myFunction', 'method', { position: { line: 1, character: 4 } })
            ]);

            const handler = mockConnection.callHierarchyPrepareHandler;
            const result = await handler!({
                textDocument: { uri: testUri },
                position: { line: 0, character: 8 }
            });

            assert.ok(result, 'Should return a result');
            assert.strictEqual(result!.length, 1, 'Should return one item');
            assert.strictEqual(result![0].name, 'myFunction', 'Item name should match');
            assert.strictEqual(result![0].kind, SymbolKind.Method, 'Item kind should be Method');
            assert.strictEqual(result![0].uri, testUri, 'Item URI should match');
        });

        it('should return null when position is not on a method', async () => {
            const content = 'int x = 5;';
            setupDocument(content, []);

            const handler = mockConnection.callHierarchyPrepareHandler;
            const result = await handler!({
                textDocument: { uri: testUri },
                position: { line: 0, character: 5 }
            });

            assert.strictEqual(result, null, 'Should return null for non-method position');
        });
    });

    describe('onIncomingCalls', () => {
        it('should return empty array when no cached documents', async () => {
            (testServices.documentCache as any).set = () => {};

            const handler = mockConnection.callHierarchyIncomingCallsHandler;
            assert.ok(handler, 'Incoming calls handler should be registered');

            const result = await handler!({
                item: {
                    name: 'testFunc',
                    kind: SymbolKind.Method,
                    uri: testUri,
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
                    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } }
                }
            });

            assert.deepStrictEqual(result, [], 'Should return empty array');
        });

        it('should find incoming calls from other methods in same file', async () => {
            const content = `
void caller1() {
    testFunc();
}

void testFunc() {
    return 1;
}

void caller2() {
    testFunc();
}
`;
            setupDocument(content, [
                sym('caller1', 'method', { position: { line: 2, character: 0 } }),
                sym('testFunc', 'method', { position: { line: 6, character: 0 } }),
                sym('caller2', 'method', { position: { line: 10, character: 0 } })
            ]);

            const handler = mockConnection.callHierarchyIncomingCallsHandler;
            const result = await handler!({
                item: {
                    name: 'testFunc',
                    kind: SymbolKind.Method,
                    uri: testUri,
                    range: { start: { line: 5, character: 0 }, end: { line: 5, character: 8 } },
                    selectionRange: { start: { line: 5, character: 0 }, end: { line: 5, character: 8 } }
                }
            });

            assert.ok(result, 'Should return results');
            assert.strictEqual(result!.length, 2, 'Should find 2 callers');
            assert.strictEqual(result![0].from.name, 'caller1', 'First caller should be caller1');
            assert.strictEqual(result![1].from.name, 'caller2', 'Second caller should be caller2');
        });
    });

    describe('onOutgoingCalls', () => {
        it('should return empty array when document not cached', async () => {
            (testServices.documentCache as any).set = () => {};

            const handler = mockConnection.callHierarchyOutgoingCallsHandler;
            assert.ok(handler, 'Outgoing calls handler should be registered');

            const result = await handler!({
                item: {
                    name: 'testFunc',
                    kind: SymbolKind.Method,
                    uri: testUri,
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
                    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } }
                }
            });

            assert.deepStrictEqual(result, [], 'Should return empty array');
        });

        it('should find functions called within method body', async () => {
            const content = `
void caller() {
    helper1();
    helper2();
}

void helper1() {}
void helper2() {}
`;
            setupDocument(content, [
                sym('caller', 'method', { position: { line: 2, character: 0 } }),
                sym('helper1', 'method', { position: { line: 6, character: 0 } }),
                sym('helper2', 'method', { position: { line: 7, character: 0 } })
            ]);

            const handler = mockConnection.callHierarchyOutgoingCallsHandler;
            const result = await handler!({
                item: {
                    name: 'caller',
                    kind: SymbolKind.Method,
                    uri: testUri,
                    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 11 } },
                    selectionRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 11 } }
                }
            });

            assert.ok(result, 'Should return results');
            assert.strictEqual(result!.length, 2, 'Should find 2 called functions');

            const calledNames = result!.map(r => r.to.name).sort();
            assert.deepStrictEqual(calledNames, ['helper1', 'helper2']);
        });
    });
});
