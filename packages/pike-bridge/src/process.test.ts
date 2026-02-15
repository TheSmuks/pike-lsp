/**
 * Pike Process Tests
 *
 * Tests the low-level IPC mechanics in isolation from PikeBridge business logic.
 * Uses a mock process pattern to test without requiring actual Pike installation.
 */

// @ts-ignore - Bun test types
import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { PikeProcess } from './process.js';

/**
 * Mock Pike process for testing without actual Pike subprocess.
 * Simulates the behavior of ChildProcess for isolated unit testing.
 */
class MockPikeProcess extends EventEmitter {
    public messagesSent: string[] = [];
    public killed = false;
    private _pid = Math.floor(Math.random() * 10000) + 1000;
    private _alive = true;

    constructor() {
        super();
    }

    // Simulate PikeProcess API
    spawn(_analyzerPath: string, _pikePath?: string, _env?: NodeJS.ProcessEnv): void {
        // Simulate successful spawn
        setImmediate(() => {
            this.emit('mock-ready');
        });
    }

    send(json: string): void {
        if (!this._alive) {
            throw new Error('PikeProcess not running');
        }
        this.messagesSent.push(json);
    }

    kill(): void {
        this._alive = false;
        this.killed = true;
        this.emit('exit', 0);
    }

    isAlive(): boolean {
        return this._alive;
    }

    get pid(): number {
        return this._pid;
    }

    // Test helper methods
    simulateMessage(line: string): void {
        this.emit('message', line);
    }

    simulateStderr(data: string): void {
        this.emit('stderr', data);
    }

    simulateError(err: Error): void {
        this.emit('error', err);
    }

    simulateExit(code: number): void {
        this._alive = false;
        this.emit('exit', code);
    }
}

describe('PikeProcess', () => {
    describe('Unit tests (with mock)', () => {
        it('should emit message events when receiving stdout lines', () => {
            const proc = new MockPikeProcess();
            const messages: string[] = [];

            proc.on('message', (line) => messages.push(line));
            proc.simulateMessage('{"jsonrpc":"2.0","id":1,"result":{}}');
            proc.simulateMessage('{"jsonrpc":"2.0","id":2,"result":{}}');

            assert.equal(messages.length, 2);
            assert.equal(messages[0], '{"jsonrpc":"2.0","id":1,"result":{}}');
            assert.equal(messages[1], '{"jsonrpc":"2.0","id":2,"result":{}}');
        });

        it('should emit stderr events', () => {
            const proc = new MockPikeProcess();
            const stderrData: string[] = [];

            proc.on('stderr', (data) => stderrData.push(data));
            proc.simulateStderr('Warning: something happened');
            proc.simulateStderr('Error: something broke');

            assert.equal(stderrData.length, 2);
            assert.equal(stderrData[0], 'Warning: something happened');
            assert.equal(stderrData[1], 'Error: something broke');
        });

        it('should emit exit events with code', () => {
            const proc = new MockPikeProcess();
            let exitCode: number | null = null;

            proc.on('exit', (code) => { exitCode = code; });
            proc.simulateExit(0);

            assert.equal(exitCode, 0);
            assert.equal(proc.isAlive(), false);
        });

        it('should emit error events on spawn failure', () => {
            const proc = new MockPikeProcess();
            const error: Error[] = [];

            proc.on('error', (err) => error.push(err));
            const err = new Error('Spawn failed');
            proc.simulateError(err);

            assert.equal(error.length, 1);
            assert.equal(error[0]?.message, 'Spawn failed');
        });

        it('should track sent messages', () => {
            const proc = new MockPikeProcess();

            proc.send('{"id":1,"method":"test"}');
            proc.send('{"id":2,"method":"test"}');

            assert.equal(proc.messagesSent.length, 2);
            assert.equal(proc.messagesSent[0], '{"id":1,"method":"test"}');
            assert.equal(proc.messagesSent[1], '{"id":2,"method":"test"}');
        });

        it('should throw when sending to killed process', () => {
            const proc = new MockPikeProcess();
            proc.kill();

            assert.throws(
                () => proc.send('test'),
                { message: 'PikeProcess not running' }
            );
        });

        it('should report alive status correctly', () => {
            const proc = new MockPikeProcess();

            assert.equal(proc.isAlive(), true);
            proc.kill();
            assert.equal(proc.isAlive(), false);
        });

        it('should have a non-zero PID', () => {
            const proc = new MockPikeProcess();

            assert.ok(typeof proc.pid === 'number');
            assert.ok(proc.pid > 0);
        });
    });

    describe('Integration tests (requires Pike)', () => {
        let realProc: PikeProcess | null = null;

        it('should spawn real Pike process (if available)', async () => {
            // This test requires Pike to be installed
            // It may be skipped in CI environments without Pike
            try {
                const { spawn } = await import('child_process');
                const testProc = spawn('pike', ['--version']);

                await new Promise((resolve, reject) => {
                    testProc.on('close', (code) => {
                        if (code === 0) resolve(undefined);
                        else reject(new Error('Pike not available'));
                    });
                    testProc.on('error', reject);
                    setTimeout(() => reject(new Error('Timeout')), 5000);
                });
            } catch {
                // Pike not available, skip this test
                return;
            }

            // Pike is available, run integration test
            const analyzerPath = '../../pike-scripts/analyzer.pike';
            realProc = new PikeProcess();

            const events: string[] = [];
            realProc.on('message', () => events.push('message'));
            realProc.on('stderr', () => events.push('stderr'));

            realProc.spawn(analyzerPath, 'pike');

            assert.ok(realProc.isAlive());
            assert.ok(realProc.pid !== null);

            // Clean up
            realProc.kill();

            await new Promise(resolve => setTimeout(resolve, 100));
            assert.equal(realProc.isAlive(), false);
        });

        it('should send data to real process (if available)', async () => {
            if (!realProc || !realProc.isAlive()) {
                return; // Skip if real process not available
            }

            // Should not throw
            realProc.send('{"jsonrpc":"2.0","id":999,"method":"parse","params":{"code":"int x;","filename":"test.pike"}}');

            // Clean up
            realProc.kill();
        });
    });
});
