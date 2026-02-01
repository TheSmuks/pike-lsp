/**
 * Common Regex Patterns for Pike LSP Server
 *
 * MAINT-003: Centralized regex patterns to avoid duplication
 * and ensure consistency across the codebase.
 */

/**
 * Comment detection patterns.
 *
 * Used to identify Pike comment lines in various contexts.
 */
export const COMMENT_PATTERNS = {
    /** Single-line comment prefix */
    SINGLE_LINE: '//',
    /** Multi-line comment start */
    MULTI_LINE_START: '/*',
    /** Multi-line comment end */
    MULTI_LINE_END: '*/',
    /** JSDoc/AutoDoc comment prefix */
    AUTODOC: '//!',
    /** All comment line starters (for startsWith checks) */
    LINE_STARTERS: ['//', '*', '/*'] as const,
} as const;

/**
 * Indentation patterns.
 */
export const INDENT_PATTERNS = {
    /** Matches leading whitespace on a line. Capture group 1 contains the indent. */
    LEADING_WHITESPACE: /^(\s*)/,

    /** Matches opening braces. */
    OPEN_BRACE: /{/g,

    /** Matches closing braces. */
    CLOSE_BRACE: /}/g,
} as const;

/**
 * Pike identifier patterns.
 */
export const IDENTIFIER_PATTERNS = {
    /**
     * Matches a Pike member access expression.
     * Capture group 1: object/module path (e.g., "obj", "module.sub")
     * Capture group 2: partial member name (may be empty)
     */
    MEMBER_ACCESS: /(\w+(?:\.\w+)*)\s*(?:->|\.)\s*(\w*)$/,

    /**
     * Matches a Pike scoped access expression.
     * Capture group 1: scope name (e.g., "Module", "Module.SubModule")
     * Capture group 2: partial member name (may be empty)
     */
    SCOPED_ACCESS: /([\w.]+)::(\w*)$/,

    /**
     * Matches a bare identifier at end of text.
     * Capture group 1: identifier name
     */
    BARE_IDENTIFIER: /(\w+)\s*$/,

    /**
     * Word boundary regex for exact identifier matching.
     * Use with `replace()` to escape special regex characters in the identifier name.
     *
     * @example
     * ```ts
     * const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'g');
     * ```
     */
    WORD_BOUNDARY: '\\b',
} as const;

/**
 * File path patterns.
 */
export const PATH_PATTERNS = {
    /**
     * Matches a Pike file path with optional line number suffix.
     * Capture group 1: file path
     * Capture group 2: line number
     *
     * @example
     * "/path/to/file.pike:123" -> ["/path/to/file.pike", "123"]
     */
    PIKE_PATH_WITH_LINE: /^(.+):(\d+)$/,
} as const;

/**
 * Helper functions for working with patterns.
 */
export const PatternHelpers = {
    /**
     * Create a regex that matches a function call pattern.
     *
     * @param functionName - The function name to match.
     * @returns A regex that matches `functionName(` as a whole word.
     */
    functionCallPattern(functionName: string): RegExp {
        return new RegExp(`\\b${functionName}\\s*\\(`, 'g');
    },

    /**
     * Create a regex that matches an identifier as a whole word.
     *
     * @param identifier - The identifier to match.
     * @returns A regex with word boundaries.
     */
    wholeWordPattern(identifier: string): RegExp {
        const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'g');
    },

    /**
     * Check if a line is a comment line.
     *
     * @param line - The line to check (trimmed).
     * @returns `true` if the line starts with a comment marker.
     */
    isCommentLine(line: string): boolean {
        return COMMENT_PATTERNS.LINE_STARTERS.some(prefix => line.startsWith(prefix));
    },

    /**
     * Check if a line is NOT a comment line.
     *
     * @param line - The line to check (trimmed).
     * @returns `true` if the line does NOT start with a comment marker.
     */
    isNotCommentLine(line: string): boolean {
        return !this.isCommentLine(line);
    },
} as const;
