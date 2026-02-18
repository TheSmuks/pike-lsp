/**
 * Debug Logging Utility
 *
 * Provides debug logging functionality for the LSP server.
 */

import * as fsSync from 'fs';

const DEFAULT_LOG_FILE = '/tmp/pike-lsp-debug.log';

/**
 * Create a debug logger function.
 *
 * @param logFile - Optional custom log file path
 * @returns Logger function
 */
export function createLogger(logFile: string = DEFAULT_LOG_FILE): (msg: string) => void {
    return (msg: string) => {
        try {
            fsSync.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
        } catch {
            // Silently ignore logging failures to prevent cascading errors
        }
    };
}
