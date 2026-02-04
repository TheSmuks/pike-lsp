/**
 * Pike Process - Low-level subprocess IPC wrapper
 *
 * Manages the Pike interpreter subprocess using JSON-RPC over stdin/stdout.
 * This class handles ONLY IPC mechanics (spawn, readline, events).
 * Business logic (request correlation, timeouts) is handled by PikeBridge.
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

/**
 * Events emitted by PikeProcess
 */
export interface PikeProcessEvents {
    /** A complete JSON-RPC response line received from stdout */
    'message': (line: string) => void;
    /** stderr output from the Pike process */
    'stderr': (data: string) => void;
    /** Process exited with exit code */
    'exit': (code: number | null) => void;
    /** Process failed to start or encountered an error */
    'error': (err: Error) => void;
}

/**
 * Low-level wrapper for the Pike subprocess.
 *
 * Handles subprocess lifecycle and line-based JSON-RPC communication.
 * Does NOT handle request correlation, timeouts, or deduplication -
 * those are the responsibility of PikeBridge.
 *
 * @example
 * ```ts
 * const process = new PikeProcess();
 * process.on('message', (line) => console.log('Got:', line));
 * process.spawn('/path/to/analyzer.pike', 'pike');
 * process.send('{"jsonrpc":"2.0","id":1,"method":"parse","params":{...}}');
 * process.kill();
 * ```
 */
export class PikeProcess extends EventEmitter {
    private process: ChildProcess | null = null;
    private readlineInterface: readline.Interface | null = null;
    private _pikePath: string;
    private _analyzerPath: string;

    constructor() {
        super();
        this._pikePath = 'pike';
        this._analyzerPath = '';
    }

    /**
     * Start the Pike subprocess.
     *
     * Spawns the Pike interpreter with the analyzer script and sets up
     * line-based reading of stdout to prevent JSON fragmentation.
     *
     * @param analyzerPath - Path to the analyzer.pike script
     * @param pikePath - Path to Pike executable (default: 'pike')
     * @param env - Environment variables to pass to subprocess
     * @throws Error if spawn fails or pipes cannot be created
     */
    spawn(analyzerPath: string, pikePath: string = 'pike', env: NodeJS.ProcessEnv = {}): void {
        if (this.process) {
            throw new Error('PikeProcess already spawned. Call kill() first.');
        }

        this._analyzerPath = analyzerPath;
        this._pikePath = pikePath;

        this.process = spawn(pikePath, [analyzerPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...env }
        });

        if (!this.process.stdout || !this.process.stdin) {
            this.process = null;
            throw new Error('Failed to create stdin/stdout pipes for Pike subprocess');
        }

        // Line-by-line reading (CRITICAL - prevents JSON fragmentation and stdin bug)
        this.readlineInterface = readline.createInterface({
            input: this.process.stdout,
            crlfDelay: Infinity, // Recognize \r\n as single newline
        });

        this.readlineInterface.on('line', (line) => {
            this.emit('message', line);
        });

        // Forward stderr to listeners
        this.process.stderr?.on('data', (data: Buffer) => {
            this.emit('stderr', data.toString());
        });

        // Handle process exit
        this.process.on('close', (code) => {
            this.emit('exit', code);
            this.process = null;
            this.readlineInterface = null;
        });

        // Handle spawn errors
        this.process.on('error', (err) => {
            this.emit('error', err);
            this.process = null;
            this.readlineInterface = null;
        });
    }

    /**
     * Send a JSON-RPC request to the Pike subprocess.
     *
     * Appends newline to ensure complete message delivery.
     *
     * @param json - JSON string to send
     * @throws Error if process is not running or stdin is not writable
     */
    send(json: string): void {
        if (!this.process?.stdin?.writable) {
            throw new Error('PikeProcess not running or stdin not writable');
        }
        this.process.stdin.write(json + '\n');
    }

    /**
     * Terminate the Pike subprocess.
     *
     * Closes the readline interface and sends SIGTERM to the process.
     * Use this for graceful shutdown. For immediate termination, the caller
     * may need to send SIGKILL after a timeout.
     */
    kill(): void {
        this.readlineInterface?.close();
        this.process?.kill('SIGTERM');
        this.process = null;
        this.readlineInterface = null;
    }

    /**
     * Check if the subprocess is currently running.
     *
     * @returns true if the process exists and has not been killed
     */
    isAlive(): boolean {
        return this.process !== null && !this.process.killed;
    }

    /**
     * Get the process ID of the running subprocess.
     *
     * @returns PID if process is running, null otherwise
     */
    get pid(): number | null {
        return this.process?.pid ?? null;
    }

    /**
     * Get the Pike executable path.
     */
    get pikePath(): string {
        return this._pikePath;
    }

    /**
     * Get the analyzer script path.
     */
    get analyzerPath(): string {
        return this._analyzerPath;
    }
}
