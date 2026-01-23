//! LSP.CompilationCache - File-based compilation cache module
//!
//! Provides in-memory caching of compiled Pike programs to avoid recompiling
//! unchanged code between requests. Cache entries are keyed by file path and
//! content version (mtime:size for closed files, LSP version for open docs).
//!
//! Cache structure:
//! - Nested mapping: path -> version -> CompilationResult
//! - O(1) invalidation via m_delete on outer key
//! - Nuclear eviction at MAX_CACHED_FILES limit
//!
//! Features:
//! - Dual-path cache key generation (LSP version or filesystem stat)
//! - Statistics tracking (hits, misses, evictions)
//! - Graceful degradation (cache failures don't crash)
//!
//! Example usage:
//! @code
//! // Get from cache
//! string version_key = LSP.CompilationCache.make_cache_key("/path/to/file.pike");
//! LSP.CompilationCache.CompilationResult result = LSP.CompilationCache.get("/path/to/file.pike", version_key);
//!
//! // Store in cache
//! LSP.CompilationCache.put("/path/to/file.pike", version_key, result);
//!
//! // Invalidate on change
//! LSP.CompilationCache.invalidate("/path/to/file.pike");
//!
//! // Get statistics
//! mapping stats = LSP.CompilationCache.get_stats();
//! @endcode

// =========================================================================
// Configuration Constants
// =========================================================================

//! Maximum number of files to cache before nuclear eviction
//! When exceeded, entire cache is cleared (keeping dependency graph)
constant MAX_CACHED_FILES = 500;

// =========================================================================
// Internal Storage
// =========================================================================

//! Nested cache structure:
//! - Outer key: file path (string)
//! - Inner key: version string (mtime\0size for closed files, LSP:N for open docs)
//! - Value: CompilationResult object
private mapping(string:mapping(string:CompilationResult)) compilation_cache = ([]);

//! Statistics tracking
private mapping(string:int) stats = ([
    "hits": 0,
    "misses": 0,
    "evictions": 0
]);

// =========================================================================
// CompilationResult Class
// =========================================================================

//! Represents a cached compilation result
//!
//! Contains the compiled program along with metadata about
//! diagnostics and dependencies (for future use).
class CompilationResult {
    //! The compiled Pike program
    program compiled_program;

    //! Diagnostics from compilation (errors, warnings)
    array(mapping) diagnostics;

    //! Files this compilation depends on (will be populated in 13-02)
    array(string) dependencies;

    //! Create a new CompilationResult
    //!
    //! @param prog The compiled program
    //! @param diags Compilation diagnostics
    //! @param deps List of dependency file paths
    void create(program prog, array(mapping) diags, array(string) deps) {
        compiled_program = prog;
        diagnostics = diags;
        dependencies = deps;
    }
}

// =========================================================================
// Statistics Access
// =========================================================================

//! Get cache statistics
//!
//! @returns
//!   A mapping containing:
//!   - hits: Number of cache hits
//!   - misses: Number of cache misses
//!   - evictions: Number of nuclear evictions
//!   - size: Current number of cached files
//!   - max_files: Maximum number of files allowed in cache
mapping get_stats() {
    return ([
        "hits": stats->hits,
        "misses": stats->misses,
        "evictions": stats->evictions,
        "size": sizeof(compilation_cache),
        "max_files": MAX_CACHED_FILES
    ]);
}

//! Reset statistics counters
//! Useful for testing or measuring performance over specific intervals
void reset_stats() {
    stats = ([
        "hits": 0,
        "misses": 0,
        "evictions": 0
    ]);
}
