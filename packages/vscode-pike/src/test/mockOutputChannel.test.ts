/**
 * Mock Output Channel Unit Tests
 *
 * These tests verify the MockOutputChannel class works correctly
 * without requiring VSCode to be running.
 */

import assert from 'assert';
import { describe, it } from 'mocha';
import { MockOutputChannelImpl, createMockOutputChannel } from './mockOutputChannel';

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

    it('should append without newline', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.append('Hello');
        channel.append(' ');
        channel.append('World');
        assert.equal(channel.count, 3);
        assert.ok(channel.contains('Hello'));
        assert.ok(channel.contains('World'));
    });

    it('should replace content', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Old content');
        assert.ok(channel.contains('Old content'));
        channel.replace('New content');
        assert.ok(channel.contains('New content'));
        assert.ok(!channel.contains('Old content'));
    });

    it('should track log count', () => {
        const channel = new MockOutputChannelImpl('Test');
        assert.equal(channel.count, 0);
        channel.appendLine('Line 1');
        assert.equal(channel.count, 1);
        channel.appendLine('Line 2');
        assert.equal(channel.count, 2);
        channel.clear();
        assert.equal(channel.count, 0);
    });

    it('should get logs as string', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Line 1');
        channel.appendLine('Line 2');
        const logsString = channel.getLogsAsString();
        assert.ok(logsString.includes('Line 1'));
        assert.ok(logsString.includes('Line 2'));
    });

    it('should filter by string pattern', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Error: something went wrong');
        channel.appendLine('Warning: be careful');
        channel.appendLine('Info: all good');
        const errors = channel.filter('Error');
        assert.equal(errors.length, 1);
        assert.ok(errors[0].includes('Error'));
    });

    it('should handle no matches in filter', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Info: all good');
        const errors = channel.filter(/Error/i);
        assert.equal(errors.length, 0);
    });

    it('should handle empty logs', () => {
        const channel = new MockOutputChannelImpl('Test');
        assert.equal(channel.getLogs().length, 0);
        assert.equal(channel.getLogsAsString(), '');
        assert.equal(channel.count, 0);
        channel.clear(); // Should not throw
        assert.doesNotThrow(() => channel.clear());
    });

    it('should dispose without error', () => {
        const channel = new MockOutputChannelImpl('Test');
        channel.appendLine('Before dispose');
        assert.doesNotThrow(() => channel.dispose());
        assert.equal(channel.count, 0); // Should clear on dispose
    });

    it('should handle show/hide no-op', () => {
        const channel = new MockOutputChannelImpl('Test');
        assert.doesNotThrow(() => channel.show());
        assert.doesNotThrow(() => channel.show(true));
        assert.doesNotThrow(() => channel.hide());
    });
});
