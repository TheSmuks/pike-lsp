/**
 * Core module exports for pike-lsp-server.
 *
 * Re-exports shared utilities from @pike-lsp/core and server-specific types.
 * This provides a unified import interface for the LSP server implementation.
 */

// Re-export shared utilities from @pike-lsp/core
export { LSPError, BridgeError, PikeError } from '@pike-lsp/core';
export type { ErrorLayer } from '@pike-lsp/core';
export { Logger, LogLevel } from '@pike-lsp/core';

// Server-specific types remain local
export type { PikeSettings, DocumentCacheEntry } from './types.js';
export { defaultSettings } from './types.js';
