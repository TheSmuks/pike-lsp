/**
 * Shared types for Pike LSP server.
 *
 * Centralized type definitions used across the server implementation.
 * Extracted from server.ts to enable modular feature handlers.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Diagnostic, Position } from 'vscode-languageserver/node.js';
import { DEFAULT_MAX_PROBLEMS, DIAGNOSTIC_DELAY_DEFAULT } from '../constants/index.js';

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
 * Resolved include dependency with cached symbols.
 */
export interface ResolvedInclude {
    /** Original include path from source (e.g., '"utils.pike"' or '<Stdio.h>') */
    originalPath: string;
    /** Resolved absolute file path */
    resolvedPath: string;
    /** Symbols from the included file (cached for completion) */
    symbols: PikeSymbol[];
    /** Last modified time for cache invalidation */
    lastModified: number;
}

/**
 * Resolved import dependency with cached symbols.
 */
export interface ResolvedImport {
    /** Module path (e.g., 'Stdio' or 'Parser.Pike') */
    modulePath: string;
    /** Whether this is a stdlib module (vs local module) */
    isStdlib: boolean;
    /** Symbols from the imported module (cached for completion) */
    symbols?: import('@pike-lsp/pike-bridge').PikeSymbol[];
    /** Last accessed timestamp for cache invalidation */
    lastAccessed?: number;
    /** Resolved file path (for workspace modules) */
    resolvedPath?: string;
}

/**
 * Document dependencies tracking for include/import statements.
 */
export interface DocumentDependencies {
    /** Resolved #include dependencies */
    includes: ResolvedInclude[];
    /** Resolved import dependencies */
    imports: ResolvedImport[];
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
    /** Include and import dependencies (optional, populated lazily) */
    dependencies?: DocumentDependencies;
    /** Inheritance information from introspection */
    inherits?: import("@pike-lsp/pike-bridge").InheritanceInfo[];
    /** INC-002: SHA-256 hash of document content for incremental change detection */
    contentHash?: string;
    /** INC-002: Hash of each line's semantic content (comments stripped) */
    lineHashes?: number[];
}

/**
 * Default Pike settings.
 *
 * Provides sensible defaults for the LSP server configuration.
 */
export const defaultSettings: PikeSettings = {
    pikePath: 'pike',
    maxNumberOfProblems: DEFAULT_MAX_PROBLEMS,
    diagnosticDelay: DIAGNOSTIC_DELAY_DEFAULT,
};
