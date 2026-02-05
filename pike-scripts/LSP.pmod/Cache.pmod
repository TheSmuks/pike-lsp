//! LSP Cache Module
//!
//! Provides LRU caching infrastructure for program_cache and stdlib_cache.
//! This module encapsulates all caching state, providing a clean interface
//! for storing compiled programs and stdlib data.
//!
//! Features:
//! - Strict LRU eviction policy
//! - Manual invalidation only
//! - Statistics tracking (hits, misses, current size)
//! - Graceful degradation (cache failures don't crash the LSP)
//!
//! Example usage:
//! @code
//! // Store a compiled program
//! LSP.Cache.put("program_cache", "my_key", my_program);
//!
//! // Retrieve from cache
//! program prog = LSP.Cache.get("program_cache", "my_key");
//!
//! // Clear cache
//! LSP.Cache.clear("program_cache");
//!
//! // Get statistics
//! mapping stats = LSP.Cache.get_stats();
//! @endcode

// MAINT-004: Configuration constants
constant DEFAULT_MAX_PROGRAMS = 30;
constant DEFAULT_MAX_STDLIB = 50;
constant DEFAULT_MAX_IMPORTS = 100;

// Internal storage for program cache: stores compiled programs by source hash
private mapping(string:program) program_cache = ([]);

// Internal storage for stdlib cache: stores module symbol data
private mapping(string:mapping) stdlib_cache = ([]);

// Internal storage for import cache: stores import context data by file path
private mapping(string:mapping) import_cache = ([]);

// Import file modification time tracking for cache invalidation
private mapping(string:int) import_mtime = ([]);

// Access counter for LRU eviction - increments on each cache operation
// Using a counter instead of time() ensures deterministic LRU behavior
// even when multiple operations happen in the same second.
private int access_counter = 0;

// Access tracking for LRU eviction - stores counter value per key
private mapping(string:int) cache_access_counter = ([]);

// Maximum cache sizes (configurable via set_limits)
private int max_cached_programs = DEFAULT_MAX_PROGRAMS;
private int max_stdlib_modules = DEFAULT_MAX_STDLIB;
private int max_cached_imports = DEFAULT_MAX_IMPORTS;

// Statistics tracking
private mapping(string:int) stats = ([
    "program_hits": 0,
    "program_misses": 0,
    "stdlib_hits": 0,
    "stdlib_misses": 0,
    "import_hits": 0,
    "import_misses": 0
]);

//! Get a compiled program from cache.
//!
//! @param key
//!   The cache key for the program (typically a source hash).
//! @returns
//!   The cached program, or 0 (zero) if not found.
program get_program(string key) {
    if (program_cache[key]) {
        stats["program_hits"]++;
        access_counter++;
        cache_access_counter[key] = access_counter;
        return program_cache[key];
    }
    stats["program_misses"]++;
    return 0; // Not found
}

//! Put a compiled program in cache with LRU eviction.
//!
//! If the cache is at capacity and the key is not already present,
//! the least-recently-used program will be evicted.
//!
//! @param key
//!   The cache key for the program.
//! @param prog
//!   The compiled program to cache.
void put_program(string key, program prog) {
    // Check if we need to evict (only if key doesn't already exist)
    if (sizeof(program_cache) >= max_cached_programs && !program_cache[key]) {
        evict_lru_program();
    }
    program_cache[key] = prog;
    access_counter++;
    cache_access_counter[key] = access_counter;
}

//! Clear all programs from cache.
void clear_programs() {
    program_cache = ([]);
}

//! Get stdlib data from cache.
//!
//! @param key
//!   The cache key for the stdlib module.
//! @returns
//!   The cached stdlib data mapping, or 0 (zero) if not found.
mapping get_stdlib(string key) {
    if (stdlib_cache[key]) {
        stats["stdlib_hits"]++;
        access_counter++;
        cache_access_counter["stdlib:" + key] = access_counter;
        return stdlib_cache[key];
    }
    stats["stdlib_misses"]++;
    return 0; // Not found
}

//! Put stdlib data in cache with LRU eviction.
//!
//! If the cache is at capacity and the key is not already present,
//! the least-recently-used stdlib module will be evicted.
//!
//! @param key
//!   The cache key for the stdlib module.
//! @param data
//!   The stdlib symbol data mapping to cache.
void put_stdlib(string key, mapping data) {
    // Check if we need to evict (only if key doesn't already exist)
    if (sizeof(stdlib_cache) >= max_stdlib_modules && !stdlib_cache[key]) {
        evict_lru_stdlib();
    }
    stdlib_cache[key] = data;
    access_counter++;
    cache_access_counter["stdlib:" + key] = access_counter;
}

//! Clear all stdlib data from cache.
void clear_stdlib() {
    stdlib_cache = ([]);
}

//! Get import data from cache with mtime validation.
//!
//! If the cached import exists and current_mtime is provided:
//! - If current_mtime > stored mtime: cache entry is invalidated, returns 0
//! - Otherwise: access counter is updated and cached data is returned
//!
//! @param key
//!   The cache key for the import (typically a file path).
//! @param current_mtime
//!   Optional current modification time for cache invalidation.
//! @returns
//!   The cached import data mapping, or 0 (zero) if not found or invalidated.
mapping get_import(string key, int|void current_mtime) {
    if (import_cache[key]) {
        // Check if cache entry is stale based on mtime
        if (current_mtime && import_mtime[key]) {
            if (current_mtime > import_mtime[key]) {
                // File has been modified, invalidate cache
                invalidate_import(key);
                stats["import_misses"]++;
                return 0;
            }
        }
        stats["import_hits"]++;
        access_counter++;
        cache_access_counter["import:" + key] = access_counter;
        return import_cache[key];
    }
    stats["import_misses"]++;
    return 0; // Not found
}

//! Put import data in cache with LRU eviction.
//!
//! If the cache is at capacity and the key is not already present,
//! the least-recently-used import will be evicted.
//!
//! @param key
//!   The cache key for the import.
//! @param data
//!   The import context data mapping to cache.
//! @param mtime
//!   Optional modification time for cache invalidation.
void put_import(string key, mapping data, int|void mtime) {
    // Check if we need to evict (only if key doesn't already exist)
    if (sizeof(import_cache) >= max_cached_imports && !import_cache[key]) {
        evict_lru_import();
    }
    import_cache[key] = data;
    if (mtime) {
        import_mtime[key] = mtime;
    }
    access_counter++;
    cache_access_counter["import:" + key] = access_counter;
}

//! Clear all import data from cache.
void clear_imports() {
    import_cache = ([]);
    import_mtime = ([]);
}

//! Invalidate a specific import cache entry.
//!
//! @param key
//!   The cache key for the import to invalidate.
void invalidate_import(string key) {
    m_delete(import_cache, key);
    m_delete(import_mtime, key);
    m_delete(cache_access_counter, "import:" + key);
}

//! Evict the least-recently-used import from cache.
//!
//! This private method finds the import with the oldest access time
//! and removes it from the cache.
private void evict_lru_import() {
    string lru_key = 0;
    int lru_count = access_counter + 1;
    string prefix = "import:";

    foreach (import_cache; string key; mapping data) {
        int at = cache_access_counter[prefix + key] || 0;
        if (at < lru_count) {
            lru_count = at;
            lru_key = key;
        }
    }

    if (lru_key) {
        m_delete(import_cache, lru_key);
        m_delete(import_mtime, lru_key);
        m_delete(cache_access_counter, prefix + lru_key);
    }
}

//! Evict the least-recently-used program from cache.
//!
//! This private method finds the program with the oldest access time
//! and removes it from the cache.
private void evict_lru_program() {
    string lru_key = 0;
    int lru_count = access_counter + 1;

    foreach (program_cache; string key; program prog) {
        int at = cache_access_counter[key] || 0;
        if (at < lru_count) {
            lru_count = at;
            lru_key = key;
        }
    }

    if (lru_key) {
        m_delete(program_cache, lru_key);
        m_delete(cache_access_counter, lru_key);
    }
}

//! Evict the least-recently-used stdlib module from cache.
//!
//! This private method finds the stdlib module with the oldest access time
//! and removes it from the cache.
private void evict_lru_stdlib() {
    string lru_key = 0;
    int lru_count = access_counter + 1;
    string prefix = "stdlib:";

    foreach (stdlib_cache; string key; mapping data) {
        int at = cache_access_counter[prefix + key] || 0;
        if (at < lru_count) {
            lru_count = at;
            lru_key = key;
        }
    }

    if (lru_key) {
        m_delete(stdlib_cache, lru_key);
        m_delete(cache_access_counter, prefix + lru_key);
    }
}

//! Generic get method - dispatches to appropriate cache by name.
//!
//! @param cache_name
//!   Either "program_cache", "stdlib_cache", or "import_cache".
//! @param key
//!   The cache key to retrieve.
//! @returns
//!   The cached value, or 0 (zero) if not found.
mixed get(string cache_name, string key) {
    switch (cache_name) {
        case "program_cache":
            return get_program(key);
        case "stdlib_cache":
            return get_stdlib(key);
        case "import_cache":
            return get_import(key);
        default:
            return 0;
    }
}

//! Generic put method - dispatches to appropriate cache by name.
//!
//! @param cache_name
//!   Either "program_cache", "stdlib_cache", or "import_cache".
//! @param key
//!   The cache key to store under.
//! @param value
//!   The value to cache (program for program_cache, mapping for others).
void put(string cache_name, string key, mixed value) {
    switch (cache_name) {
        case "program_cache":
            put_program(key, value);
            break;
        case "stdlib_cache":
            put_stdlib(key, value);
            break;
        case "import_cache":
            put_import(key, value);
            break;
    }
}

//! Generic clear method - clears the specified cache.
//!
//! @param cache_name
//!   Either "program_cache", "stdlib_cache", "import_cache", or "all" to clear all.
void clear(string cache_name) {
    switch (cache_name) {
        case "program_cache":
            clear_programs();
            break;
        case "stdlib_cache":
            clear_stdlib();
            break;
        case "import_cache":
            clear_imports();
            break;
        case "all":
            clear_programs();
            clear_stdlib();
            clear_imports();
            break;
    }
}

//! Get cache statistics.
//!
//! @returns
//!   A mapping containing:
//!   - program_hits: Number of program cache hits
//!   - program_misses: Number of program cache misses
//!   - program_size: Current number of cached programs
//!   - program_max: Maximum number of cached programs
//!   - stdlib_hits: Number of stdlib cache hits
//!   - stdlib_misses: Number of stdlib cache misses
//!   - stdlib_size: Current number of cached stdlib modules
//!   - stdlib_max: Maximum number of cached stdlib modules
//!   - import_hits: Number of import cache hits
//!   - import_misses: Number of import cache misses
//!   - import_size: Current number of cached imports
//!   - import_max: Maximum number of cached imports
mapping get_stats() {
    return ([
        "program_hits": stats["program_hits"],
        "program_misses": stats["program_misses"],
        "program_size": sizeof(program_cache),
        "program_max": max_cached_programs,
        "stdlib_hits": stats["stdlib_hits"],
        "stdlib_misses": stats["stdlib_misses"],
        "stdlib_size": sizeof(stdlib_cache),
        "stdlib_max": max_stdlib_modules,
        "import_hits": stats["import_hits"],
        "import_misses": stats["import_misses"],
        "import_size": sizeof(import_cache),
        "import_max": max_cached_imports
    ]);
}

//! Get file modification time for cache validation.
//!
//! Uses Pike's file_stat() to retrieve file metadata. Returns 0 for
//! non-existent files or failed stat operations, allowing graceful
//! degradation in cache validation logic.
//!
//! @param path
//!   Absolute path to the file.
//! @returns
//!   File modification time (Unix timestamp), or 0 if file doesn't exist.
int get_file_mtime(string path) {
    object stat = file_stat(path);
    if (stat && stat->mtime) return stat->mtime;
    return 0;
}

//! Set maximum cache sizes.
//!
//! Allows runtime configuration of cache limits. If the current cache
//! size exceeds the new limit, items will be evicted on next insertion.
//!
//! @param max_programs
//!   Maximum number of programs to cache.
//! @param max_stdlib
//!   Maximum number of stdlib modules to cache.
//! @param max_imports
//!   Maximum number of imports to cache.
void set_limits(int max_programs, int max_stdlib, int|void max_imports) {
    max_cached_programs = max_programs;
    max_stdlib_modules = max_stdlib;
    if (max_imports) {
        max_cached_imports = max_imports;
    }
}
