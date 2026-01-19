/**
 * Pike Bridge
 *
 * Manages Pike subprocess lifecycle and provides methods for parsing,
 * tokenization, and symbol extraction using Pike's native utilities.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import type {
    PikeParseResult,
    PikeToken,
    PikeSymbol,
    PikeDiagnostic,
    PikeRequest,
    PikeResponse,
} from './types.js';
import { BRIDGE_TIMEOUT_DEFAULT, BATCH_PARSE_MAX_SIZE } from './constants.js';

/**
 * Configuration options for the PikeBridge.
 */
export interface PikeBridgeOptions {
    /** Path to Pike executable. Defaults to 'pike'. */
    pikePath?: string;
    /** Path to analyzer.pike script. Auto-detected if not specified. */
    analyzerPath?: string;
    /** Request timeout in milliseconds. Defaults to 30000 (30 seconds). */
    timeout?: number;
    /** Enable debug logging to stderr. */
    debug?: boolean;
    env?: NodeJS.ProcessEnv
}

/**
 * Result of a bridge health check.
 */
export interface BridgeHealthCheck {
    /** Whether Pike executable is available. */
    pikeAvailable: boolean;
    /** Detected Pike version (e.g., "8.0"). */
    pikeVersion: string | null;
    /** Whether analyzer.pike script exists. */
    analyzerExists: boolean;
    /** Path to the analyzer script. */
    analyzerPath: string;
    /** Whether the bridge can start successfully. */
    canStart: boolean;
    /** Error message if health check failed. */
    error?: string;
}

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

/**
 * PikeBridge - Communication layer with Pike subprocess.
 *
 * Manages a Pike subprocess that provides parsing, tokenization, and symbol
 * extraction capabilities using Pike's native utilities. Uses JSON-RPC protocol
 * over stdin/stdout for communication.
 *
 * @example
 * ```ts
 * const bridge = new PikeBridge({ pikePath: 'pike' });
 * await bridge.start();
 * const result = await bridge.parse('int x = 5;', 'test.pike');
 * console.log(result.symbols);
 * await bridge.stop();
 * ```
 */
export class PikeBridge extends EventEmitter {
    private process: ChildProcess | null = null;
    private requestId = 0;
    private pendingRequests = new Map<number, PendingRequest>();
    private inflightRequests = new Map<string, Promise<unknown>>();
    private readline: readline.Interface | null = null;
    private readonly options: Required<PikeBridgeOptions>;
    private started = false;
    private debugLog: (message: string) => void;

    constructor(options: PikeBridgeOptions = {}) {
        super();

        // Default analyzer path relative to this file (ESM-compatible)
        const resolvedFilename =
            typeof __filename === 'string' ? __filename : fileURLToPath(import.meta.url);
        const resolvedDirname = path.dirname(resolvedFilename);
        const defaultAnalyzerPath = path.resolve(
            resolvedDirname,
            '..',
            '..',
            '..',
            'pike-scripts',
            'analyzer.pike'
        );

        const debug = options.debug ?? false;
        this.debugLog = debug
            ? (message: string) => console.error(`[PikeBridge DEBUG] ${message}`)
            : () => {};

        this.options = {
            pikePath: options.pikePath ?? 'pike',
            analyzerPath: options.analyzerPath ?? defaultAnalyzerPath,
            timeout: options.timeout ?? BRIDGE_TIMEOUT_DEFAULT,
            debug,
            env: options.env ?? {},
        };

        this.debugLog(`Initialized with pikePath="${this.options.pikePath}", analyzerPath="${this.options.analyzerPath}"`);
    }

    /**
     * Start the Pike subprocess.
     *
     * Spawns the Pike interpreter with the analyzer script. If the process
     * is already running, this method returns immediately.
     *
     * @throws Error if the subprocess fails to start.
     * @emits started when the subprocess is ready.
     */
    async start(): Promise<void> {
        if (this.process) {
            this.debugLog('Process already running, skipping start');
            return;
        }

        this.debugLog(`Starting Pike subprocess: ${this.options.pikePath} ${this.options.analyzerPath}`);
        this.emit('stderr', 'Env: ' + JSON.stringify(this.options.env));
        
        return new Promise((resolve, reject) => {
            try {
                this.process = spawn(this.options.pikePath, [this.options.analyzerPath], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: {...process.env, ...this.options.env}
                });

                this.debugLog(`Pike subprocess spawned with PID: ${this.process.pid}`);

                if (!this.process.stdout || !this.process.stdin) {
                    const error = 'Failed to create Pike subprocess pipes';
                    this.debugLog(`ERROR: ${error}`);
                    reject(new Error(error));
                    return;
                }

                // Set up readline interface for reading responses
                this.readline = readline.createInterface({
                    input: this.process.stdout,
                    crlfDelay: Infinity,
                });

                this.readline.on('line', (line) => {
                    this.debugLog(`Received line: ${line.substring(0, 100)}...`);
                    this.handleResponse(line);
                });

                this.process.stderr?.on('data', (data: Buffer) => {
                    // Log Pike warnings/errors but don't fail
                    const message = data.toString().trim();
                    if (message) {
                        // Filter out false positive warnings from Pike's native parser
                        // These occur when parsing Pike's own stdlib which contains mixed C/Pike code
                        const suppressedPatterns = [
                            /^Illegal comment/,
                            /^Missing ['"]>?['"]\)/,
                        ];
                        const isSuppressed = suppressedPatterns.some(p => p.test(message));

                        if (!isSuppressed) {
                            this.debugLog(`STDERR: ${message}`);
                            this.emit('stderr', message);
                        } else {
                            this.debugLog(`STDERR (suppressed): ${message}`);
                        }
                    }
                });

                this.process.on('close', (code) => {
                    this.debugLog(`Process closed with code: ${code}`);
                    this.started = false;
                    this.process = null;
                    this.readline = null;
                    this.emit('close', code);

                    // Reject all pending requests
                    for (const [_id, pending] of this.pendingRequests) {
                        clearTimeout(pending.timeout);
                        const error = new Error(`Pike process exited with code ${code}`);
                        this.debugLog(`Rejecting pending request: ${error.message}`);
                        pending.reject(error);
                    }
                    this.pendingRequests.clear();
                });

                this.process.on('error', (err) => {
                    this.debugLog(`Process error event: ${err.message}`);
                    this.started = false;
                    reject(new Error(`Failed to start Pike subprocess: ${err.message}`));
                });

                // Give the process a moment to start
                setTimeout(() => {
                    this.started = true;
                    this.debugLog('Pike subprocess started successfully');
                    this.emit('started');
                    resolve();
                }, 100);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.debugLog(`Exception during start: ${message}`);
                reject(new Error(`Failed to start Pike bridge: ${message}`));
            }
        });
    }

    /**
     * Stop the Pike subprocess.
     *
     * Gracefully terminates the subprocess by closing stdin and sending
     * SIGTERM, then waiting for process to exit. Falls back to SIGKILL
     * if the process doesn't terminate within the timeout.
     *
     * @emits stopped when the subprocess has terminated.
     */
    async stop(): Promise<void> {
        if (this.process) {
            const proc = this.process;
            this.debugLog('Stopping Pike subprocess...');

            // Close stdin to signal end of input
            proc.stdin?.end();

            // Send SIGTERM for graceful shutdown
            proc.kill('SIGTERM');

            // Wait for process to terminate gracefully, or force kill after timeout
            const terminated = await new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    this.debugLog('Process did not terminate gracefully, sending SIGKILL');
                    proc.kill('SIGKILL');
                    resolve(false);
                }, 2000); // 2 second grace period

                proc.once('close', () => {
                    clearTimeout(timeout);
                    resolve(true);
                });
            });

            this.debugLog(`Pike subprocess ${terminated ? 'terminated gracefully' : 'was killed forcefully'}`);
            this.process = null;
            this.readline = null;
            this.started = false;
        }
        this.emit('stopped');
    }

    /**
     * Check if the bridge is running.
     *
     * @returns `true` if the subprocess is started and connected.
     */
    isRunning(): boolean {
        return this.started && this.process !== null;
    }

    /**
     * Generate cache key for request deduplication
     */
    private getRequestKey(method: string, params: Record<string, unknown>): string {
        return `${method}:${JSON.stringify(params)}`;
    }

    /**
     * Send a request to the Pike subprocess with deduplication
     */
    private async sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
        // Check for inflight request with same method and params
        const requestKey = this.getRequestKey(method, params);
        const existing = this.inflightRequests.get(requestKey);

        if (existing) {
            // Reuse the existing inflight request
            return existing as Promise<T>;
        }

        if (!this.process?.stdin || !this.started) {
            await this.start();
        }

        // Create new request and track it as inflight
        const promise = new Promise<T>((resolve, reject) => {
            const id = ++this.requestId;

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request ${id} timed out after ${this.options.timeout}ms`));
            }, this.options.timeout);

            this.pendingRequests.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeout,
            });

            const request: PikeRequest = { id, method: method as PikeRequest['method'], params };
            const json = JSON.stringify(request);

            this.process?.stdin?.write(json + '\n');
        });

        // Track as inflight
        this.inflightRequests.set(requestKey, promise);

        // Remove from inflight when done (success or failure)
        promise.finally(() => {
            this.inflightRequests.delete(requestKey);
        });

        return promise;
    }

    /**
     * Handle a response from the Pike subprocess
     */
    private handleResponse(line: string): void {
        try {
            const response: PikeResponse = JSON.parse(line);
            const pending = this.pendingRequests.get(response.id);

            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(response.id);

                if (response.error) {
                    pending.reject(new Error(response.error.message));
                } else {
                    pending.resolve(response.result);
                }
            }
        } catch {
            // Ignore non-JSON lines (might be Pike debug output)
            this.emit('stderr', line);
        }
    }

    /**
     * Parse Pike source code and extract symbols.
     *
     * Uses Pike's native parser to extract declarations without compilation.
     *
     * @param code - Pike source code to parse.
     * @param filename - Optional filename for error messages.
     * @returns Parse result containing symbols and diagnostics.
     * @example
     * ```ts
     * const result = await bridge.parse('int x = 5;', 'test.pike');
     * console.log(result.symbols); // [{ name: 'x', kind: 'variable', ... }]
     * ```
     */
    async parse(code: string, filename?: string): Promise<PikeParseResult> {
        const result = await this.sendRequest<{
            symbols: PikeSymbol[];
            diagnostics: PikeDiagnostic[];
        }>('parse', {
            code,
            filename: filename ?? 'input.pike',
            line: 1,
        });

        return {
            symbols: result.symbols,
            diagnostics: result.diagnostics,
        };
    }

    /**
     * Tokenize Pike source code.
     *
     * Returns the lexical tokens from Pike's tokenizer, useful for
     * syntax highlighting and accurate symbol position finding.
     *
     * @param code - Pike source code to tokenize.
     * @returns Array of tokens with position information.
     * @example
     * ```ts
     * const tokens = await bridge.tokenize('int x = 5;');
     * // [{ type: 'keyword', text: 'int', line: 1, column: 1 }, ...]
     * ```
     */
    async tokenize(code: string): Promise<PikeToken[]> {
        const result = await this.sendRequest<{ tokens: PikeToken[] }>('tokenize', {
            code,
        });

        return result.tokens;
    }

    /**
     * Compile Pike code and get diagnostics.
     *
     * Compiles the code using Pike's compiler and returns all errors
     * and warnings. Useful for real-time validation.
     *
     * @param code - Pike source code to compile.
     * @param filename - Optional filename for error messages.
     * @returns Parse result with diagnostics from compilation.
     * @example
     * ```ts
     * const result = await bridge.compile('int x = ;', 'test.pike');
     * console.log(result.diagnostics); // [{ severity: 'error', message: '...', ... }]
     * ```
     */
    async compile(code: string, filename?: string): Promise<PikeParseResult> {
        const result = await this.sendRequest<{
            symbols: PikeSymbol[];
            diagnostics: PikeDiagnostic[];
        }>('compile', {
            code,
            filename: filename ?? 'input.pike',
        });

        return {
            symbols: result.symbols,
            diagnostics: result.diagnostics,
        };
    }

    /**
     * Resolve a module path to a file location.
     *
     * Resolves Pike module import paths to actual file system paths.
     * Handles both absolute module paths (e.g., "Stdio.File") and
     * relative imports (e.g., ".MyModule").
     *
     * @param modulePath - Module path to resolve (e.g., "Crypto.SHA256" or ".SHA256").
     * @param currentFile - Current file path for resolving relative modules.
     * @returns Absolute file path if found, `null` otherwise.
     * @example
     * ```ts
     * const path = await bridge.resolveModule('Stdio.File');
     * // Returns: "/usr/local/pike/8.0/lib/modules/Stdio.pmod/File.pike"
     * ```
     */
    async resolveModule(modulePath: string, currentFile?: string): Promise<string | null> {
        const result = await this.sendRequest<{
            path: string | null;
            exists: boolean;
        }>('resolve', {
            module: modulePath,
            currentFile: currentFile || undefined,
        });

        return result.exists ? result.path : null;
    }

    /**
     * Introspect Pike code through compilation.
     *
     * Compiles the code and uses Pike's `_typeof` operator to extract
     * full type information via runtime introspection. Provides complete
     * type signatures for functions, classes, and variables.
     *
     * @param code - Pike source code to introspect.
     * @param filename - Optional filename for error messages.
     * @returns Introspection result with detailed type information.
     * @example
     * ```ts
     * const result = await bridge.introspect('class Foo { int bar(); }');
     * console.log(result.symbols[0].type); // "function(int:void)"
     * ```
     */
    async introspect(code: string, filename?: string): Promise<import('./types.js').IntrospectionResult> {
        const result = await this.sendRequest<import('./types.js').IntrospectionResult>('introspect', {
            code,
            filename: filename ?? 'input.pike',
        });

        return result;
    }

    /**
     * Resolve a Pike standard library module.
     *
     * Loads and introspects a module from Pike's standard library.
     * Uses lazy on-demand loading to avoid unnecessary overhead.
     *
     * @param modulePath - Dot-separated module path (e.g., "Stdio.File").
     * @returns Stdlib module information with symbols and inheritance.
     * @example
     * ```ts
     * const result = await bridge.resolveStdlib('Stdio.File');
     * console.log(result.symbols); // All symbols from Stdio.File
     * ```
     */
    async resolveStdlib(modulePath: string): Promise<import('./types.js').StdlibResolveResult> {
        const result = await this.sendRequest<import('./types.js').StdlibResolveResult>('resolve_stdlib', {
            module: modulePath,
        });

        return result;
    }

    /**
     * Get inherited members from a class.
     *
     * Returns all members (methods, variables, constants) that a class
     * inherits from its parent classes and implemented interfaces.
     *
     * @param className - Fully qualified class name (e.g., "SSL.File").
     * @returns Inherited members with their source classes.
     * @example
     * ```ts
     * const result = await bridge.getInherited('SSL.File');
     * console.log(result.members); // [{ name: 'read', sourceClass: 'Stdio.File', ... }]
     * ```
     */
    async getInherited(className: string): Promise<import('./types.js').InheritedMembersResult> {
        const result = await this.sendRequest<import('./types.js').InheritedMembersResult>('get_inherited', {
            class: className,
        });

        return result;
    }

    /**
     * Enable or disable debug mode in the analyzer.
     *
     * When debug mode is disabled, the analyzer skips string formatting
     * for debug messages, improving performance.
     *
     * @param enabled - Whether to enable debug mode.
     * @returns Confirmation with the new debug mode state.
     */
    async setDebug(enabled: boolean): Promise<{ debug_mode: number; message: string }> {
        return this.sendRequest('set_debug', { enabled: enabled ? 1 : 0 }) as Promise<{
            debug_mode: number;
            message: string;
        }>;
    }

    /**
     * Find all identifier occurrences using Pike tokenization.
     *
     * Uses Pike's native tokenizer to find exact positions of all
     * identifiers in the code. More accurate than regex-based searching
     * as it understands Pike's lexical grammar.
     *
     * @param code - Pike source code to search.
     * @returns All token occurrences with line and character positions.
     * @example
     * ```ts
     * const result = await bridge.findOccurrences('int x = x + 1;');
     * console.log(result.occurrences); // [{ text: 'x', line: 1, character: 5 }, ...]
     * ```
     */
    async findOccurrences(code: string): Promise<import('./types.js').FindOccurrencesResult> {
        return this.sendRequest<import('./types.js').FindOccurrencesResult>('find_occurrences', { code });
    }

    /**
     * Parse multiple files in a single batch request.
     *
     * Reduces IPC overhead during workspace indexing by processing
     * multiple files in one request. Automatically splits large batches
     * into chunks to prevent memory issues.
     *
     * @param files - Array of file objects with code and filename.
     * @returns Batch parse results with symbols and diagnostics for each file.
     * @example
     * ```ts
     * const results = await bridge.batchParse([
     *   { code: 'int x = 1;', filename: 'file1.pike' },
     *   { code: 'int y = 2;', filename: 'file2.pike' },
     * ]);
     * console.log(results.count); // 2
     * ```
     */
    /**
     * Analyze Pike code for uninitialized variable usage.
     *
     * Performs dataflow analysis to detect variables that may be used
     * before being initialized. Only warns for types where uninitialized
     * access would cause runtime errors (string, array, mapping, etc.),
     * not for int/float which auto-initialize to 0.
     *
     * @param code - Pike source code to analyze.
     * @param filename - Optional filename for error messages.
     * @returns Analysis result with diagnostics for uninitialized variables.
     * @example
     * ```ts
     * const result = await bridge.analyzeUninitialized('string s; write(s);', 'test.pike');
     * console.log(result.diagnostics); // [{ message: "Variable 's' may be uninitialized", ... }]
     * ```
     */
    async analyzeUninitialized(code: string, filename?: string): Promise<import('./types.js').AnalyzeUninitializedResult> {
        const result = await this.sendRequest<import('./types.js').AnalyzeUninitializedResult>('analyze_uninitialized', {
            code,
            filename: filename ?? 'input.pike',
        });

        return result;
    }

    /**
     * Get completion context at a specific position using Pike's tokenizer.
     * This replaces regex-based heuristics with Pike's accurate tokenization.
     *
     * @param code - Source code to analyze
     * @param line - Line number (1-based)
     * @param character - Character position (0-based)
     * @returns Completion context with type, object name, and prefix
     * @example
     * ```ts
     * const ctx = await bridge.getCompletionContext('Stdio.File f; f->w', 1, 18);
     * console.log(ctx); // { context: 'member_access', objectName: 'f', prefix: 'w', operator: '->' }
     * ```
     */
    async getCompletionContext(code: string, line: number, character: number): Promise<import('./types.js').CompletionContext> {
        const result = await this.sendRequest<import('./types.js').CompletionContext>('get_completion_context', {
            code,
            line,
            character,
        });

        return result;
    }

    async batchParse(files: Array<{ code: string; filename: string }>): Promise<import('./types.js').BatchParseResult> {
        // Limit batch size to prevent memory issues
        if (files.length > BATCH_PARSE_MAX_SIZE) {
            // Split into chunks and process sequentially
            const chunks: Array<typeof files> = [];
            for (let i = 0; i < files.length; i += BATCH_PARSE_MAX_SIZE) {
                chunks.push(files.slice(i, i + BATCH_PARSE_MAX_SIZE));
            }

            // Process chunks and combine results
            const allResults: import('./types.js').BatchParseFileResult[] = [];
            for (const chunk of chunks) {
                const result = await this.sendRequest<import('./types.js').BatchParseResult>('batch_parse', {
                    files: chunk,
                });
                allResults.push(...result.results);
            }

            return {
                results: allResults,
                count: allResults.length,
            };
        }

        return this.sendRequest<import('./types.js').BatchParseResult>('batch_parse', { files });
    }

    /**
     * Check if the Pike executable is available.
     *
     * @returns `true` if Pike can be executed.
     */
    async checkPike(): Promise<boolean> {
        return new Promise((resolve) => {
            const proc = spawn(this.options.pikePath, ['--version']);
            proc.on('close', (code) => {
                resolve(code === 0);
            });
            proc.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Get the Pike version.
     *
     * @returns Version string (e.g., "8.0") or `null` if Pike is not available.
     */
    async getVersion(): Promise<string | null> {
        this.debugLog('Getting Pike version...');
        return new Promise((resolve) => {
            const proc = spawn(this.options.pikePath, ['--version']);
            let output = '';
            // Pike outputs version to stderr, not stdout
            proc.stderr?.on('data', (data: Buffer) => {
                output += data.toString();
            });
            proc.stdout?.on('data', (data: Buffer) => {
                output += data.toString();
            });
            proc.on('close', (code) => {
                this.debugLog(`Pike --version exited with code ${code}, output: "${output.trim()}"`);
                if (code === 0) {
                    const match = output.match(/Pike v(\d+\.\d+)/);
                    resolve(match?.[1] ?? null);
                } else {
                    resolve(null);
                }
            });
            proc.on('error', (err) => {
                this.debugLog(`Pike --version error: ${err.message}`);
                resolve(null);
            });
        });
    }

    /**
     * Perform a comprehensive health check.
     *
     * Checks Pike availability, version, and analyzer script existence.
     * Useful for diagnosing configuration issues.
     *
     * @returns Health check result with detailed diagnostics.
     * @example
     * ```ts
     * const health = await bridge.healthCheck();
     * if (!health.canStart) {
     *   console.error(health.error);
     * }
     * ```
     */
    async healthCheck(): Promise<BridgeHealthCheck> {
        this.debugLog('Performing health check...');

        const result: BridgeHealthCheck = {
            pikeAvailable: false,
            pikeVersion: null,
            analyzerExists: false,
            analyzerPath: this.options.analyzerPath,
            canStart: false,
        };

        // Check if Pike executable is available
        try {
            const pikeVersion = await this.getVersion();
            result.pikeVersion = pikeVersion;
            result.pikeAvailable = pikeVersion !== null;

            if (!result.pikeAvailable) {
                result.error = `Pike executable not found at "${this.options.pikePath}". Please install Pike or configure the correct path.`;
                this.debugLog(`Health check failed: ${result.error}`);
                return result;
            }

            this.debugLog(`Pike version ${pikeVersion} detected`);
        } catch (err) {
            result.error = `Error checking Pike: ${err instanceof Error ? err.message : String(err)}`;
            this.debugLog(`Health check failed: ${result.error}`);
            return result;
        }

        // Check if analyzer script exists
        const fs = await import('fs');
        try {
            result.analyzerExists = fs.existsSync(this.options.analyzerPath);
            if (!result.analyzerExists) {
                result.error = `Analyzer script not found at "${this.options.analyzerPath}". The Pike LSP server requires this file.`;
                this.debugLog(`Health check failed: ${result.error}`);
                return result;
            }
            this.debugLog(`Analyzer script found at ${this.options.analyzerPath}`);
        } catch (err) {
            result.error = `Error checking analyzer: ${err instanceof Error ? err.message : String(err)}`;
            this.debugLog(`Health check failed: ${result.error}`);
            return result;
        }

        // All checks passed
        result.canStart = true;
        this.debugLog('Health check passed - bridge can start');
        return result;
    }

    /**
     * Get diagnostic information for debugging.
     *
     * Returns the current configuration and state of the bridge.
     *
     * @returns Diagnostic information including options, running state, and PID.
     */
    getDiagnostics(): { options: Required<PikeBridgeOptions>; isRunning: boolean; pid: number | null } {
        return {
            options: { ...this.options },
            isRunning: this.isRunning(),
            pid: this.process?.pid ?? null,
        };
    }
}
