/**
 * Implementation Provider Tests
 *
 * TDD tests for textDocument/implementation LSP handler.
 * Tests finding implementations of Pike classes/interfaces.
 *
 * Per LSP spec:
 * - textDocument/implementation finds all implementations of an interface
 * - For Pike, this means finding all classes with "inherit TargetClass"
 */

import { describe, it, beforeEach } from 'bun:test';
import assert from 'node:assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver/node.js';
import { registerImplementationHandler } from '../../features/navigation/implementation.js';

class MockConnection {
    constructor() {
        this.handler = null;
    }

    onImplementation(callback) {
        this.handler = callback;
    }

    implementationHandler(params) {
        if (!this.handler) return Promise.resolve([]);
        return this.handler(params);
    }
}

class MockDocumentCache {
    constructor() {
        this.documents = new Map();
    }

    set(uri, data) {
        this.documents.set(uri, data);
    }

    get(uri) {
        return this.documents.get(uri);
    }

    keys() {
        return Array.from(this.documents.keys());
    }
}

class MockTextDocuments {
    constructor() {
        this.docs = new Map();
    }

    set(uri, doc) {
        this.docs.set(uri, doc);
    }

    get(uri) {
        return this.docs.get(uri);
    }
}

describe('Implementation Provider', () => {
    let mockConnection;
    let mockCache;
    let mockDocuments;

    beforeEach(() => {
        mockConnection = new MockConnection();
        mockCache = new MockDocumentCache();
        mockDocuments = new MockTextDocuments();
    });

    describe('Scenario 1: Find implementations of base class', () => {
        it('should find all classes that inherit from base class', async () => {
            const baseClassUri = 'file:///base.pike';
            const impl1Uri = 'file:///impl1.pike';
            const impl2Uri = 'file:///impl2.pike';

            const baseClassCode = 'class BaseClass { }\n';
            const baseClassDoc = TextDocument.create(baseClassUri, 'pike', 1, baseClassCode);
            mockDocuments.set(baseClassUri, baseClassDoc);
            mockCache.set(baseClassUri, {
                symbols: [
                    { name: 'BaseClass', kind: 'class', position: { line: 1 } }
                ]
            });

            const impl1Code = 'class Impl1 { inherit BaseClass; }\n';
            const impl1Doc = TextDocument.create(impl1Uri, 'pike', 1, impl1Code);
            mockDocuments.set(impl1Uri, impl1Doc);
            mockCache.set(impl1Uri, {
                symbols: [
                    { name: 'Impl1', kind: 'class', position: { line: 1 } },
                    { name: 'BaseClass', kind: 'inherit', classname: 'BaseClass', position: { line: 1 } }
                ]
            });

            const impl2Code = 'class Impl2 { inherit BaseClass; }\n';
            const impl2Doc = TextDocument.create(impl2Uri, 'pike', 1, impl2Code);
            mockDocuments.set(impl2Uri, impl2Doc);
            mockCache.set(impl2Uri, {
                symbols: [
                    { name: 'Impl2', kind: 'class', position: { line: 1 } },
                    { name: 'BaseClass', kind: 'inherit', classname: 'BaseClass', position: { line: 1 } }
                ]
            });

            const mockServices = {
                documentCache: mockCache,
                bridge: null,
                logger: { debug: () => {}, error: () => {} },
                stdlibIndex: null
            };

            registerImplementationHandler(
                mockConnection,
                mockServices,
                mockDocuments
            );

            const result = await mockConnection.implementationHandler({
                textDocument: { uri: baseClassUri },
                position: { line: 0, character: 10 }
            });

            assert.ok(Array.isArray(result), 'Should return array of locations');
            assert.ok(result.length >= 2, `Should find at least 2 implementations, found ${result.length}`);

            const uris = result.map((loc) => loc.uri);
            assert.ok(uris.includes(impl1Uri), 'Should include Impl1');
            assert.ok(uris.includes(impl2Uri), 'Should include Impl2');
        });
    });

    describe('Scenario 2: Return empty for non-class symbols', () => {
        it('should return empty array for variables', async () => {
            const uri = 'file:///test.pike';
            const code = 'int myVar = 42;\n';
            const doc = TextDocument.create(uri, 'pike', 1, code);
            mockDocuments.set(uri, doc);
            mockCache.set(uri, {
                symbols: [
                    { name: 'myVar', kind: 'variable', position: { line: 1 } }
                ]
            });

            const mockServices = {
                documentCache: mockCache,
                bridge: null,
                logger: { debug: () => {}, error: () => {} },
                stdlibIndex: null
            };

            registerImplementationHandler(
                mockConnection,
                mockServices,
                mockDocuments
            );

            const result = await mockConnection.implementationHandler({
                textDocument: { uri },
                position: { line: 0, character: 5 }
            });

            assert.ok(Array.isArray(result), 'Should return array');
            assert.strictEqual(result.length, 0, 'Should return empty for variables');
        });
    });

    describe('Scenario 4: Handle inherit with string literals', () => {
        it('should normalize quotes in inherit statements', async () => {
            const baseUri = 'file:///base.pike';
            const implUri = 'file:///impl.pike';

            const baseCode = 'class Target { }\n';
            const baseDoc = TextDocument.create(baseUri, 'pike', 1, baseCode);
            mockDocuments.set(baseUri, baseDoc);
            mockCache.set(baseUri, {
                symbols: [
                    { name: 'Target', kind: 'class', position: { line: 1 } }
                ]
            });

            const implCode = 'class MyImpl { inherit "Target"; }\n';
            const implDoc = TextDocument.create(implUri, 'pike', 1, implCode);
            mockDocuments.set(implUri, implDoc);
            mockCache.set(implUri, {
                symbols: [
                    { name: 'MyImpl', kind: 'class', position: { line: 1 } },
                    { name: 'Target', kind: 'inherit', classname: '"Target"', position: { line: 1 } }
                ]
            });

            const mockServices = {
                documentCache: mockCache,
                bridge: null,
                logger: { debug: () => {}, error: () => {} },
                stdlibIndex: null
            };

            registerImplementationHandler(
                mockConnection,
                mockServices,
                mockDocuments
            );

            const result = await mockConnection.implementationHandler({
                textDocument: { uri: baseUri },
                position: { line: 0, character: 8 }
            });

            assert.ok(Array.isArray(result), 'Should return array');
            assert.ok(result.length >= 1, 'Should find implementation with quoted inherit');
        });
    });

    describe('Scenario 5: No implementations returns empty', () => {
        it('should return empty array when class has no implementations', async () => {
            const uri = 'file:///test.pike';
            const code = 'class OrphanClass { }\n';
            const doc = TextDocument.create(uri, 'pike', 1, code);
            mockDocuments.set(uri, doc);
            mockCache.set(uri, {
                symbols: [
                    { name: 'OrphanClass', kind: 'class', position: { line: 1 } }
                ]
            });

            const mockServices = {
                documentCache: mockCache,
                bridge: null,
                logger: { debug: () => {}, error: () => {} },
                stdlibIndex: null
            };

            registerImplementationHandler(
                mockConnection,
                mockServices,
                mockDocuments
            );

            const result = await mockConnection.implementationHandler({
                textDocument: { uri },
                position: { line: 0, character: 10 }
            });

            assert.ok(Array.isArray(result), 'Should return array');
            assert.strictEqual(result.length, 0, 'Should return empty for unimplemented class');
        });
    });

    describe('Scenario 7: Handle error conditions', () => {
        it('should return empty array when document not found', async () => {
            const mockServices = {
                documentCache: mockCache,
                bridge: null,
                logger: { debug: () => {}, error: () => {} },
                stdlibIndex: null
            };

            registerImplementationHandler(
                mockConnection,
                mockServices,
                mockDocuments
            );

            const result = await mockConnection.implementationHandler({
                textDocument: { uri: 'file:///nonexistent.pike' },
                position: { line: 0, character: 0 }
            });

            assert.ok(Array.isArray(result), 'Should return array');
            assert.strictEqual(result.length, 0, 'Should return empty for missing document');
        });
    });
});
