/**
 * Pike Bridge - TypeScript <-> Pike subprocess communication layer
 *
 * This module manages Pike subprocess lifecycle and provides a JSON-based
 * protocol for communicating with Pike's native parsing utilities.
 */

export * from './types.js';
export * from './bridge.js';
export * from './constants.js';
export * from './process.js';

// Export error types for consumers who need to catch Pike subprocess errors
export { PikeError, LSPError } from '@pike-lsp/core';
export type { ErrorLayer } from '@pike-lsp/core';

// Export Logger for consumers who need logging
export { Logger, LogLevel } from '@pike-lsp/core';

