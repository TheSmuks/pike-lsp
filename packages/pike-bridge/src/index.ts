/**
 * Pike Bridge - TypeScript <-> Pike subprocess communication layer
 *
 * This module manages Pike subprocess lifecycle and provides a JSON-based
 * protocol for communicating with Pike's native parsing utilities.
 */

export * from './types.js';
export * from './bridge.js';
export * from './constants.js';

// Export error types for consumers who need to catch Pike subprocess errors
export { PikeError, LSPError } from './errors.js';
export type { ErrorLayer } from './errors.js';

// Export Logger for consumers who need logging
export { Logger, LogLevel } from './logging.js';

