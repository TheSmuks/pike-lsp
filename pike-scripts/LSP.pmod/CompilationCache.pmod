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

    //! Files this compilation depends on (imported and inherited modules)
    array(string) dependencies;

    //! Create a new CompilationResult
    //!
    //! @param prog The compiled program
    //! @param diags Compilation diagnostics
    //! @param deps List of dependency file paths (defaults to empty array)
    void create(program prog, array(mapping) diags, array(string)|void deps) {
        compiled_program = prog;
        diagnostics = diags;
        dependencies = deps || ({});
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

//! Update dependency graph for a file
//!
//! Removes old edges before adding new ones to prevent stale accumulation
//! (preventing the "stale edge accumulation" anti-pattern).
//!
//! @param path The file being compiled
//! @param new_deps Array of dependencies discovered during compilation
void update_dependency_graph(string path, array(string) new_deps) {
    // Remove old edges (incremental update)
    if (dependencies[path]) {
        foreach (dependencies[path], string old_dep) {
            if (dependents[old_dep]) {
                dependents[old_dep][path] = 0;
            }
        }
    }

    // Filter to local dependencies only
    array(string) local_deps = ({});
    foreach (new_deps, string dep) {
        if (is_local_file(dep)) {
            local_deps += ({dep});
        }
    }

    // Add new edges
    dependencies[path] = local_deps;
    foreach (local_deps, string dep) {
        if (!dependents[dep]) {
            dependents[dep] = (<>);
        }
        dependents[dep][path] = 1;
    }
}

//! Invalidate all files that transitively depend on the changed file
//!
//! Uses BFS traversal through reverse dependency graph to find and invalidate
//! all files that directly or indirectly depend on the changed file.
//!
//! Guard clause: only runs if file exists in dependency index, preventing
//! unnecessary work when a file with no dependents changes.
//!
//! @param changed_path The file that changed
void invalidate_transitive(string changed_path) {
    // Guard clause: only run if file exists in dependency index
    if (!dependents[changed_path] && !dependencies[changed_path]) {
        return;
    }

    array(string) queue = ({changed_path});
    multiset(string) visited = (<changed_path>);

    while (sizeof(queue) > 0) {
        string path = queue[0];
        queue = queue[1..];

        // Remove from cache
        m_delete(compilation_cache, path);

        // Remove from dependency graphs
        if (dependencies[path]) {
            foreach (dependencies[path], string dep) {
                if (dependents[dep]) {
                    dependents[dep][path] = 0;
                }
            }
            m_delete(dependencies, path);
        }

        // Add all dependents to queue
        if (dependents[path]) {
            foreach (indices(dependents[path]), string dependent) {
                if (!visited[dependent]) {
                    visited[dependent] = 1;
                    queue += ({dependent});
                }
            }
        }
    }
}

// =========================================================================
// CompilationContext Class
// =========================================================================

//! Context for tracking import state across multiple compilations
//!
//! This class maintains a set of discovered imports that can be
//! shared across compilations. When File A with "import X" is compiled
//! before File B with "inherit X", the import context ensures X is
//! resolvable during File B's compilation.
//!
//! Usage:
//! @code
//! object ctx = CompilationContext();
//! ctx->add_import("Module.Submodule");
//! array(string) imports = ctx->get_imports();
//! @endcode
class CompilationContext {
    //! Set of discovered imports from compiled files
    private multiset(string) _imports = (<>);

    //! Add an import to the context
    //! @param import_path Module path being imported (e.g., "Module.Submodule")
    void add_import(string import_path) {
        if (import_path && sizeof(import_path) > 0) {
            _imports[import_path] = 1;
        }
    }

    //! Add multiple imports to the context
    //! @param import_paths Array of module paths being imported
    void add_imports(array(string) import_paths) {
        foreach (import_paths, string path) {
            add_import(path);
        }
    }

    //! Get all discovered imports
    //! @returns Array of import paths (as an array, not multiset)
    array(string) get_imports() {
        return indices(_imports);
    }

    //! Check if an import is in the context
    //! @param import_path Module path to check
    //! @returns 1 if imported, 0 otherwise
    int has_import(string import_path) {
        return _imports[import_path] ? 1 : 0;
    }

    //! Clear all imports from the context
    void clear() {
        _imports = (<>);
    }

    //! Get the number of tracked imports
    //! @returns Count of imports in context
    int size() {
        return sizeof(_imports);
    }
}

// =========================================================================
// DependencyTrackingCompiler Class
// =========================================================================

//! Compiler wrapper that tracks dependencies during compilation
//!
//! This class wraps Pike's compile_string() to capture dependency information
//! during compilation. Dependencies are discovered via Parser.Pike analysis
//! of import/inherit directives.
//!
//! NOTE: Full compiler hook override (handle_inherit, handle_import) requires
//! runtime testing with Pike 8.0.1116 to verify exact API. The current
//! implementation uses post-compilation analysis via Parser.Pike.
class DependencyTrackingCompiler {
    private array(string) _dependencies = ({});
    private array(mapping) _diagnostics = ({});
    private string _current_file;
    private object _compilation_context;

    //! Get captured dependencies after compilation
    //! @returns Array of dependency file paths
    array(string) get_dependencies() {
        return _dependencies;
    }

    //! Get captured compilation diagnostics (syntax errors)
    //!
    //! For Roxen framework code, stub definitions are automatically prepended
    //! during compilation to prevent false positive "undefined identifier" errors.
    //!
    //! @returns Array of diagnostic mappings with message, severity, position
    array(mapping) get_diagnostics() {
        return _diagnostics;
    }

    //! Set the compilation context for import tracking
    //! @param ctx CompilationContext instance to use
    void set_compilation_context(object ctx) {
        _compilation_context = ctx;
    }

    //! Set the file being compiled (for context in hooks)
    //! @param path The file path being compiled
    void set_current_file(string path) {
        _current_file = path;
        _dependencies = ({});
        _diagnostics = ({});
    }

    //! Extract dependencies from Pike code using simple regex-based parsing
    //! Finds inherit and import directives to track module dependencies
    //! @param code The source code to analyze
    //! @param current_file The file being compiled (for resolving relative paths)
    //! @returns Array of discovered dependency paths
    private array(string) extract_dependencies(string code, string current_file) {
        array(string) deps = ({});
        array(string) imports = ({});
        array(string) lines = code / "\n";

        foreach (lines, string line) {
            // Skip comments
            line = String.trim_all_whites(line);
            if (has_prefix(line, "//") || sizeof(line) == 0) continue;

            // Look for inherit directives: inherit "path" or inherit Module.Name
            if (has_prefix(line, "inherit ")) {
                string rest = line[8..]; // Skip "inherit "
                rest = String.trim_all_whites(rest);

                // Remove trailing semicolon and comments
                int semicolon = search(rest, ";");
                if (semicolon >= 0) {
                    rest = rest[0..semicolon-1];
                }
                int comment = search(rest, "//");
                if (comment >= 0) {
                    rest = rest[0..comment-1];
                }
                rest = String.trim_all_whites(rest);

                // Remove quotes if present
                if (has_prefix(rest, "\"") && has_suffix(rest, "\"")) {
                    rest = rest[1..sizeof(rest)-2];
                }

                if (sizeof(rest) > 0) {
                    deps += ({rest});
                }
            }

            // Look for import directives: import Module.Name
            if (has_prefix(line, "import ")) {
                string rest = line[7..]; // Skip "import "
                rest = String.trim_all_whites(rest);

                // Remove trailing semicolon and comments
                int semicolon = search(rest, ";");
                if (semicolon >= 0) {
                    rest = rest[0..semicolon-1];
                }
                int comment = search(rest, "//");
                if (comment >= 0) {
                    rest = rest[0..comment-1];
                }
                rest = String.trim_all_whites(rest);

                if (sizeof(rest) > 0) {
                    imports += ({rest});
                    deps += ({rest});
                }
            }
        }

        // Add imports to compilation context if available
        if (_compilation_context && sizeof(imports) > 0) {
            _compilation_context->add_imports(imports);
        }

        return deps;
    }

    //! Compile with dependency tracking
    //!
    //! For Roxen framework code, automatically prepends stub definitions to
    //! allow compilation of code using Roxen.RequestID, RXML.Tag, etc.
    //!
    //! @param code The source code to compile
    //! @param filename The filename for compilation (for error messages)
    //! @returns The compiled program, or 0 on compilation failure
    //! @note Call get_diagnostics() after to retrieve any captured errors
    program compile_with_tracking(string code, string filename) {
        // Set current file for hook context
        set_current_file(filename);

        // Capture compilation errors into instance variable
        void compile_error_handler(string file, int line, string msg) {
            _diagnostics += ({([
                "message": msg,
                "severity": "error",
                "position": (["file": file, "line": line])
            ])});
        };

        mixed old_handler = master()->get_inhibit_compile_errors();
        master()->set_inhibit_compile_errors(compile_error_handler);

        program prog = 0;
        mixed err = catch {
            // Check if this code uses Roxen framework APIs
            // If so, prepend stub definitions to allow compilation
            string code_to_compile = code;

            // Detect Roxen usage patterns
            int has_roxen = has_value(code, "Roxen.") || has_value(code, "RequestID.") ||
                           has_value(code, "RXML.") || has_value(code, "inherit \"module\"") ||
                           has_value(code, "inherit 'module'");

            if (has_roxen) {
                // Prepend minimal stub definitions for Roxen framework
                // These stubs allow code to compile during LSP analysis
                string roxen_stubs =
                    "// Roxen Framework Stubs for LSP Compilation\n" +
                    "// Real Roxen framework provides actual implementations at runtime\n" +
                    "\n" +
                    "class RequestID {\n" +
                    "    mapping variables = ([]);\n" +
                    "    mapping config = ([]);\n" +
                    "    string remoteaddr = \"\";\n" +
                    "    string query_string = \"\";\n" +
                    "    string method = \"GET\";\n" +
                    "    void set_max_cache(int seconds) { }\n" +
                    "    string url_base() { return \"\"; }\n" +
                    "}\n" +
                    "\n" +
                    "class Tag {\n" +
                    "    string name = \"\";\n" +
                    "    mapping(string:mixed) args = ([]);\n" +
                    "    void create(string|int n, void|mapping a) { name = (string)n; args = a || ([]); }\n" +
                    "}\n" +
                    "\n" +
                    "class TagSet {\n" +
                    "    string name = \"\";\n" +
                    "    array(Tag) tags = ({});\n" +
                    "    void create(string n, void|array(Tag) t) { name = n; tags = t || ({}); }\n" +
                    "    void add_tag(Tag t) { tags += ({t}); }\n" +
                    "}\n" +
                    "\n" +
                    "constant MODULE_TAG = 0;\n" +
                    "constant MODULE_LOCATION = 1;\n" +
                    "constant MODULE_FILTER = 2;\n" +
                    "constant MODULE_PARSER = 3;\n" +
                    "constant MODULE_DIRECTORIES = 4;\n" +
                    "constant MODULE_PROVIDER = 5;\n" +
                    "constant MODULE_AUTH = 6;\n" +
                    "\n" +
                    "constant TYPE_STRING = 0;\n" +
                    "constant TYPE_INT = 1;\n" +
                    "constant TYPE_FLOAT = 2;\n" +
                    "constant TYPE_FILE = 3;\n" +
                    "constant TYPE_DIR = 4;\n" +
                    "constant TYPE_FLAG = 5;\n" +
                    "\n";

                code_to_compile = roxen_stubs + code;
            }

            prog = compile_string(code_to_compile, filename);
        };

        master()->set_inhibit_compile_errors(old_handler);

        // Don't throw on error - caller should check get_diagnostics() and return value
        if (err) {
            // Still extract dependencies even on error (useful for partial analysis)
            _dependencies = extract_dependencies(code, filename);
            return 0;
        }

        // Extract dependencies post-compilation using Parser.Pike
        _dependencies = extract_dependencies(code, filename);

        return prog;
    }
}

// =========================================================================
// Cache Operations
// =========================================================================

//! Evict the N least-recently-used entries from compilation cache.
//! Uses hash-based pseudo-random eviction to avoid tracking overhead.
//! Also cleans up dependency graph edges for evicted files.
//! @param count Number of entries to evict
private void evict_lru_batch(int count) {
    // Hash-based eviction: sort by path hash for deterministic "random" eviction
    // Zero tracking overhead - no access_counter or cache_access_counter needed
    array(string) paths = indices(compilation_cache);
    array(int) hashes = map(paths, hash);  // Hash each path for pseudo-random order
    sort(hashes, paths);  // Sort by hash to get consistent eviction order

    int to_evict = min(count, sizeof(paths));
    for (int i = 0; i < to_evict; i++) {
        // Evict the entry
        m_delete(compilation_cache, paths[i]);

        // Clean dependency graph edges
        if (dependencies[paths[i]]) {
            foreach (dependencies[paths[i]], string dep) {
                if (dependents[dep]) dependents[dep][paths[i]] = 0;
            }
            m_delete(dependencies, paths[i]);
        }
        stats->evictions++;
    }
}

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
//! Also updates the dependency graph with any dependencies found during
//! compilation.
//!
//! @param path
//!   The file path for the compilation
//! @param version_key
//!   The version key for this specific version of the file
//! @param result
//!   The CompilationResult to cache
void put(string path, string version_key, CompilationResult result) {
    // Check size limit - LRU eviction if at capacity
    // Only evict if this is a new file (not already in cache)
    if (sizeof(compilation_cache) >= MAX_CACHED_FILES && !compilation_cache[path]) {
        evict_lru_batch(MAX_CACHED_FILES / 10);  // Evict oldest 10%
    }

    // Update dependency graph with new dependencies
    if (result->dependencies && sizeof(result->dependencies) > 0) {
        update_dependency_graph(path, result->dependencies);
    }

    if (!compilation_cache[path]) {
        compilation_cache[path] = ([]);
    }
    compilation_cache[path][version_key] = result;
}

//! Invalidate all cached versions of a file
//!
//! O(1) invalidation - removes all version entries for the given path.
//! Supports transitive invalidation to also invalidate all files that
//! depend on this one.
//!
//! @param path
//!   The file path to invalidate
//! @param transitive
//!   If true (1), also invalidate all files that transitively depend on this file
void invalidate(string path, void|int transitive) {
    if (transitive) {
        invalidate_transitive(path);
    } else {
        if (compilation_cache[path]) {
            m_delete(compilation_cache, path);
        }
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
