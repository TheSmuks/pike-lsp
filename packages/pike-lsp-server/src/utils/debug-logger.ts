/**
 * Debug Logging Utility
 *
 * Provides debug logging functionality for the LSP server.
 */

import * as fsSync from 'fs';

export const DEFAULT_LOG_FILE = '/tmp/pike-lsp-debug.log';
const LOG_FILE_ENV_VAR = 'PIKE_LSP_LOG_FILE';

type AppendFileSync = (path: fsSync.PathOrFileDescriptor, data: string) => void;

interface CreateLoggerOptions {
  onWriteFailure?: (logFile: string, error: unknown) => void;
  appendFileSync?: AppendFileSync;
}

function runtimeEnv(): Record<string, string | undefined> {
  const runtimeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return runtimeProcess?.env ?? {};
}

export function resolveDebugLogFilePath(env: Record<string, string | undefined> = runtimeEnv()): string {
  const configuredPath = env[LOG_FILE_ENV_VAR]?.trim();
  return configuredPath && configuredPath.length > 0 ? configuredPath : DEFAULT_LOG_FILE;
}

/**
 * Create a debug logger function.
 *
 * @param logFile - Optional custom log file path
 * @param options - Logger behavior overrides
 * @returns Logger function
 */
export function createLogger(
  logFile: string = resolveDebugLogFilePath(),
  options: CreateLoggerOptions = {}
): (msg: string) => void {
  const append = options.appendFileSync ?? fsSync.appendFileSync;
  const onWriteFailure = options.onWriteFailure;

  return (msg: string) => {
    try {
      append(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (error) {
      onWriteFailure?.(logFile, error);
    }
  };
}
