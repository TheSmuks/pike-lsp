/**
 * Bridge Manager - PikeBridge wrapper with health monitoring
 *
 * Wraps PikeBridge with lifecycle management and health monitoring.
 * Provides a single interface for feature handlers to interact
 * with the Pike subprocess.
 */

import type { PikeBridge } from '@pike-lsp/pike-bridge';
import type { Logger } from '@pike-lsp/core';

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
    /** Pike version (detected via introspection) */
    pikeVersion: string | null;
    /** Recent error messages from stderr */
    recentErrors: string[];
}

/**
 * Bridge manager wraps PikeBridge with health monitoring.
 *
 * Tracks server uptime, recent errors, and provides pass-through
 * methods for all PikeBridge functionality.
 */
export class BridgeManager {
    private startTime: number;
    private errorLog: string[] = [];
    private readonly MAX_ERRORS = 5;

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
     * Get health status of the bridge and server.
     * @returns Health status information
     */
    async getHealth(): Promise<HealthStatus> {
        return {
            serverUptime: Date.now() - this.startTime,
            bridgeConnected: this.bridge?.isRunning() ?? false,
            pikePid: (this.bridge as any)?.process?.pid ?? null,
            // TODO: Implement via introspection - call Pike and query version
            pikeVersion: null,
            recentErrors: [...this.errorLog],
        };
    }

    /**
     * Start the bridge subprocess.
     */
    async start(): Promise<void> {
        if (this.bridge) await this.bridge.start();
    }

    /**
     * Stop the bridge subprocess.
     */
    async stop(): Promise<void> {
        if (this.bridge) await this.bridge.stop();
    }

    /**
     * Check if the bridge is running.
     * @returns true if bridge is running
     */
    isRunning(): boolean {
        return this.bridge?.isRunning() ?? false;
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
