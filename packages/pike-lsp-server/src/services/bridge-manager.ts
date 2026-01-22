/**
 * Bridge Manager - PikeBridge wrapper with health monitoring
 *
 * Wraps PikeBridge with lifecycle management and health monitoring.
 * Provides a single interface for feature handlers to interact
 * with the Pike subprocess.
 */

import type { PikeBridge, PikeVersionInfo } from '@pike-lsp/pike-bridge';
import type { Logger } from '@pike-lsp/core';
import * as fs from 'fs';

/**
 * Pike version information with path details.
 */
export interface PikeVersionInfoWithPath extends PikeVersionInfo {
    /** Absolute path to the Pike executable */
    pikePath: string;
}

/**
 * Health status of the bridge and server.
 */
export interface HealthStatus {
    /** Server uptime in milliseconds */
    serverUptime: number;
    /** Whether the bridge is connected */
    bridgeConnected: boolean;
    /** Pike subprocess PID (if running) */
    pikePid: number | null;
    /** Pike version information with path (detected via RPC) */
    pikeVersion: PikeVersionInfoWithPath | null;
    /** Recent error messages from stderr */
    recentErrors: string[];
    /** PERF-011: Startup timing metrics in milliseconds */
    startupMetrics?: { [key: string]: number } | null;
}

/**
 * Bridge manager wraps PikeBridge with health monitoring.
 *
 * Tracks server uptime, recent errors, Pike version info, and provides pass-through
 * methods for all PikeBridge functionality.
 */
export class BridgeManager {
    private startTime: number;
    private errorLog: string[] = [];
    private readonly MAX_ERRORS = 5;
    private cachedVersion: PikeVersionInfoWithPath | null = null;
    /** PERF-011: Bridge startup timing tracking */
    private bridgeStartTime: number | null = null;
    /** PERF-011: Startup metrics for health reporting */
    private startupMetrics: { [key: string]: number } | null = null;

    constructor(
        public readonly bridge: PikeBridge | null,
        private logger: Logger
    ) {
        this.startTime = Date.now();
        this.setupErrorLogging();
    }

    /**
     * Set up error logging from bridge stderr.
     */
    private setupErrorLogging(): void {
        this.bridge?.on('stderr', (msg: string) => {
            if (msg.toLowerCase().includes('error')) {
                this.errorLog.push(msg);
                this.logger.debug('Bridge error logged', { message: msg });
                if (this.errorLog.length > this.MAX_ERRORS) {
                    this.errorLog.shift();
                }
            }
        });
    }

    /**
     * Start the bridge subprocess and cache version information.
     * PERF-011: Tracks startup timing for performance monitoring.
     * PERF-013: Fetches version info asynchronously to reduce perceived startup time.
     */
    async start(): Promise<void> {
        if (!this.bridge) return;

        // PERF-011: Record start time before bridge.start()
        this.bridgeStartTime = performance.now();
        await this.bridge.start();
        const bridgeReadyTime = performance.now();

        // PERF-013: Record bridge_ready timing before async version fetch
        this.startupMetrics = {
            bridgeStart: this.bridgeStartTime,
            bridgeReady: bridgeReadyTime,
            bridgeStartDuration: bridgeReadyTime - this.bridgeStartTime,
        };

        // PERF-013: Fetch version info asynchronously (fire and forget)
        // This allows start() to return immediately after subprocess spawn
        this.fetchVersionInfoAsync();
    }

    /**
     * PERF-013: Fetch version information asynchronously after bridge starts.
     * This method is called without await to allow start() to return immediately.
     * Version info is cached when the fetch completes.
     */
    private async fetchVersionInfoAsync(): Promise<void> {
        if (!this.bridge) return;

        try {
            const versionFetchStartTime = performance.now();
            const versionInfo = await this.bridge.getVersionInfo();
            const versionFetchTime = performance.now();

            // PERF-013: Update startup metrics with version fetch timing
            this.startupMetrics = {
                ...this.startupMetrics!,
                versionFetch: versionFetchTime,
                versionFetchDuration: versionFetchTime - versionFetchStartTime,
                total: versionFetchTime - this.bridgeStartTime!,
            };

            if (versionInfo) {
                // Get the absolute path to the Pike executable
                // The bridge stores options internally, we need to get the pikePath
                const diagnostics = this.bridge.getDiagnostics();
                const pikePath = diagnostics.options.pikePath;
                let resolvedPath: string;

                if (pikePath === 'pike') {
                    // Use 'pike' as the path since we can't resolve it without which/command
                    resolvedPath = 'pike';
                } else {
                    // Resolve absolute path for custom Pike paths
                    resolvedPath = fs.realpathSync(pikePath);
                }

                this.cachedVersion = {
                    ...versionInfo,
                    pikePath: resolvedPath,
                };
                this.logger.info('Pike version detected (async)', {
                    version: versionInfo.version,
                    path: resolvedPath,
                    startupDuration: (this.startupMetrics?.['total']?.toFixed(2) ?? 'N/A') + 'ms',
                });
            } else {
                this.logger.warn('Failed to get Pike version info via RPC (async)');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn('Failed to get Pike version info (async)', { error: message });
        }
    }

    /**
     * Stop the bridge subprocess.
     */
    async stop(): Promise<void> {
        if (this.bridge) await this.bridge.stop();
        // Clear cached version on stop
        this.cachedVersion = null;
        // PERF-011: Clear startup metrics on stop
        this.startupMetrics = null;
        this.bridgeStartTime = null;
    }

    /**
     * Check if the bridge is running.
     * @returns true if bridge is running
     */
    isRunning(): boolean {
        return this.bridge?.isRunning() ?? false;
    }

    /**
     * Get health status of the bridge and server.
     * PERF-011: Includes startup metrics if available.
     * @returns Health status information
     */
    async getHealth(): Promise<HealthStatus> {
        return {
            serverUptime: Date.now() - this.startTime,
            bridgeConnected: this.bridge?.isRunning() ?? false,
            pikePid: (this.bridge as any)?.process?.pid ?? null,
            pikeVersion: this.cachedVersion,
            recentErrors: [...this.errorLog],
            startupMetrics: this.startupMetrics,
        };
    }

    /**
     * Introspect Pike code through compilation.
     */
    async introspect(code: string, filename: string) {
        if (!this.bridge) throw new Error('Bridge not available');
        return this.bridge.introspect(code, filename);
    }

    /**
     * Parse Pike source code and extract symbols.
     */
    async parse(code: string, filename: string) {
        if (!this.bridge) throw new Error('Bridge not available');
        return this.bridge.parse(code, filename);
    }

    /**
     * Find all identifier occurrences using Pike tokenization.
     */
    async findOccurrences(text: string) {
        if (!this.bridge) throw new Error('Bridge not available');
        return this.bridge.findOccurrences(text);
    }

    /**
     * Get completion context at a specific position.
     */
    async getCompletionContext(code: string, line: number, character: number) {
        if (!this.bridge) throw new Error('Bridge not available');
        return this.bridge.getCompletionContext(code, line, character);
    }

    /**
     * Resolve a module path to a file location.
     */
    async resolveModule(modulePath: string, fromFile: string) {
        if (!this.bridge) throw new Error('Bridge not available');
        return this.bridge.resolveModule(modulePath, fromFile);
    }

    /**
     * Check if the Pike executable is available.
     */
    async checkPike(): Promise<boolean> {
        if (!this.bridge) return false;
        return this.bridge.checkPike();
    }

    /**
     * Analyze uninitialized variable usage.
     */
    async analyzeUninitialized(text: string, filename: string) {
        if (!this.bridge) throw new Error('Bridge not available');
        return this.bridge.analyzeUninitialized(text, filename);
    }

    /**
     * Register event handler on the underlying bridge.
     */
    on(event: string, handler: (...args: any[]) => void): void {
        this.bridge?.on(event, handler);
    }
}
