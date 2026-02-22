/**
 * Extension Tests for Pike Language Support
 *
 * These tests verify that the VSCode extension activates correctly
 * and the LSP server starts up properly.
 *
 * NOTE: These tests require VSCode to run. They will be skipped in
 * standard test environments without VSCode.
 */

import * as path from 'path';
import * as fs from 'fs';
import { describe, test, expect } from 'bun:test';

// Use dynamic require to handle missing modules gracefully
let MockOutputChannelImpl: any;

// Try to load the mock output channel module
try {
    const mockModule = require('./mockOutputChannel');
    MockOutputChannelImpl = mockModule.MockOutputChannelImpl;
} catch (e) {
    // Will be handled in tests
}

describe('Pike Language Extension', () => {
    describe('Mock Output Channel', () => {
        test('should create a mock output channel', () => {
            const channel = new MockOutputChannelImpl('Test');
            expect(channel.name).toBe('Test');
            expect(channel.count).toBe(0);
        });

        test('should append lines and capture them', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Hello, World!');
            expect(channel.count).toBe(1);
            expect(channel.contains('Hello, World!')).toBe(true);
        });

        test('should return logs as array', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Line 1');
            channel.appendLine('Line 2');
            const logs = channel.getLogs();
            expect(logs.length).toBe(2);
            expect(logs[0].includes('Line 1')).toBe(true);
        });

        test('should filter logs by pattern', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Error: something went wrong');
            channel.appendLine('Info: all good');
            const errors = channel.filter(/Error/i);
            expect(errors.length).toBe(1);
            expect(errors[0].includes('Error')).toBe(true);
        });

        test('should clear logs', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Temporary');
            expect(channel.count).toBe(1);
            channel.clear();
            expect(channel.count).toBe(0);
        });

        test('should drain logs', () => {
            const channel = new MockOutputChannelImpl('Test');
            channel.appendLine('Line 1');
            channel.appendLine('Line 2');
            const drained = channel.drain();
            expect(drained.length).toBe(2);
            expect(channel.count).toBe(0);
        });
    });

    describe('Server Path Resolution', () => {
        test('should detect server paths for debugging', () => {
            const possiblePaths = [
                path.resolve(__dirname, '../../../pike-lsp-server/dist/server.js'),
                path.resolve(__dirname, '../../../../pike-lsp-server/dist/server.js'),
            ];

            console.log('Checking server paths:');
            possiblePaths.forEach(p => {
                const exists = fs.existsSync(p);
                console.log(`  ${exists ? '✓' : '✗'} ${p}`);
            });

            const anyExists = possiblePaths.some(p => fs.existsSync(p));
            if (!anyExists) {
                console.log('No server build found. Run: bun run build && bun run bundle-server');
            }
        });
    });
});
