/**
 * Simple Logger with component-based namespacing and global log level filtering.
 *
 * Designed for Lean Observability:
 * - No transports (just console.error)
 * - No formatters (simple structured format)
 * - No log rotation (LSP servers manage externally)
 * - Global level filtering only (no per-component filtering)
 */
/**
 * Log levels - numeric for comparison.
 * Lower levels are more severe.
 */
export declare enum LogLevel {
    OFF = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
    TRACE = 5
}
/**
 * Logger class with component-based namespacing.
 *
 * All output goes to console.error (stderr) where LSP servers typically
 * emit diagnostic output.
 *
 * @example
 * ```ts
 * const log = new Logger('PikeBridge');
 * log.setLevel(LogLevel.DEBUG);
 * log.debug('Connecting to Pike subprocess', { timeout: 5000 });
 * ```
 */
export declare class Logger {
    /**
     * Global log level - only logs at or below this level are output.
     * Default: WARN (production-safe)
     */
    static globalLevel: LogLevel;
    /**
     * Set the global log level.
     * @param level - The minimum level to output
     */
    static setLevel(level: LogLevel): void;
    private readonly component;
    /**
     * Create a new Logger for a component.
     * @param component - Component name for namespacing (e.g., 'PikeBridge', 'WorkspaceIndex')
     */
    constructor(component: string);
    /**
     * Internal log method - checks level and formats output.
     */
    private log;
    /** Log an ERROR message - something went wrong */
    error(msg: string, ctx?: object): void;
    /** Log a WARN message - something unexpected but not fatal */
    warn(msg: string, ctx?: object): void;
    /** Log an INFO message - normal but significant event */
    info(msg: string, ctx?: object): void;
    /** Log a DEBUG message - diagnostic information for troubleshooting */
    debug(msg: string, ctx?: object): void;
    /** Log a TRACE message - very detailed flow tracing */
    trace(msg: string, ctx?: object): void;
}
//# sourceMappingURL=logging.d.ts.map