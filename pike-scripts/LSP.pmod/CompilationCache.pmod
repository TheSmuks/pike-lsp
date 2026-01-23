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

//! Forward dependency edges: what each file imports/inherits
//! dependencies[path] = ({dep1, dep2, ...})
private mapping(string:array(string)) dependencies = ([]);

//! Reverse dependency edges: what imports/inherits each file
//! dependents[dep] = (<dependent1, dependent2, ...>)
private mapping(string:multiset(string)) dependents = ([]);

//! Project root for filtering local dependencies
//! Only track local dependencies - stdlib/external modules don't change during session
private string project_root = getcwd();

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

// =========================================================================
// Dependency Graph Helpers
// =========================================================================

//! Check if a file is within the project root
//! Only track local dependencies - stdlib/external modules don't change during session
//! @param path The file path to check
//! @returns 1 (true) if path is within project root, 0 (false) otherwise
protected int is_local_file(string path) {
    string normalized = combine_path(project_root, path);
    return has_prefix(normalized, project_root);
}

// =========================================================================
// Cache Operations
// =========================================================================

//! Get a cached compilation result
//!
//! @param path
//!   The file path for the compilation
//! @param version_key
//!   The version key (from make_cache_key or manually generated)
//! @returns
//!   The cached CompilationResult, or 0 (zero) if not found (cache miss)
CompilationResult get(string path, string version_key) {
    if (compilation_cache[path] && compilation_cache[path][version_key]) {
        stats->hits++;
        return compilation_cache[path][version_key];
    }
    stats->misses++;
    return 0;  // Cache miss
}

//! Put a compilation result in cache with nuclear eviction
//!
//! If the cache is at capacity and the path is not already present,
//! the entire cache is cleared (nuclear eviction).
//!
//! @param path
//!   The file path for the compilation
//! @param version_key
//!   The version key for this specific version of the file
//! @param result
//!   The CompilationResult to cache
void put(string path, string version_key, CompilationResult result) {
    // Check size limit - nuclear eviction if at capacity
    // Only evict if this is a new file (not already in cache)
    if (sizeof(compilation_cache) >= MAX_CACHED_FILES && !compilation_cache[path]) {
        compilation_cache = ([]);  // Nuclear eviction
        stats->evictions++;
    }

    if (!compilation_cache[path]) {
        compilation_cache[path] = ([]);
    }
    compilation_cache[path][version_key] = result;
}

//! Invalidate all cached versions of a file
//!
//! O(1) invalidation - removes all version entries for the given path.
//!
//! @param path
//!   The file path to invalidate
void invalidate(string path) {
    if (compilation_cache[path]) {
        m_delete(compilation_cache, path);
    }
}

//! Invalidate all cached files
//!
//! Clears the entire cache. Useful for testing or when the project
//! state has changed significantly.
void invalidate_all() {
    compilation_cache = ([]);
}

// =========================================================================
// Cache Key Generation
// =========================================================================

//! Generate cache key for a file
//!
//! Uses dual-path strategy:
//! - If lsp_version provided (open document): Uses "LSP:N" format
//! - If no lsp_version (closed file): Stats filesystem for mtime:size
//!
//! The \0 separator avoids escaping issues with colons in paths (Windows).
//!
//! @param path
//!   The file path (not used directly for key, but kept for consistency)
//! @param lsp_version
//!   Optional LSP version number for open documents
//! @returns
//!   Cache key string, or 0 (zero) if file doesn't exist (closed files only)
string make_cache_key(string path, int|void lsp_version) {
    // If LSP version provided (open document), use it directly
    // Check using zero_type() to detect if argument was passed
    if (!zero_type(lsp_version)) {
        return sprintf("LSP:%d", lsp_version);
    }

    // Closed file: stat filesystem
    object st = file_stat(path);
    if (!st) {
        return 0;  // File deleted
    }

    // Use mtime\0size format per CONTEXT.md decision
    // \0 separator avoids issues with colons in Windows paths
    return sprintf("FS:%d\0%d", st->mtime, st->size);
}
