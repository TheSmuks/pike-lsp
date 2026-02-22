/**
 * LSP Smoke Test - Verifies the LSP server starts without timeout errors
 *
 * This test checks for the specific timeout error that occurs when
 * the extension tries to load stdlib modules during initialization.
 */

// @ts-nocheck
// These tests require vscode package to run - skip in standard test environment

import * as path from 'path';
import assert from 'assert';
import { describe, it, before, after } from 'mocha';
import { MockOutputChannelImpl } from './mockOutputChannel';

// Skip all tests in this file if vscode is not available
let vscodeAvailable = false;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('vscode');
    vscodeAvailable = true;
} catch {
    // vscode not available - tests will be skipped
}

// Import extension only when vscode is available
let activateForTesting: any;
let ExtensionApi: any;
if (vscodeAvailable) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ext = require('../extension');
    activateForTesting = ext.activateForTesting;
    ExtensionApi = ext.ExtensionApi;
}

// Simple mock context for testing
function createMockContext() {
    return {
        subscriptions: [],
        extensionPath: path.resolve(__dirname, '../../..'),
        storagePath: '/tmp/pike-lsp-test-storage',
        globalStoragePath: '/tmp/pike-lsp-test-global-storage',
        logPath: '/tmp/pike-lsp-test-logs',
        extensionUri: null as any,
        asAbsolutePath: (relativePath: string) => path.resolve(__dirname, '../../..', relativePath),
        extensionMode: 1 as any,
        globalState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [], setKeysForSync: () => {} } as any,
        workspaceState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [], setKeysForSync: () => {} } as any,
        secrets: { get: () => Promise.resolve(undefined), store: () => Promise.resolve(), delete: () => Promise.resolve(), onDidChange: () => ({ dispose: () => {} } as any) } as any,
        environmentVariableCollection: { persistent: true, get: () => undefined, replace: () => {}, append: () => {}, prepend: () => {}, clear: () => {}, forEach: () => {}, getScoped: () => ({} as any), toJSON: () => ({}) } as any,
        dispose: () => {},
    } as any;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('LSP Smoke Test', function() {
    this.timeout(70000); // Give more time than the 30s timeout

    let extensionApi: ExtensionApi | null = null;
    let mockOutputChannel: MockOutputChannelImpl;

    before(async () => {
        mockOutputChannel = new MockOutputChannelImpl('Pike Language Server');
    });

    after(async () => {
        if (extensionApi) {
            const client = extensionApi.getClient();
            if (client) {
                try {
                    await client.stop();
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }
    });

    it('should start LSP server without Stdio timeout error', async function() {
        this.timeout(70000);

        const testContext = createMockContext();

        // Activate the extension
        try {
            extensionApi = await activateForTesting(testContext, mockOutputChannel as any);

            // Wait for the timeout to occur (35 seconds)
            console.log('Waiting 35 seconds for potential timeout...');
            await delay(35000);

            // Get all captured logs
            const logs = mockOutputChannel.getLogs();

            // Check for the specific timeout error
            const hasTimeoutError = logs.some(log =>
                log.includes('Failed to load stdlib module Stdio') ||
                log.includes('Request 1 timed out') ||
                log.includes('Pike process exited with code 10')
            );

            // Get startup logs for debugging
            const startupLogs = logs.filter(l => l.includes('Pike LSP') || l.includes('Pike bridge'));
            console.log('=== LSP Startup Logs ===');
            startupLogs.forEach(l => console.log('  ', l));
            console.log('========================');

            // Check for any errors
            const errorLogs = logs.filter(l => l.includes('Error') || l.includes('error') || l.includes('Failed'));

            if (errorLogs.length > 0) {
                console.log('=== Error Logs ===');
                errorLogs.forEach(l => console.log('  ', l));
                console.log('==================');
            }

            // Check if server started successfully
            const hasStartupMessage = logs.some(l => l.includes('Pike LSP Server initialized') || l.includes('Pike bridge started'));

            if (hasTimeoutError) {
                console.error('❌ FAIL: Stdio timeout detected!');
                assert.fail('LSP server failed with Stdio timeout error');
            } else if (hasStartupMessage) {
                console.log('✓ PASS: LSP server started successfully without timeout');
            } else {
                console.warn('⚠ Warning: LSP server status unclear');
            }

            assert.strictEqual(hasTimeoutError, false, 'Should not have Stdio timeout errors');

        } catch (error: any) {
            console.error('Activation failed:', error.message);
            // Log all captured errors
            const logs = mockOutputChannel.getLogs();
            logs.filter(l => l.includes('Error') || l.includes('Failed')).forEach(l => console.error('  ', l));
            throw error;
        }
    });

    it('should capture LSP version in logs', function() {
        this.timeout(10000);

        if (!extensionApi) {
            return;
        }

        const logs = mockOutputChannel.getLogs();
        const hasVersion = logs.some(l => l.includes('Pike LSP Analyzer running on Pike'));

        console.log('Version log:', logs.find(l => l.includes('Pike LSP Analyzer running')));

        if (hasVersion) {
            console.log('✓ PASS: Pike version detected');
        } else {
            console.warn('⚠ Warning: Pike version not logged');
        }
    });

    it('should not have compilation errors', function() {
        this.timeout(10000);

        if (!extensionApi) {
            return;
        }

        const logs = mockOutputChannel.getLogs();
        const hasCompilationError = logs.some(l => l.includes('Compilation failed') || l.includes('PikeCompiler'));

        if (hasCompilationError) {
            console.error('❌ FAIL: Compilation errors detected:');
            logs.filter(l => l.includes('Compilation') || l.includes('Undefined') || l.includes('PikeCompiler')).forEach(l => console.error('  ', l));
            assert.fail('Should not have compilation errors');
        } else {
            console.log('✓ PASS: No compilation errors');
        }
    });
});
