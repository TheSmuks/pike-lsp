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
import * as path from 'path';

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
     */
    async start(): Promise<void> {
        if (!this.bridge) return;

        await this.bridge.start();

        // Fetch and cache version information via RPC
        try {
            const versionInfo = await this.bridge.getVersionInfo();
            if (versionInfo) {
                // Get the absolute path to the Pike executable
                // The bridge stores options internally, we need to get the pikePath
                const diagnostics = this.bridge.getDiagnostics();
                const pikePath = diagnostics.options.pikePath;
                const resolvedPath = fs.realpathSync(pikePath === 'pike' ? pikePath : path.resolve(pikePath));

                this.cachedVersion = {
                    ...versionInfo,
                    pikePath: resolvedPath,
                };
                this.logger.info('Pike version detected', {
                    version: versionInfo.version,
                    path: resolvedPath,
                });
            } else {
                this.logger.warn('Failed to get Pike version info via RPC');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn('Failed to get Pike version info', { error: message });
        }
    }

    /**
     * Stop the bridge subprocess.
     */
    async stop(): Promise<void> {
        if (this.bridge) await this.bridge.stop();
        // Clear cached version on stop
        this.cachedVersion = null;
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
     * @returns Health status information
     */
    async getHealth(): Promise<HealthStatus> {
        return {
            serverUptime: Date.now() - this.startTime,
            bridgeConnected: this.bridge?.isRunning() ?? false,
            pikePid: (this.bridge as any)?.process?.pid ?? null,
            pikeVersion: this.cachedVersion,
            recentErrors: [...this.errorLog],
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
