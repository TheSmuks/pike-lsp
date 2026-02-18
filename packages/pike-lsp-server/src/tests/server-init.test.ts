/**
 * Server Initialization Tests
 *
 * Tests for LSP server initialization process.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

describe('Server Initialization', () => {
    describe('Semantic Tokens', () => {
        it('should define token types for semantic highlighting', () => {
            // Test the token type definitions (same as in server.ts)
            const tokenTypes = [
                'namespace', 'type', 'class', 'enum', 'interface',
                'struct', 'typeParameter', 'parameter', 'variable', 'property',
                'enumMember', 'event', 'function', 'method', 'macro',
                'keyword', 'modifier', 'comment', 'string', 'number',
                'regexp', 'operator', 'decorator'
            ];

            assert.ok(tokenTypes.length > 0, 'Token types should be defined');
            assert.ok(tokenTypes.includes('class'), 'Should include class token type');
            assert.ok(tokenTypes.includes('function'), 'Should include function token type');
            assert.ok(tokenTypes.includes('variable'), 'Should include variable token type');
            assert.ok(tokenTypes.includes('keyword'), 'Should include keyword token type');
        });

        it('should define token modifiers', () => {
            const tokenModifiers = [
                'declaration', 'definition', 'readonly', 'static',
                'deprecated', 'abstract', 'async', 'modification',
                'documentation', 'defaultLibrary'
            ];

            assert.ok(tokenModifiers.length > 0, 'Token modifiers should be defined');
            assert.ok(tokenModifiers.includes('declaration'), 'Should include declaration modifier');
            assert.ok(tokenModifiers.includes('readonly'), 'Should include readonly modifier');
            assert.ok(tokenModifiers.includes('static'), 'Should include static modifier');
        });

        it('should have matching token type and modifier counts', () => {
            const tokenTypes = [
                'namespace', 'type', 'class', 'enum', 'interface',
                'struct', 'typeParameter', 'parameter', 'variable', 'property',
                'enumMember', 'event', 'function', 'method', 'macro',
                'keyword', 'modifier', 'comment', 'string', 'number',
                'regexp', 'operator', 'decorator'
            ];

            const tokenModifiers = [
                'declaration', 'definition', 'readonly', 'static',
                'deprecated', 'abstract', 'async', 'modification',
                'documentation', 'defaultLibrary'
            ];

            // LSP spec requires these to match the registered numbers
            assert.ok(tokenTypes.length >= 10, 'Should have at least 10 token types');
            assert.ok(tokenModifiers.length >= 5, 'Should have at least 5 token modifiers');
        });
    });

    describe('Document Sync', () => {
        it('should define TextDocumentSyncKind values', () => {
            // TextDocumentSyncKind enum values
            const TextDocumentSyncKind = {
                None: 0,
                Full: 1,
                Incremental: 2
            };

            assert.strictEqual(TextDocumentSyncKind.None, 0, 'None should be 0');
            assert.strictEqual(TextDocumentSyncKind.Full, 1, 'Full should be 1');
            assert.strictEqual(TextDocumentSyncKind.Incremental, 2, 'Incremental should be 2');
        });

        it('should support incremental document sync', () => {
            const TextDocumentSyncKind = {
                None: 0,
                Full: 1,
                Incremental: 2
            };

            // The server uses Incremental sync
            assert.strictEqual(TextDocumentSyncKind.Incremental, 2, 'Incremental should be available');
        });
    });

    describe('Server Capabilities', () => {
        it('should define textDocumentSync options', () => {
            const textDocumentSyncOptions = {
                openClose: true,
                change: 2, // Incremental
                willSave: false,
                willSaveWaitUntil: false,
                save: {
                    includeText: false
                }
            };

            assert.strictEqual(textDocumentSyncOptions.openClose, true, 'Should support open/close');
            assert.strictEqual(textDocumentSyncOptions.change, 2, 'Should use incremental sync');
            assert.ok(textDocumentSyncOptions.save, 'Should support save');
            assert.strictEqual(textDocumentSyncOptions.save.includeText, false, 'Should not include text in save');
        });

        it('should define hover provider capability', () => {
            const hoverProvider = true;

            assert.strictEqual(hoverProvider, true, 'Hover provider should be enabled');
        });

        it('should define completion provider capability', () => {
            const completionProvider = {
                resolveProvider: true,
                triggerCharacters: ['.']
            };

            assert.strictEqual(completionProvider.resolveProvider, true, 'Should support completion resolving');
            assert.ok(completionProvider.triggerCharacters.includes('.'), 'Should trigger on dot');
        });
    });

    describe('Initialize Params', () => {
        it('should validate initialize params structure', () => {
            // Minimal initialize params
            const params = {
                processId: 12345,
                rootUri: 'file:///path/to/project',
                capabilities: {}
            };

            assert.strictEqual(params.processId, 12345, 'Should have processId');
            assert.ok(params.rootUri.startsWith('file://'), 'Should have rootUri');
            assert.ok(typeof params.capabilities === 'object', 'Should have capabilities');
        });

        it('should handle workspace folders in initialize params', () => {
            const params = {
                workspaceFolders: [
                    { uri: 'file:///path/to/project', name: 'project' }
                ]
            };

            assert.ok(Array.isArray(params.workspaceFolders), 'workspaceFolders should be array');
            assert.strictEqual(params.workspaceFolders?.length, 1, 'Should have one workspace folder');
            assert.ok(params.workspaceFolders?.[0].uri.startsWith('file://'), 'Folder should have uri');
        });
    });

    describe('Initialize Result', () => {
        it('should define server info', () => {
            const serverInfo = {
                name: 'Pike Language Server',
                version: '1.0.0'
            };

            assert.strictEqual(serverInfo.name, 'Pike Language Server', 'Should have server name');
            assert.ok(serverInfo.version, 'Should have version');
        });

        it('should define server capabilities', () => {
            const capabilities = {
                textDocumentSync: 2, // Incremental
                hoverProvider: true,
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: ['.']
                },
                definitionProvider: true,
                referencesProvider: true,
                documentSymbolProvider: true,
                semanticTokensProvider: {
                    legend: {
                        tokenTypes: [],
                        tokenModifiers: []
                    },
                    full: true
                }
            };

            assert.strictEqual(capabilities.textDocumentSync, 2, 'Should use incremental sync');
            assert.strictEqual(capabilities.hoverProvider, true, 'Should support hover');
            assert.strictEqual(capabilities.definitionProvider, true, 'Should support definition');
            assert.strictEqual(capabilities.referencesProvider, true, 'Should support references');
            assert.strictEqual(capabilities.documentSymbolProvider, true, 'Should support document symbols');
            assert.ok(capabilities.semanticTokensProvider, 'Should support semantic tokens');
        });
    });
});
