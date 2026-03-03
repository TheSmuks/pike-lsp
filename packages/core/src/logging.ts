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
export enum LogLevel {
  OFF = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSensitivePathPrefixes(): string[] {
  const prefixes = new Set<string>();
  const home = process.env['HOME'];
  const userProfile = process.env['USERPROFILE'];

  if (home) {
    prefixes.add(home.replace(/\\/g, '/'));
  }
  if (userProfile) {
    prefixes.add(userProfile.replace(/\\/g, '/'));
  }

  return [...prefixes].sort((a, b) => b.length - a.length);
}

const sensitivePathPrefixes = getSensitivePathPrefixes();

export function anonymizeSensitivePaths(value: string): string {
  if (!value || sensitivePathPrefixes.length === 0) {
    return value;
  }

  let output = value;
  for (const prefix of sensitivePathPrefixes) {
    if (!prefix) {
      continue;
    }
    const normalizedPrefix = prefix.replace(/\\/g, '/');
    const exact = new RegExp(escapeRegex(normalizedPrefix), 'g');
    output = output.replace(exact, '$HOME');

    const windowsPrefix = prefix.replace(/\//g, '\\\\');
    const windowsExact = new RegExp(escapeRegex(windowsPrefix), 'g');
    output = output.replace(windowsExact, '$HOME');
  }

  return output;
}

function sanitizeContextValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return anonymizeSensitivePaths(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeContextValue(item));
  }

  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input)) {
      sanitized[key] = sanitizeContextValue(entry);
    }
    return sanitized;
  }

  return value;
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
    const sanitizedMessage = anonymizeSensitivePaths(message);
    const sanitizedContext = context ? sanitizeContextValue(context) : undefined;
    const contextStr = sanitizedContext ? ` ${JSON.stringify(sanitizedContext)}` : '';
    const output = `[${timestamp}][${levelName}][${this.component}] ${sanitizedMessage}${contextStr}`;

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
