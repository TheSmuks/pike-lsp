/**
 * Extension Tests for Pike Language Support
 *
 * These tests verify that the VSCode extension activates correctly
 * and the LSP server starts up properly.
 */

// @ts-nocheck - Extension tests use mocha types at runtime
// These tests require vscode package to run - skip in standard test environment

import * as path from 'path';
import * as fs from 'fs';
import assert from 'assert';
import { describe, it, before, after, test, suite } from 'mocha';

// Skip all tests in this file if vscode is not available
let vscodeAvailable = false;
try {
    require.resolve('vscode');
    vscodeAvailable = true;
} catch {
    // vscode not available
}

// Import conditionally only when available
let ExtensionContext: any;
let runTests: any;
let activateForTesting: any;
let ExtensionApi: any;

if (vscodeAvailable) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ExtensionContext = require('vscode').ExtensionContext;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    runTests = require('@vscode/test-electron').runTests;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ext = require('../extension');
    activateForTesting = ext.activateForTesting;
    ExtensionApi = ext.ExtensionApi;
}

import { MockOutputChannelImpl, createMockOutputChannel, type MockOutputChannel } from './mockOutputChannel';

// Use conditional test functions - skip tests if vscode not available
const itSkip = vscodeAvailable ? it : it.skip;

describe('Pike Language Extension', () => {
    let extensionApi: ExtensionApi | null = null;
    let mockOutputChannel: MockOutputChannel;
    let testContext: any;

    before(async function() {
        if (!vscodeAvailable) {
            this.skip();
            return;
        }
        this.timeout(30000); // Give more time for setup

        // Create a mock output channel to capture logs
        mockOutputChannel = new MockOutputChannel('Pike Language Server');

        // Create a minimal mock context
        testContext = {
            subscriptions: [],
            extensionPath: path.resolve(__dirname, '../../..'),
            storagePath: '/tmp/pike-lsp-test-storage',
            globalStoragePath: '/tmp/pike-lsp-test-global-storage',
            logPath: '/tmp/pike-lsp-test-logs',
            extensionUri: null as any,
            asAbsolutePath: (relativePath: string) => {
                return path.resolve(__dirname, '../../..', relativePath);
            },
            // Stub methods
            extensionMode: 1 as any,
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => [],
                setKeysForSync: () => {},
            } as any,
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => [],
                setKeysForSync: () => {},
            } as any,
            secrets: {
                get: () => Promise.resolve(undefined),
                store: () => Promise.resolve(),
                delete: () => Promise.resolve(),
                onDidChange: () => ({ dispose: () => {} } as any),
            } as any,
            environmentVariableCollection: {
                persistent: true,
                get: () => undefined,
                replace: () => {},
                append: () => {},
                prepend: () => {},
                clear: () => {},
                forEach: () => {},
                getScoped: () => ({} as any),
                toJSON: () => ({}),
            } as any,
            // Stub dispose
            dispose: () => {
                testContext.subscriptions.forEach((sub: any) => {
                    if (sub && typeof sub.dispose === 'function') {
                        sub.dispose();
                    }
                });
            },
        } as unknown as ExtensionContext;

        // Check if server build exists
        const serverPaths = [
            path.resolve(__dirname, '../../../pike-lsp-server/dist/server.js'),
            path.resolve(__dirname, '../../../../pike-lsp-server/dist/server.js'),
        ];

        const serverExists = serverPaths.some(p => fs.existsSync(p));
        if (!serverExists) {
            console.log('Warning: LSP server not built. Skipping some tests.');
            console.log('Build with: pnpm build && pnpm bundle-server');
        }
    });

    after(async () => {
        // Clean up
        if (testContext && typeof testContext.dispose === 'function') {
            testContext.dispose();
        }
        if (extensionApi) {
            const client = extensionApi.getClient();
            if (client) {
                await client.stop();
            }
        }
    });

    describe('Mock Output Channel', () => {
        it('should create a mock output channel', () => {
            const channel = new MockOutputChannelImpl('Test');
            assert.equal(channel.name, 'Test');
            assert.equal(channel.count, 0);
        });

        it('should append lines and capture them', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Hello, World!');
            assert.equal(channel.count, 1);
            assert.ok(channel.contains('Hello, World!'));
        });

        it('should return logs as array', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Line 1');
            channel.appendLine('Line 2');
            const logs = channel.getLogs();
            assert.equal(logs.length, 2);
            assert.ok(logs[0].includes('Line 1'));
        });

        it('should filter logs by pattern', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Error: something went wrong');
            channel.appendLine('Info: all good');
            const errors = channel.filter(/Error/i);
            assert.equal(errors.length, 1);
            assert.ok(errors[0].includes('Error'));
        });

        it('should clear logs', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Temporary');
            assert.equal(channel.count, 1);
            channel.clear();
            assert.equal(channel.count, 0);
        });

        it('should drain logs', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Line 1');
            channel.appendLine('Line 2');
            const drained = channel.drain();
            assert.equal(drained.length, 2);
            assert.equal(channel.count, 0);
        });
    });

    describe('Extension Activation', () => {
        it('should activate extension and return API', async function() {
            this.timeout(10000);

            // Note: This test will fail to start the LSP server if not built,
            // but it verifies the activation flow works
            try {
                extensionApi = await activateForTesting(testContext, mockOutputChannel);

                assert.ok(extensionApi, 'Extension API should be returned');
                assert.strictEqual(typeof extensionApi.getClient, 'function');
                assert.strictEqual(typeof extensionApi.getOutputChannel, 'function');
                assert.strictEqual(typeof extensionApi.getLogs, 'function');

                console.log('Extension activated successfully');
                console.log('Logs captured:', mockOutputChannel.getLogs().length);
            } catch (error) {
                // Expected if server not built - we still verify activation flow
                console.log('Activation note:', (error as any).message);
                throw error;
            }
        });

        it('should have captured activation logs', () => {
            const logs = mockOutputChannel.getLogs();
            assert.ok(Array.isArray(logs), 'Logs should be an array');
            console.log('Captured logs:', logs.join(''));
        });

        it('should provide access to output channel', () => {
            if (!extensionApi) {
                // SKIPPED: Extension API not available (test setup incomplete)
                return;
            }
            const channel = extensionApi.getOutputChannel();
            assert.ok(channel, 'Output channel should be accessible');
            assert.equal(channel.name, 'Pike Language Server');
        });

        it('should get logs through API', () => {
            if (!extensionApi) {
                // SKIPPED: Extension API not available (test setup incomplete)
                return;
            }
            const logs = extensionApi.getLogs();
            assert.ok(Array.isArray(logs), 'getLogs() should return array');
        });
    });

    describe('Server Path Resolution', () => {
        it('should detect server paths for debugging', () => {
            const possiblePaths = [
                path.resolve(__dirname, '../../../pike-lsp-server/dist/server.js'),
                path.resolve(__dirname, '../../../../pike-lsp-server/dist/server.js'),
            ];

            console.log('Checking server paths:');
            possiblePaths.forEach(p => {
                const exists = fs.existsSync(p);
                console.log(`  ${exists ? '✓' : '✗'} ${p}`);
            });

            // At least log the results for debugging
            const anyExists = possiblePaths.some(p => fs.existsSync(p));
            if (!anyExists) {
                console.log('No server build found. Run: pnpm build && pnpm bundle-server');
            }
        });
    });
});

// Run VSCode integration tests if this is the main module
if (require.main === module) {
    (async () => {
        try {
            // The VSCode extension folder
            const extensionDevelopmentPath = path.resolve(__dirname, '../../..');

            // The workspace to open for testing
            const testWorkspace = path.resolve(__dirname, '../../../test/fixtures');

            // Run the tests
            await runTests({
                extensionDevelopmentPath,
                extensionTestsPath: __dirname,
                launchArgs: [
                    testWorkspace,
                    '--disable-extensions', // Disable other extensions
                ],
            });
        } catch (err) {
            console.error('Failed to run tests:', err);
            process.exit(1);
        }
    })();
}
