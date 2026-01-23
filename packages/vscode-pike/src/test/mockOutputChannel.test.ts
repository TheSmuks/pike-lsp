/**
 * Mock Output Channel Unit Tests
 *
 * These tests verify the MockOutputChannel class works correctly
 * without requiring VSCode to be running.
 */

import { describe, test, expect } from 'bun:test';
import { MockOutputChannelImpl } from './mockOutputChannel';

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
        expect(logs[0]).toContain('Line 1');
    });

    test('should filter logs by pattern', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Error: something went wrong');
        channel.appendLine('Info: all good');
        const errors = channel.filter(/Error/i);
        expect(errors.length).toBe(1);
        expect(errors[0]).toContain('Error');
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

    test('should append without newline', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.append('Hello');
        channel.append(' ');
        channel.append('World');
        expect(channel.count).toBe(3);
        expect(channel.contains('Hello')).toBe(true);
        expect(channel.contains('World')).toBe(true);
    });

    test('should replace content', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Old content');
        expect(channel.contains('Old content')).toBe(true);
        channel.replace('New content');
        expect(channel.contains('New content')).toBe(true);
        expect(channel.contains('Old content')).toBe(false);
    });

    test('should track log count', () => {
        const channel = new MockOutputChannelImpl('Test');
        expect(channel.count).toBe(0);
        channel.appendLine('Line 1');
        expect(channel.count).toBe(1);
        channel.appendLine('Line 2');
        expect(channel.count).toBe(2);
        channel.clear();
        expect(channel.count).toBe(0);
    });

    test('should get logs as string', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Line 1');
        channel.appendLine('Line 2');
        const logsString = channel.getLogsAsString();
        expect(logsString).toContain('Line 1');
        expect(logsString).toContain('Line 2');
    });

    test('should filter by string pattern', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Error: something went wrong');
        channel.appendLine('Warning: be careful');
        channel.appendLine('Info: all good');
        const errors = channel.filter('Error');
        expect(errors.length).toBe(1);
        expect(errors[0]).toContain('Error');
    });

    test('should handle no matches in filter', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Info: all good');
        const errors = channel.filter(/Error/i);
        expect(errors.length).toBe(0);
    });

    test('should handle empty logs', () => {
        const channel = new MockOutputChannelImpl('Test');
        expect(channel.getLogs().length).toBe(0);
        expect(channel.getLogsAsString()).toBe('');
        expect(channel.count).toBe(0);
        channel.clear(); // Should not throw
        expect(() => channel.clear()).not.toThrow();
    });

    test('should dispose without error', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Before dispose');
        expect(() => channel.dispose()).not.toThrow();
        expect(channel.count).toBe(0); // Should clear on dispose
    });

    test('should handle show/hide no-op', () => {
        const channel = new MockOutputChannelImpl('Test');
        expect(() => channel.show()).not.toThrow();
        expect(() => channel.show(true)).not.toThrow();
        expect(() => channel.hide()).not.toThrow();
    });
});
