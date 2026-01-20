/**
 * Shared types for Pike LSP server.
 *
 * Centralized type definitions used across the server implementation.
 * Extracted from server.ts to enable modular feature handlers.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Diagnostic, Position } from 'vscode-languageserver/node';

/**
 * LSP server configuration settings.
 *
 * These settings control the behavior of the Pike LSP server,
 * including the Pike executable path and validation behavior.
 */
export interface PikeSettings {
    /** Path to the Pike executable (e.g., 'pike', '/usr/bin/pike') */
    pikePath: string;
    /** Maximum number of problems to report per document */
    maxNumberOfProblems: number;
    /** Delay in milliseconds before validating after document change */
    diagnosticDelay: number;
}

/**
 * Cached document information.
 *
 * Stores parsed symbols, diagnostics, and position index for a document.
 * The symbol positions map enables O(1) lookups for finding all positions
 * where a symbol is referenced within a document.
 */
export interface DocumentCacheEntry {
    /** Document version */
    version: number;
    /** Symbols extracted from the document */
    symbols: PikeSymbol[];
    /** Diagnostics from parsing/validation */
    diagnostics: Diagnostic[];
    /** Symbol position index for O(1) lookups: symbol_name -> positions[] */
    symbolPositions: Map<string, Position[]>;
}
