/**
 * Pike Bridge
 *
 * Manages Pike subprocess lifecycle and provides methods for parsing,
 * tokenization, and symbol extraction using Pike's native utilities.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { PikeProcess } from './process.js';
import type {
    PikeParseResult,
    PikeToken,
    PikeSymbol,
    PikeDiagnostic,
    PikeRequest,
    PikeResponse,
    PikeVersionInfo,
    AnalyzeResponse,
    AnalysisOperation,
} from './types.js';
import { BRIDGE_TIMEOUT_DEFAULT, BATCH_PARSE_MAX_SIZE, PROCESS_STARTUP_DELAY, GRACEFUL_SHUTDOWN_DELAY } from './constants.js';
import { Logger } from '@pike-lsp/core';
import { PikeError } from '@pike-lsp/core';
import { RateLimiter } from './rate-limiter.js';
import { assertString, assertNumber, assertStringArray, type ResponseValidator } from './response-validator.js';

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
    /** Rate limiting options (disabled by default). */
    rateLimit?: {
        /** Maximum number of requests allowed. Defaults to 100. */
        maxRequests?: number;
        /** Time window in seconds. Defaults to 10. */
        windowSeconds?: number;
    };
}

/**
 * Internal options with all required properties (as used internally).
 */
interface InternalBridgeOptions {
    pikePath: string;
    analyzerPath: string;
    timeout: number;
    debug: boolean;
    env: NodeJS.ProcessEnv;
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
 * Cached tokenization data for a document
 * PERF-003: Only splitTokens are cached since PikeToken objects are not JSON-serializable
 */
interface CachedTokens {
    /** Document version (LSP version number) */
    version: number;
    /** Split tokens from Parser.Pike.split (JSON-serializable string array) */
    splitTokens: string[];
    /** Cache timestamp for LRU eviction */
    timestamp: number;
}

/**
 * PERF-007: Metrics for batch parse operations
 */
interface BatchParseMetrics {
    totalMs: number;
    chunkingMs: number;
    ipcMs: number;
    chunkCount: number;
    fileCount: number;
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
    private process: PikeProcess | null = null;
    private requestId = 0;
    private pendingRequests = new Map<number, PendingRequest>();
    private requestCache = new Map<string, Promise<unknown>>();
    /** PERF-003: Tokenization cache for completion context */
    private tokenCache = new Map<string, CachedTokens>();
    /** PERF-003: Maximum number of cached documents */
    private readonly MAX_TOKEN_CACHE_SIZE = 50;

    /** Internal options (excluding rateLimit which is handled separately) */
    private readonly options: InternalBridgeOptions;

    private started = false;
    private readonly logger = new Logger('PikeBridge');
    private debugLog: (message: string) => void;
    private rateLimiter: RateLimiter | null;

    constructor(options: PikeBridgeOptions = {}) {
        super();

        const debug = options.debug ?? false;
        this.debugLog = debug
            ? (message: string) => this.logger.error(`[DEBUG] ${message}`)
            : () => {};

        // Determine analyzer path
        // If provided in options, use it. Otherwise, search for pike-scripts directory.
        let defaultAnalyzerPath: string;
        if (options.analyzerPath) {
            // Use provided path directly, skip search
            defaultAnalyzerPath = options.analyzerPath;
            this.debugLog(`Using provided analyzer path: ${defaultAnalyzerPath}`);
        } else {
            // Search for pike-scripts directory relative to this file
            // ESM-compatible path resolution
            const modulePath = fileURLToPath(import.meta.url);
            const resolvedDirname = path.dirname(modulePath);
            this.debugLog(`Searching for pike-scripts from: ${resolvedDirname}`);

            // Search upward for the pike-scripts directory (handles both workspace and package layouts)
            defaultAnalyzerPath = path.resolve('pike-scripts', 'analyzer.pike'); // fallback
            let searchPath = resolvedDirname;
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
                const candidate = path.resolve(searchPath, 'pike-scripts', 'analyzer.pike');
                if (fs.existsSync(candidate)) {
                    defaultAnalyzerPath = candidate;
                    this.debugLog(`Found pike-scripts at: ${defaultAnalyzerPath}`);
                    break;
                }
                const parent = path.resolve(searchPath, '..');
                if (parent === searchPath) {
                    // Reached filesystem root
                    break;
                }
                searchPath = parent;
                attempts++;
            }
        }

        this.options = {
            pikePath: options.pikePath ?? 'pike',
            analyzerPath: defaultAnalyzerPath,
            timeout: options.timeout ?? BRIDGE_TIMEOUT_DEFAULT,
            debug,
            env: options.env ?? {},
        };

        // Initialize rate limiter if configured (disabled by default)
        if (options.rateLimit) {
            const maxRequests = options.rateLimit.maxRequests ?? 100;
            const windowSeconds = options.rateLimit.windowSeconds ?? 10;
            const refillRate = maxRequests / windowSeconds;
            this.rateLimiter = new RateLimiter(maxRequests, refillRate);
            this.debugLog(`Rate limiter enabled: ${maxRequests} requests per ${windowSeconds}s`);
        } else {
            this.rateLimiter = null;
        }

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

        const pikeProc = new PikeProcess();

        return new Promise((resolve, reject) => {
            // Set up event handlers before spawning
            pikeProc.once('error', (err) => {
                this.debugLog(`Process error event: ${err.message}`);
                this.started = false;
                reject(new Error(`Failed to start Pike subprocess: ${err.message}`));
            });

            // Forward stderr events
            pikeProc.on('stderr', (data) => {
                const message = data.trim();
                if (message) {
                    // Filter out false positive warnings from Pike's native parser
                    // These occur when parsing Pike's own stdlib which contains mixed C/Pike code
                    const suppressedPatterns = [
                        /^Illegal comment/,
                        /^Missing ['"]>?['"]\)/,
                    ];
                    const isSuppressed = suppressedPatterns.some(p => p.test(message));

                    if (!isSuppressed) {
                        this.logger.debug('Pike stderr', { raw: message });
                        this.emit('stderr', message);
                    } else {
                        this.logger.trace('Pike stderr (suppressed)', { raw: message });
                    }
                }
            });

            // Handle message events (JSON-RPC responses)
            pikeProc.on('message', (line) => {
                this.debugLog(`Received line: ${line.substring(0, 100)}...`);
                this.handleResponse(line);
            });

            // Handle exit events - reject pending requests
            pikeProc.on('exit', (code) => {
                this.debugLog(`Process closed with code: ${code}`);
                this.started = false;
                this.process = null;
                this.emit('close', code);

                // Reject all pending requests
                for (const [_id, pending] of this.pendingRequests) {
                    clearTimeout(pending.timeout);
                    const error = new PikeError(`Pike process exited with code ${code}`);
                    this.debugLog(`Rejecting pending request: ${error.message}`);
                    pending.reject(error);
                }
                this.pendingRequests.clear();
            });

            // Spawn the process
            try {
                pikeProc.spawn(this.options.analyzerPath, this.options.pikePath, this.options.env);
                this.debugLog(`Pike subprocess spawned with PID: ${pikeProc.pid}`);
                this.process = pikeProc;

                // Give the process a moment to start
                setTimeout(() => {
                    this.started = true;
                    this.debugLog('Pike subprocess started successfully');
                    this.emit('started');
                    resolve();
                }, PROCESS_STARTUP_DELAY);
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
            this.debugLog('Stopping Pike subprocess...');
            const proc = this.process;

            // Graceful shutdown via PikeProcess
            proc.kill();

            // Wait a moment for cleanup
            await new Promise(resolve => setTimeout(resolve, GRACEFUL_SHUTDOWN_DELAY));

            this.debugLog('Pike subprocess stopped');
            this.process = null;
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
        return this.started && this.process !== null && this.process.isAlive();
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
    private async sendRequest<T>(method: string, params: Record<string, unknown>, validate?: ResponseValidator<T>): Promise<T> {
        // Check rate limit (if configured)
        if (this.rateLimiter && !this.rateLimiter.tryAcquire()) {
            throw new PikeError('Rate limit exceeded');
        }

        // Check for inflight request with same method and params
        const requestKey = this.getRequestKey(method, params);
        const existing = this.requestCache.get(requestKey);

        if (existing) {
            // Reuse the existing inflight request
            return existing as Promise<T>;
        }

        if (!this.process || !this.process.isAlive() || !this.started) {
            await this.start();
        }

        // Create new request and track it as inflight
        const promise = new Promise<T>((resolve, reject) => {
            const id = ++this.requestId;

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new PikeError(`Request ${id} timed out after ${this.options.timeout}ms`));
            }, this.options.timeout);

            this.pendingRequests.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeout,
            });

            const request: PikeRequest = { id, method: method as PikeRequest['method'], params };
            const json = JSON.stringify(request);

            this.process?.send(json);
        });

        // Track as inflight
        this.requestCache.set(requestKey, promise);

        // Remove from inflight when done (success or failure)
        promise.finally(() => {
            this.requestCache.delete(requestKey);
        });

        // Apply runtime response validation if provided
        if (validate) {
            return promise.then(result => validate(result as unknown, method));
        }

        return promise;
    }

    /**
     * Handle a response from the Pike subprocess
     */
    private handleResponse(line: string): void {
        try {
            const response: PikeResponse = JSON.parse(line);
            const pending = this.pendingRequests.get(response.id);

            if (!pending) {
                return; // No pending request for this response
            }

            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.id);

            if (response.error) {
                this.rejectPendingRequest(pending, response.error.message);
                return;
            }

            const result = this.buildResponseResult(response);
            pending.resolve(result);
        } catch {
            // Ignore non-JSON lines (might be Pike debug output)
            this.emit('stderr', line);
        }
    }

    /**
     * Build the result object from a Pike response, attaching _perf metadata.
     */
    private buildResponseResult(response: PikeResponse): unknown {
        const perf = (response as any)._perf || {};
        const result = response.result;

        if (this.isAnalyzeResponse(response)) {
            // Return full response structure for analyze requests
            const fullResponse = {
                result,
                failures: (response as any).failures || {},
                _perf: perf,
            };
            // Copy _perf into result as well for backward compatibility
            this.attachPerformanceMetadata(fullResponse.result, perf);
            return fullResponse;
        }

        // For other requests, return the result with _perf attached
        this.attachPerformanceMetadata(result, perf);
        return result;
    }

    /**
     * Check if response is an analyze response (contains failures object).
     */
    private isAnalyzeResponse(response: PikeResponse): boolean {
        return 'failures' in response && typeof (response as any).failures === 'object';
    }

    /**
     * Reject a pending request with a PikeError.
     */
    private rejectPendingRequest(pending: PendingRequest, message: string): void {
        const error = new PikeError(
            message || 'Pike request failed',
            new Error(message)
        );
        pending.reject(error);
    }

    /**
     * Attach performance metadata to a result object if applicable.
     * Used to attach _perf data for timing and debugging information.
     */
    private attachPerformanceMetadata(result: unknown, perf: Record<string, unknown>): void {
        if (typeof result === 'object' && result !== null && Object.keys(perf).length > 0) {
            (result as Record<string, unknown>)['_perf'] = perf;
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
     * Resolve an #include path to an absolute file location.
     *
     * Resolves #include directives to actual file system paths.
     * Handles relative includes (e.g., "utils.pike") and system includes
     * (e.g., <Stdio.h>).
     *
     * @param includePath - Path from #include directive (with or without quotes/brackets).
     * @param currentFile - Current file path for resolving relative includes.
     * @returns Include resolve result with path and existence flag.
     * @example
     * ```ts
     * const result = await bridge.resolveInclude('utils.pike', '/path/to/current.pike');
     * // Returns: { path: '/path/to/utils.pike', exists: true, originalPath: 'utils.pike' }
     * ```
     */
    async resolveInclude(includePath: string, currentFile?: string): Promise<import('./types.js').IncludeResolveResult> {
        return this.sendRequest<import('./types.js').IncludeResolveResult>('resolve_include', {
            includePath,
            currentFile: currentFile || undefined,
        }, (raw, method) => {
            const r = raw as Record<string, unknown>;
            assertString(r['path'], 'path', method);
            return r as unknown as import('./types.js').IncludeResolveResult;
        });
    }

    /**
     * Unified analyze - consolidate multiple Pike operations in one request.
     *
     * Performs compilation and tokenization once, then distributes results
     * to all requested operation types. More efficient than calling parse(),
     * introspect(), and analyzeUninitialized() separately.
     *
     * Supports partial success - each requested operation appears in either
     * result or failures, never both. Use failures?.[operation] for O(1) lookup.
     *
     * @param code - Pike source code to analyze.
     * @param filename - Optional filename for error messages.
     * @param include - Which operations to perform (at least one required).
     * @param documentVersion - Optional LSP document version (for cache invalidation).
     *                          If provided, cache uses LSP version instead of file stat.
     * @returns Analyze response with result/failures structure and performance timing.
     * @example
     * ```ts
     * const response = await bridge.analyze(
     *     'class Foo { int bar() { return 5; } }',
     *     'example.pike',
     *     ['parse', 'introspect', 'diagnostics']
     * );
     *
     * // Check for specific operation success
     * if (response.result?.introspect) {
     *     console.log(response.result.introspect.symbols);
     * }
     *
     * // Check for specific operation failure
     * if (response.failures?.diagnostics) {
     *     console.error(response.failures.diagnostics.message);
     * }
     *
     * // Access performance timing
     * console.log(`Compilation took ${response._perf?.compilation_ms}ms`);
     * ```
     */
    async analyze(
        code: string,
        include: AnalysisOperation[],
        filename?: string,
        documentVersion?: number
    ): Promise<AnalyzeResponse> {
        return this.sendRequest<AnalyzeResponse>('analyze', {
            code,
            filename: filename ?? 'input.pike',
            include,
            version: documentVersion,  // Pass LSP version for cache key
        });
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
     * Query Pike's runtime include and module paths.
     *
     * Returns the current include and module paths from Pike's master(),
     * useful for resolving #include directives and module imports.
     *
     * @returns Pike runtime paths with include_paths and module_paths arrays.
     * @example
     * ```ts
     * const paths = await bridge.getPikePaths();
     * console.log(paths.include_paths); // [".", "/usr/local/pike/..."]
     * console.log(paths.module_paths); // ["/usr/local/pike/..."]
     * ```
     */
    async getPikePaths(): Promise<import('./types.js').PikePathsResult> {
        return this.sendRequest<import('./types.js').PikePathsResult>('get_pike_paths', {}, (raw, method) => {
            const r = raw as Record<string, unknown>;
            assertStringArray(r['include_paths'], 'include_paths', method);
            assertStringArray(r['module_paths'], 'module_paths', method);
            return r as unknown as import('./types.js').PikePathsResult;
        });
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
     * Extract import/include/inherit/require directives from Pike code.
     *
     * Parses Pike source code and extracts all module import directives,
     * including preprocessor directives (#include, #require) and keyword
     * statements (import, inherit).
     *
     * @param code - Pike source code to parse.
     * @param filename - Optional filename for error reporting.
     * @returns All imports found with their types and line numbers.
     * @example
     * ```ts
     * const result = await bridge.extractImports('import Stdio;\n#include "foo.h"');
     * console.log(result.imports); // [{ type: 'import', path: 'Stdio', line: 1 }, ...]
     * ```
     */
    async extractImports(code: string, filename?: string): Promise<import('./types.js').ExtractImportsResult> {
        const params: Record<string, unknown> = { code };
        if (filename) params['filename'] = filename;
        return this.sendRequest<import('./types.js').ExtractImportsResult>('extract_imports', params);
    }

    /**
     * Resolve an import/include/inherit/require directive to its file path.
     *
     * Given an import directive type and target, attempts to resolve it to a
     * file path. Resolution logic varies by import type:
     * - INCLUDE: Resolves "local.h" relative to current file, <system.h> via include paths
     * - IMPORT: Uses Pike's master()->resolv() to find the module
     * - INHERIT: Multi-strategy resolution (introspection, qualified names, workspace search, stdlib)
     * - REQUIRE: Tries as module via master()->resolv(), then as file path
     *
     * @param importType - Type of import (include, import, inherit, require).
     * @param target - Module/path name to resolve.
     * @param currentFile - Optional current file path for relative resolution.
     * @returns Resolved path with existence status and error info.
     * @example
     * ```ts
     * const result = await bridge.resolveImport('import', 'Stdio');
     * console.log(result.path); // '/usr/local/pike/lib/modules/Stdio.so'
     * ```
     */
    async resolveImport(
        importType: import('./types.js').ImportType,
        target: string,
        currentFile?: string
    ): Promise<import('./types.js').ResolveImportResult> {
        const params: Record<string, unknown> = { import_type: importType, target };
        if (currentFile) params['current_file'] = currentFile;
        return this.sendRequest<import('./types.js').ResolveImportResult>('resolve_import', params, (raw, method) => {
            const r = raw as Record<string, unknown>;
            assertString(r['path'], 'path', method);
            assertNumber(r['exists'], 'exists', method);
            return r as unknown as import('./types.js').ResolveImportResult;
        });
    }

    /**
     * Check for circular dependencies in a dependency graph.
     *
     * Performs cycle detection on a dependency graph structure using
     * depth-first search. Uses three-color DFS (white=unvisited, gray=visiting,
     * black=visited) to detect cycles efficiently.
     *
     * @param code - Pike source code to analyze.
     * @param filename - Optional filename for the code.
     * @returns Circular dependency check result with cycle path if found.
     * @example
     * ```ts
     * const result = await bridge.checkCircular('import A;\nimport B;', 'test.pike');
     * console.log(result.hasCircular); // false
     * ```
     */
    async checkCircular(code: string, filename?: string): Promise<import('./types.js').CircularCheckResult> {
        const params: Record<string, unknown> = { code };
        if (filename) params['filename'] = filename;
        return this.sendRequest<import('./types.js').CircularCheckResult>('check_circular', params);
    }

    /**
     * Get symbols with waterfall loading (transitive dependency resolution).
     *
     * Performs transitive symbol loading by recursively resolving all
     * dependencies of the specified file. Implements waterfall pattern where
     * symbols from dependencies are loaded with depth tracking for proper
     * prioritization (current file > direct imports > transitive).
     *
     * @param code - Pike source code to analyze.
     * @param filename - Optional filename for resolution context.
     * @param maxDepth - Maximum depth for transitive resolution (default: 5).
     * @returns All symbols with provenance tracking and merge precedence applied.
     * @example
     * ```ts
     * const result = await bridge.getWaterfallSymbols('import Stdio;', 'test.pike', 3);
     * console.log(result.symbols); // All symbols from file + imports
     * console.log(result.provenance); // Where each symbol came from
     * ```
     */
    async getWaterfallSymbols(
        code: string,
        filename?: string,
        maxDepth?: number
    ): Promise<import('./types.js').WaterfallSymbolsResult> {
        const params: Record<string, unknown> = { code };
        if (filename) params['filename'] = filename;
        if (maxDepth !== undefined) params['max_depth'] = maxDepth;
        return this.sendRequest<import('./types.js').WaterfallSymbolsResult>('get_waterfall_symbols', params);
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
     * PERF-003: Clear tokenization cache for a document.
     * Call when document is modified or closed.
     *
     * @param documentUri - URI of the document to invalidate
     */
    invalidateTokenCache(documentUri: string): void {
        this.tokenCache.delete(documentUri);
        this.debugLog(`Token cache invalidated for ${documentUri}`);
    }

    /**
     * PERF-003: Clear all tokenization caches.
     * Call when clearing all document data.
     */
    clearTokenCache(): void {
        const size = this.tokenCache.size;
        this.tokenCache.clear();
        this.debugLog(`Cleared ${size} token cache entries`);
    }

    /**
     * PERF-003: Evict oldest cache entries if cache is too large.
     */
    private evictOldTokenCacheEntries(): void {
        if (this.tokenCache.size <= this.MAX_TOKEN_CACHE_SIZE) {
            return;
        }

        // Sort by timestamp and remove oldest entries
        const entries = Array.from(this.tokenCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

        const toRemove = entries.slice(0, this.tokenCache.size - this.MAX_TOKEN_CACHE_SIZE);
        for (const [uri] of toRemove) {
            this.tokenCache.delete(uri);
        }

        this.debugLog(`Evicted ${toRemove.length} old token cache entries`);
    }

    /**
     * Get completion context at a specific position using Pike's tokenizer.
     * This replaces regex-based heuristics with Pike's accurate tokenization.
     *
     * PERF-003: When documentUri and version are provided, caches tokenization
     * results to avoid re-tokenizing the entire file on every completion.
     *
     * @param code - Source code to analyze
     * @param line - Line number (1-based)
     * @param character - Character position (0-based)
     * @param documentUri - Optional document URI for caching
     * @param documentVersion - Optional LSP document version for cache invalidation
     * @returns Completion context with type, object name, and prefix
     * @example
     * ```ts
     * const ctx = await bridge.getCompletionContext('Stdio.File f; f->w', 1, 18);
     * console.log(ctx); // { context: 'member_access', objectName: 'f', prefix: 'w', operator: '->' }
     * ```
     */
    async getCompletionContext(
        code: string,
        line: number,
        character: number,
        documentUri?: string,
        documentVersion?: number
    ): Promise<import('./types.js').CompletionContext> {
        // Try to use cached tokenization if document version matches
        if (documentUri && documentVersion !== undefined) {
            const cached = this.tokenCache.get(documentUri);
            if (cached && cached.version === documentVersion) {
                this.debugLog(`Using cached tokens for ${documentUri} (version ${documentVersion})`);

                // Use cached tokens path
                try {
                    const result = await this.sendRequest<import('./types.js').CompletionContext>('get_completion_context_cached', {
                        code,
                        line,
                        character,
                        splitTokens: cached.splitTokens,
                    });
                    return result;
                } catch (err) {
                    // If cached path fails, fall through to full tokenization
                    this.debugLog(`Cached completion context failed, falling back to full tokenization: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }

        // Full tokenization needed
        const result = await this.sendRequest<{
            splitTokens?: string[];
        } & import('./types.js').CompletionContext>('get_completion_context', {
            code,
            line,
            character,
        });

        // Cache the splitTokens for future use
        if (documentUri && documentVersion !== undefined && result.splitTokens) {
            this.evictOldTokenCacheEntries();

            this.tokenCache.set(documentUri, {
                version: documentVersion,
                splitTokens: result.splitTokens,
                timestamp: Date.now(),
            });
            this.debugLog(`Cached tokens for ${documentUri} (version ${documentVersion})`);
        }

        // Result IS the CompletionContext (sendRequest unwraps the JSON-RPC response)
        return result as import('./types.js').CompletionContext;
    }

    // PERF-007: Metrics for batch parse operations
    private batchParseMetrics: BatchParseMetrics[] = [];

    /**
     * Get batch parse metrics from recent operations
     */
    getBatchParseMetrics(): BatchParseMetrics[] {
        return [...this.batchParseMetrics];
    }

    /**
     * Clear batch parse metrics
     */
    clearBatchParseMetrics(): void {
        this.batchParseMetrics = [];
    }

    async batchParse(files: Array<{ code: string; filename: string }>): Promise<import('./types.js').BatchParseResult> {
        const totalStart = performance.now();
        const metrics: BatchParseMetrics = {
            totalMs: 0,
            chunkingMs: 0,
            ipcMs: 0,
            chunkCount: 0,
            fileCount: files.length,
        };

        // Limit batch size to prevent memory issues
        if (files.length > BATCH_PARSE_MAX_SIZE) {
            const chunkingStart = performance.now();
            // Split into chunks and process sequentially
            const chunks: Array<typeof files> = [];
            for (let i = 0; i < files.length; i += BATCH_PARSE_MAX_SIZE) {
                chunks.push(files.slice(i, i + BATCH_PARSE_MAX_SIZE));
            }
            const chunkingEnd = performance.now();
            metrics.chunkingMs = chunkingEnd - chunkingStart;
            metrics.chunkCount = chunks.length;

            // PERF-007: Time IPC for each chunk
            const allResults: import('./types.js').BatchParseFileResult[] = [];
            for (const chunk of chunks) {
                const ipcStart = performance.now();
                const result = await this.sendRequest<import('./types.js').BatchParseResult>('batch_parse', {
                    files: chunk,
                });
                const ipcEnd = performance.now();
                metrics.ipcMs += ipcEnd - ipcStart;
                allResults.push(...result.results);
            }

            metrics.totalMs = performance.now() - totalStart;
            this.batchParseMetrics.push(metrics);

            // PERF-007: Log performance data
            this.logger.info('bridge-batch-parse-perf', {
                ...metrics,
                avgIpcMs: (metrics.ipcMs / metrics.chunkCount).toFixed(2),
            });

            return {
                results: allResults,
                count: allResults.length,
            };
        }

        // PERF-007: Time single-batch IPC
        const ipcStart = performance.now();
        const result = await this.sendRequest<import('./types.js').BatchParseResult>('batch_parse', { files });
        const ipcEnd = performance.now();

        metrics.totalMs = performance.now() - totalStart;
        metrics.ipcMs = ipcEnd - ipcStart;
        metrics.chunkCount = 1;
        this.batchParseMetrics.push(metrics);

        // PERF-007: Log performance data
        this.logger.info('bridge-batch-parse-perf', {
            ...metrics,
            avgIpcMs: metrics.ipcMs.toFixed(2),
        });

        return result;
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
     * Get the Pike version via RPC.
     *
     * Queries the running Pike subprocess for its version information.
     * Returns structured version data including major, minor, build, and display values.
     *
     * @returns Version information object or `null` if the bridge is not running or method is not available.
     * @example
     * ```ts
     * const version = await bridge.getVersionInfo();
     * console.log(version); // { major: 8, minor: 0, build: 1116, version: "8.0.1116", display: 8.01116 }
     * ```
     */
    async getVersionInfo(): Promise<PikeVersionInfo | null> {
        this.debugLog('Getting Pike version via RPC...');
        try {
            const result = await this.sendRequest<PikeVersionInfo>('get_version', {});
            return result;
        } catch (err) {
            // Method not found or bridge not running
            const message = err instanceof Error ? err.message : String(err);
            this.debugLog(`getVersionInfo failed: ${message}`);
            return null;
        }
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
     * Validate Roxen module API compliance.
     *
     * Performs Roxen-specific validation including:
     * - Required callbacks per module type
     * - Defvar TYPE_* constant validation
     * - Tag function signature validation
     *
     * @param code - Pike source code to validate
     * @param filename - Optional filename for error messages
     * @param moduleInfo - Optional Roxen module info from parsing
     * @returns Roxen validation result with diagnostics
     * @example
     * ```ts
     * const result = await bridge.roxenValidate(code, 'test.pike', {
     *     module_type: ['MODULE_LOCATION'],
     *     variables: [{ name: 'mountpoint', type: 'TYPE_STRING' }],
     *     tags: []
     * });
     * console.log(result.diagnostics); // Array of validation diagnostics
     * ```
     */
    async roxenValidate(
        code: string,
        filename: string,
        moduleInfo?: Record<string, unknown>
    ): Promise<import('./types.js').RoxenValidationResult> {
        const params: Record<string, unknown> = { code, filename };
        if (moduleInfo) {
            params['module_info'] = moduleInfo;
        }
        return this.sendRequest<import('./types.js').RoxenValidationResult>('roxen_validate', params);
    }

    /**
     * Detect Roxen module information in Pike code.
     *
     * Analyzes Pike source code to identify Roxen module patterns,
     * including module type, variables, and RXML tags.
     *
     * @param code - Source code to analyze
     * @param filename - Filename for the document (optional)
     * @returns Roxen module information
     *
     * @example
     * ```typescript
     * const bridge = new PikeBridge();
     * await bridge.start();
     * const result = await bridge.roxenDetect('inherit "module"; constant module_type = MODULE_TAG;');
     * console.log(result.is_roxen_module); // 1
     * console.log(result.module_type); // ['module']
     * ```
     */
    async roxenDetect(
        code: string,
        filename?: string
    ): Promise<import('./types.js').RoxenModuleInfo> {
        const params: Record<string, unknown> = { code };
        if (filename) {
            params['filename'] = filename;
        }
        return this.sendRequest<import('./types.js').RoxenModuleInfo>('roxen_detect', params);
    }

    /**
     * Parse RXML tag definitions from Roxen module code.
     *
     * Extracts simpletag and container function definitions from the code.
     *
     * @param code - Pike source code to parse for tag definitions.
     * @param filename - Optional filename for error reporting.
     * @returns Object containing array of parsed tag definitions.
     * @example
     * ```ts
     * const result = await bridge.roxenParseTags('string simpletag_hello(mapping args) { return "hi"; }');
     * console.log(result.tags); // [{ name: 'hello', type: 'simple', ... }]
     * ```
     */
    async roxenParseTags(
        code: string,
        filename?: string
    ): Promise<{ tags: import('./types.js').RXMLTag[] }> {
        const params: Record<string, unknown> = { code };
        if (filename) {
            params['filename'] = filename;
        }
        return this.sendRequest<{ tags: import('./types.js').RXMLTag[] }>('roxen_parse_tags', params);
    }

    /**
     * Parse defvar calls from Roxen module code.
     *
     * Extracts module variable definitions from defvar() calls.
     *
     * @param code - Pike source code to parse for variable definitions.
     * @param filename - Optional filename for error reporting.
     * @returns Object containing array of parsed variable definitions.
     * @example
     * ```ts
     * const result = await bridge.roxenParseVars('defvar("title", "Default", TYPE_STRING, "Title");');
     * console.log(result.variables); // [{ name: 'title', name_string: 'Default', type: 'TYPE_STRING', ... }]
     * ```
     */
    async roxenParseVars(
        code: string,
        filename?: string
    ): Promise<{ variables: import('./types.js').ModuleVariable[] }> {
        const params: Record<string, unknown> = { code };
        if (filename) {
            params['filename'] = filename;
        }
        return this.sendRequest<{ variables: import('./types.js').ModuleVariable[] }>('roxen_parse_vars', params);
    }

    /**
     * Get lifecycle callback information from Roxen module code.
     *
     * Detects presence of create(), start(), stop(), and status() callbacks.
     *
     * @param code - Pike source code to analyze for lifecycle callbacks.
     * @param filename - Optional filename for error reporting.
     * @returns Object containing lifecycle information with detected callbacks.
     * @example
     * ```ts
     * const result = await bridge.roxenGetCallbacks('void create() {} int start() { return 1; }');
     * console.log(result.lifecycle.has_create); // 1
     * console.log(result.lifecycle.has_start); // 1
     * ```
     */
    async roxenGetCallbacks(
        code: string,
        filename?: string
    ): Promise<{ lifecycle: import('./types.js').LifecycleInfo }> {
        const params: Record<string, unknown> = { code };
        if (filename) {
            params['filename'] = filename;
        }
        return this.sendRequest<{ lifecycle: import('./types.js').LifecycleInfo }>('roxen_get_callbacks', params);
    }

    /**
     * Extract RXML strings from Pike multiline string literals.
     *
     * Detects and extracts RXML content embedded in Pike code using
     * #"..." and #'...' multiline string syntax.
     *
     * @param code - Pike source code to analyze.
     * @param filename - Optional filename for error reporting.
     * @returns Object containing array of detected RXML strings.
     * @example
     * ```ts
     * const result = await bridge.roxenExtractRXMLStrings('string foo = #"<set>bar</set>";');
     * console.log(result.strings); // [{ content: '<set>bar</set>', confidence: 0.8, ... }]
     * ```
     */
    async roxenExtractRXMLStrings(
        code: string,
        filename?: string
    ): Promise<{ strings: import('./types.js').RXMLStringResult[] }> {
        const params: Record<string, unknown> = { code };
        if (filename) {
            params['filename'] = filename;
        }
        return this.sendRequest<{ strings: import('./types.js').RXMLStringResult[] }>('roxenExtractRXMLStrings', params);
    }

    /**
     * Get RXML tag catalog from running Roxen server.
     *
     * Queries a running Roxen server for available RXML tags.
     * Returns tag metadata including name, type, and attributes.
     *
     * @param serverPid - Optional Roxen server process ID. If not provided, attempts to detect running server.
     * @returns Array of RXML tag definitions.
     * @throws Error if server not running or communication fails.
     * @example
     * ```ts
     * // Get tags from specific server
     * const tags = await bridge.roxenGetTagCatalog(12345);
     * console.log(tags); // [{ name: 'echo', type: 'simple', ... }]
     *
     * // Auto-detect server
     * const tags = await bridge.roxenGetTagCatalog();
     * ```
     */
    async roxenGetTagCatalog(serverPid?: number): Promise<import('./types.js').RXMLTagCatalogEntry[]> {
        const params: Record<string, unknown> = {};
        if (serverPid !== undefined) {
            params['server_pid'] = serverPid;
        }
        const result = await this.sendRequest<{ tags: import('./types.js').RXMLTagCatalogEntry[] }>('roxen_get_tag_catalog', params);
        return result.tags;
    }

    /**
     * Get diagnostic information for debugging.
     *
     * Returns the current configuration and state of the bridge.
     *
     * @returns Diagnostic information including options, running state, and PID.
     */
    getDiagnostics(): { options: InternalBridgeOptions; isRunning: boolean; pid: number | null } {
        return {
            options: { ...this.options },
            isRunning: this.isRunning(),
            pid: this.process?.pid ?? null,
        };
    }

    /**
     * Get startup phase timing metrics from the Pike subprocess.
     *
     * Returns detailed timing information about the analyzer startup process,
     * useful for performance debugging and optimization.
     *
     * @returns Startup metrics with phase timings in milliseconds.
     * @example
     * ```ts
     * const metrics = await bridge.getStartupMetrics();
     * console.log(`Startup took ${metrics.total}ms`);
     * console.log(`Context created: ${metrics.context_created}`);
     * ```
     */
    async getStartupMetrics(): Promise<import('./types.js').StartupMetrics> {
        const result = await this.sendRequest<{ startup: import('./types.js').StartupMetrics }>('get_startup_metrics', {});
        return result.startup;
    }

    /**
     * Get compilation cache statistics from the Pike subprocess.
     *
     * Returns cache hit/miss ratios and size information, useful for
     * debugging cache effectiveness and memory usage.
     *
     * @returns Cache statistics including hits, misses, evictions, and size.
     * @example
     * ```ts
     * const stats = await bridge.getCacheStats();
     * console.log(`Cache hit rate: ${stats.hits / (stats.hits + stats.misses)}`);
     * ```
     */
    async getCacheStats(): Promise<import('./types.js').CacheStats> {
        return this.sendRequest<import('./types.js').CacheStats>('get_cache_stats', {});
    }

    /**
     * Invalidate compilation cache entries for testing or debugging.
     *
     * Forces cache invalidation for a specific file path. Useful for testing
     * cache behavior or forcing recompilation of a specific file.
     *
     * @param path - File path to invalidate cache for.
     * @param transitive - Whether to invalidate transitive dependencies (default: false).
     * @returns Confirmation status with the invalidated path.
     * @example
     * ```ts
     * // Invalidate single file
     * await bridge.invalidateCache('/path/to/file.pike', false);
     *
     * // Invalidate file and all its dependencies
     * await bridge.invalidateCache('/path/to/file.pike', true);
     * ```
     */
    async invalidateCache(path: string, transitive = false): Promise<import('./types.js').InvalidateCacheResult> {
        return this.sendRequest<import('./types.js').InvalidateCacheResult>('invalidate_cache', {
            path,
            transitive: transitive ? 1 : 0,
        });
    }
}
