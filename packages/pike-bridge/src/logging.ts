/**
 * Simple Logger with component-based namespacing and global log level filtering.
 *
 * Designed for Lean Observability:
 * - No transports (just console.error)
 * - No formatters (simple structured format)
 * - No log rotation (LSP servers manage externally)
 * - Global level filtering only (no per-component filtering)
 *
 * This is a local copy to avoid circular dependency with pike-lsp-server.
 * The server package imports from bridge, so bridge cannot import from server.
 *
 * TODO: Extract to a shared @pike-lsp/core package to eliminate duplication.
 */

/**
 * Log levels - numeric for comparison.
 * Lower levels are more severe.
 */
export enum LogLevel {
  OFF = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
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
export class Logger {
  /**
   * Global log level - only logs at or below this level are output.
   * Default: WARN (production-safe)
   */
  static globalLevel: LogLevel = LogLevel.WARN;

  /**
   * Set the global log level.
   * @param level - The minimum level to output
   */
  static setLevel(level: LogLevel): void {
    Logger.globalLevel = level;
  }

  private readonly component: string;

  /**
   * Create a new Logger for a component.
   * @param component - Component name for namespacing (e.g., 'PikeBridge', 'WorkspaceIndex')
   */
  constructor(component: string) {
    this.component = component;
  }

  /**
   * Internal log method - checks level and formats output.
   */
  private log(level: LogLevel, levelName: string, message: string, context?: object): void {
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
  error(msg: string, ctx?: object): void {
    this.log(LogLevel.ERROR, 'ERROR', msg, ctx);
  }

  /** Log a WARN message - something unexpected but not fatal */
  warn(msg: string, ctx?: object): void {
    this.log(LogLevel.WARN, 'WARN', msg, ctx);
  }

  /** Log an INFO message - normal but significant event */
  info(msg: string, ctx?: object): void {
    this.log(LogLevel.INFO, 'INFO', msg, ctx);
  }

  /** Log a DEBUG message - diagnostic information for troubleshooting */
  debug(msg: string, ctx?: object): void {
    this.log(LogLevel.DEBUG, 'DEBUG', msg, ctx);
  }

  /** Log a TRACE message - very detailed flow tracing */
  trace(msg: string, ctx?: object): void {
    this.log(LogLevel.TRACE, 'TRACE', msg, ctx);
  }
}
