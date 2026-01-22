/**
 * Constants for Pike LSP Server
 * MAINT-004: Centralized configuration values
 */

/**
 * Maximum number of iterations for parser loops
 */
export const PARSER_MAX_ITERATIONS = 10000;

/**
 * Maximum batch size for batch parse requests
 */
export const BATCH_PARSE_MAX_SIZE = 50;

/**
 * Default delay (ms) for document validation debouncing
 */
export const VALIDATION_DELAY_DEFAULT = 250;

/**
 * Maximum number of cached programs
 */
export const MAX_CACHED_PROGRAMS = 30;

/**
 * Maximum number of stdlib modules to cache
 */
export const MAX_STDLIB_MODULES = 50;

/**
 * Default timeout for Pike bridge requests (ms)
 */
export const BRIDGE_TIMEOUT_DEFAULT = 30000;

/**
 * Maximum cache size for document symbols
 */
export const MAX_DOCUMENT_CACHE_SIZE = 100;

/**
 * Maximum file size to parse (bytes)
 */
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Type database memory limit (bytes)
 */
export const TYPE_DB_MAX_MEMORY_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Default max number of problems (diagnostics)
 */
export const DEFAULT_MAX_PROBLEMS = 100;

/**
 * Default diagnostic delay (ms) - debounce validation to avoid triggering on every keystroke
 */
export const DIAGNOSTIC_DELAY_DEFAULT = 500;

/**
 * LSP-related limits
 */
export const LSP = {
    /**
     * Maximum number of completions to return
     */
    MAX_COMPLETION_ITEMS: 100,

    /**
     * Maximum number of workspace symbols to return
     */
    MAX_WORKSPACE_SYMBOLS: 1000,

    /**
     * Maximum number of document symbols to return
     */
    MAX_DOCUMENT_SYMBOLS: 1000,

    /**
     * Maximum context lines for hover
     */
    HOVER_CONTEXT_LINES: 3,

    /**
     * Maximum number of references to find
     */
    MAX_REFERENCES: 100,
} as const;
