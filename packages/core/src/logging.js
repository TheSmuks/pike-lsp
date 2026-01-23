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
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["OFF"] = 0] = "OFF";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["INFO"] = 3] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 4] = "DEBUG";
    LogLevel[LogLevel["TRACE"] = 5] = "TRACE";
})(LogLevel || (LogLevel = {}));
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
export class Logger {
    /**
     * Global log level - only logs at or below this level are output.
     * Default: WARN (production-safe)
     */
    static globalLevel = LogLevel.WARN;
    /**
     * Set the global log level.
     * @param level - The minimum level to output
     */
    static setLevel(level) {
        Logger.globalLevel = level;
    }
    component;
    /**
     * Create a new Logger for a component.
     * @param component - Component name for namespacing (e.g., 'PikeBridge', 'WorkspaceIndex')
     */
    constructor(component) {
        this.component = component;
    }
    /**
     * Internal log method - checks level and formats output.
     */
    log(level, levelName, message, context) {
        if (level > Logger.globalLevel) {
            return; // Filtered out by global level
        }
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        const output = `[${timestamp}][${levelName}][${this.component}] ${message}${contextStr}`;
        // All logs go to stderr (console.error) where LSP servers emit diagnostics
        console.error(output);
    }
    /** Log an ERROR message - something went wrong */
    error(msg, ctx) {
        this.log(LogLevel.ERROR, 'ERROR', msg, ctx);
    }
    /** Log a WARN message - something unexpected but not fatal */
    warn(msg, ctx) {
        this.log(LogLevel.WARN, 'WARN', msg, ctx);
    }
    /** Log an INFO message - normal but significant event */
    info(msg, ctx) {
        this.log(LogLevel.INFO, 'INFO', msg, ctx);
    }
    /** Log a DEBUG message - diagnostic information for troubleshooting */
    debug(msg, ctx) {
        this.log(LogLevel.DEBUG, 'DEBUG', msg, ctx);
    }
    /** Log a TRACE message - very detailed flow tracing */
    trace(msg, ctx) {
        this.log(LogLevel.TRACE, 'TRACE', msg, ctx);
    }
}
//# sourceMappingURL=logging.js.map