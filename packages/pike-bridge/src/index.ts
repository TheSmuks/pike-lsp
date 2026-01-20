/**
 * Pike Bridge - TypeScript <-> Pike subprocess communication layer
 *
 * This module manages Pike subprocess lifecycle and provides a JSON-based
 * protocol for communicating with Pike's native parsing utilities.
 */

export * from './types.js';
export * from './bridge.js';
export * from './constants.js';

// Re-export PikeError for consumers who need to catch Pike subprocess errors
export { PikeError } from '@pike-lsp/pike-lsp-server/core';

