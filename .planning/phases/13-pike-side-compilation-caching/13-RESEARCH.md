# Phase 13: Pike-Side Compilation Caching - Research

**Researched:** 2026-01-23
**Domain:** Pike subprocess caching, compilation performance, dependency tracking
**Confidence:** HIGH

## Summary

This phase implements in-memory caching of compiled Pike programs within the subprocess to avoid recompiling unchanged code on subsequent requests. The existing codebase already has caching infrastructure (`LSP.Cache.pmod`) used for program_cache and stdlib_cache. The phase requires extending this to support file-based cache keys (path + mtime + size) and tracking dependencies between files for transitive invalidation.

**Primary recommendation:** Extend existing `LSP.Cache` module with a new file-based cache layer that tracks dependencies using Pike compiler hooks (`handle_inherit`, `handle_import`), implements the dual-path invalidation strategy (LSP version for open docs, stat for closed files), and integrates with the existing `handle_analyze` flow.

## Standard Stack

### Core (Existing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Pike stdlib | 8.0.1116 | `compile_string()`, `compile_file()`, `Program.inherit_list()` | Native compilation |
| LSP.Cache | existing | LRU cache for programs/stdlib | Already in use, proven pattern |
| Parser.Pike | stdlib | `split()`, `tokenize()` | Tokenization for dependency extraction |
| master() object | stdlib | `resolv()`, compilation hooks | Compiler integration |

### New (To Add)

| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| `LSP.CompilationCache` (new) | File-based compilation cache | Extends existing Cache.pmod pattern |
| Dependency tracker | Track imports/inherits between files | Required for transitive invalidation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom file cache | Extend LSP.Cache directly | LSP.Cache is LRU-only; need nested-by-file structure |
| Pike's Cache.pmod | LSP.Cache | Pike's Cache.pmod is async-oriented, overkill for sync compilation |

**Installation:** No new external packages needed - uses Pike stdlib.

## Architecture Patterns

### Current Compilation Flow

```
LSP Client (VSCode)
    |
    v
TypeScript Server (pike-lsp-server)
    | validateDocument() sends code + filename
    v
PikeBridge (pike-bridge)
    | bridge.analyze(code, ['parse', 'introspect', 'diagnostics'], filename)
    v
Pike Analyzer (analyzer.pike)
    | Analysis.handle_analyze()
    |   -> compile_string(code, filename)  // CURRENT: always recompiles
    |   -> introspect_program(compiled_prog)
    v
Returns symbols + diagnostics
```

### Proposed Cached Compilation Flow

```
LSP Client
    |
    v
TypeScript Server
    | validateDocument() sends code + filename + version (for open docs)
    v
PikeBridge
    | Add: version parameter for open documents
    v
Pike Analyzer
    | Analysis.handle_analyze()
    |   -> Check LSP.CompilationCache.get(path, version_key)
    |   |    CACHE HIT -> Return cached CompilationResult
    |   |    CACHE MISS -> compile_string()
    |   |                -> Extract dependencies via compiler hooks
    |   |                -> Store in LSP.CompilationCache
    |   -> Return results (symbols, diagnostics, compiled_program)
    v
Returns symbols + diagnostics
```

### Pattern 1: Nested Cache Structure (from CONTEXT.md)

**What:** Two-level mapping keyed by file path, then by version hash

**When to use:** For storing multiple versions of a file's compilation result

**Example:**
```pike
// Cache structure per CONTEXT.md decision
mapping(string:mapping(string:CompilationResult)) compilation_cache = ([
    "/path/to/file.pike": ([
        "1737654400:1234": CompilationResult(...),  // mtime:size
        "1737654401:1235": CompilationResult(...),
    ])
]);

// O(1) invalidation - remove all versions of a file
void invalidate_file(string path) {
    m_delete(compilation_cache, path);
}
```

### Pattern 2: Compiler Hook Override (for dependency extraction)

**What:** Override master's compiler hooks to capture actual import/inherit paths

**When to use:** During compilation to extract what files the compiled code depends on

**Example:**
```pike
// Create a custom compilation handler to track dependencies
class DependencyTrackingCompiler {
    inherit master()->get_compilation_handler();

    private array(string) dependencies = ({});
    private string current_file;

    void set_current_file(string path) {
        current_file = path;
        dependencies = ({});
    }

    array(string) get_dependencies() {
        return dependencies;
    }

    // Override handle_inherit to track inherited programs
    string handle_inherit(string inherit_path, string current_file) {
        string resolved = ::handle_inherit(inherit_path, current_file);
        if (resolved && sizeof(resolved) > 0) {
            dependencies += ({ resolved });
        }
        return resolved;
    }

    // Override handle_import to track imported modules
    string handle_import(string import_path, string current_file) {
        string resolved = ::handle_import(import_path, current_file);
        if (resolved && sizeof(resolved) > 0) {
            dependencies += ({ resolved });
        }
        return resolved;
    }
}
```

### Pattern 3: Dual-Path Cache Key Generation

**What:** Different key strategies for open vs closed documents

**When to use:** On every cache lookup

**Example:**
```pike
// Generate cache key based on document state
string get_cache_key(string path, void|int|string lsp_version, void|mapping open_docs) {
    // Check if file is open in editor
    if (open_docs && open_docs[path]) {
        // Open document: use LSP version number (no stat needed)
        return sprintf("LSP:%d", lsp_version || 0);
    } else {
        // Closed file: stat filesystem for mtime + size
        mapping st = file_stat(path);
        if (!st) return 0;  // File doesn't exist
        return sprintf("FS:%d:%d", st->mtime, st->size);
    }
}
```

### Pattern 4: Transitive Invalidation via BFS

**What:** Breadth-first search through reverse dependency graph

**When to use:** When a file changes and all dependents need invalidation

**Example:**
```pike
// Invalidate all files that depend on the changed file
void invalidate_transitive(string changed_path) {
    array(string) queue = ({ changed_path });
    multiset(string) visited = (< changed_path >);

    while (sizeof(queue) > 0) {
        string path = queue[0];
        queue = queue[1..];

        // Remove from cache
        m_delete(compilation_cache, path);

        // Add all dependents to queue
        if (dependents[path]) {
            foreach (indices(dependents[path]), string dependent) {
                if (!visited[dependent]) {
                    visited[dependent] = 1;
                    queue += ({ dependent });
                }
            }
        }
    }
}
```

### Anti-Patterns to Avoid

- **Polluting LSP.Cache namespace**: Don't add file cache to existing program_cache/stdlib_cache - create separate namespace
- **Stat on every request for open docs**: Use LSP version numbers instead, skip stat entirely
- **Tracking stdlib/external dependencies**: Only track files within project_root to keep graph small
- **Manual dependency parsing**: Don't use regex to find imports - use compiler hooks for actual resolution

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU cache eviction | Custom LRU logic | `LSP.Cache` patterns (access_counter tracking) | Proven in existing codebase |
| File stat | Manual stat with error handling | Pike's `file_stat()` | Built-in, handles errors |
| Path normalization | String manipulation | `combine_path(getcwd(), path)` | Handles cross-platform paths |
| Compiler integration | Fork subprocess or IPC | Override master() methods in same process | Already in same process, zero overhead |
| Program introspection | Parse compiled output | `Program.inherit_list()`, `Program.defined()` | Native Pike APIs |

**Key insight:** Pike's compilation happens in-process, so all compiler hooks and program introspection are available directly without IPC overhead.

## Common Pitfalls

### Pitfall 1: Cache Key Collision Without Size Component

**What goes wrong:** Two saves in the same second create same key, returning stale compiled program

**Why it happens:** `Stdio.Stat.mtime` has 1-second resolution; edits within same second have same mtime

**How to avoid:** Always include size in cache key: `sprintf("%s\0%d\0%d", path, st->mtime, st->size)`

**Warning signs:** Cache hit returns stale symbols, diagnostics don't update

### Pitfall 2: Recursive Dependency Graph Updates

**What goes wrong:** Stale dependency edges accumulate, causing incorrect invalidation

**Why it happens:** Adding new edges without removing old ones when recompiling

**How to avoid:** Always remove old edges before adding new ones: `dependencies[path] = new_deps`

**Warning signs:** Files invalidate when they shouldn't, or don't invalidate when they should

### Pitfall 3: Path Normalization Issues

**What goes wrong:** Relative vs absolute paths create duplicate cache entries

**Why it happens:** Cache keys use different path representations

**How to avoid:** Always normalize with `combine_path(getcwd(), path)` before cache operations

**Warning signs:** Same file cached twice, cache invalidation misses

### Pitfall 4: Forgetting to Invalidate Dependencies

**What goes wrong:** Editing base class doesn't invalidate derived classes

**Why it happens:** Only tracking direct dependencies, not transitive

**How to avoid:** Build reverse dependency graph (`dependents` mapping) and traverse on invalidation

**Warning signs:** Introspection shows outdated symbols for inherited members

### Pitfall 5: Compiler Hook Scope Issues

**What goes wrong:** Dependency extraction captures wrong files or misses dependencies

**Why it happens:** Compiler hooks are global; multiple compilations interfere

**How to avoid:** Use per-request handler instances, track `current_file` explicitly

**Warning signs:** Dependencies list contains files from other compilations

## Code Examples

### Example 1: Basic Compilation Cache Lookup

```pike
// Source: Based on LSP.Cache.pmod pattern + CONTEXT.md design
// In Analysis.pmod/module.pmod or new LSP.CompilationCache.pmod

mapping(string:mapping(string:CompilationResult)) compilation_cache = ([]);
constant MAX_CACHED_FILES = 500;

CompilationResult get_or_compile(string path, string code, void|int lsp_version) {
    string cache_key = get_cache_key(path, lsp_version);

    // Check cache
    if (compilation_cache[path] && compilation_cache[path][cache_key]) {
        return compilation_cache[path][cache_key];
    }

    // Check size limit
    if (sizeof(compilation_cache) >= MAX_CACHED_FILES && !compilation_cache[path]) {
        compilation_cache = ([]);  // Nuclear eviction per CONTEXT.md
    }

    // Compile with dependency tracking
    DependencyTrackingCompiler compiler = DependencyTrackingCompiler();
    program compiled_prog = compiler->compile(code, path);
    array(string) deps = compiler->get_dependencies();

    // Extract diagnostics from compilation
    array diagnostics = extract_diagnostics(compiled_prog);

    // Create result
    CompilationResult result = CompilationResult(
        compiled_prog,
        diagnostics,
        deps
    );

    // Store in cache
    if (!compilation_cache[path]) {
        compilation_cache[path] = ([]);
    }
    compilation_cache[path][cache_key] = result;

    // Update dependency graphs
    update_dependency_graph(path, deps);

    return result;
}
```

### Example 2: Cache Key Generation (Dual-Path)

```pike
// Source: CONTEXT.md decision on dual-path approach
// Tracks open documents separately from closed files

mapping(string:int) open_document_versions = ([]);

string get_cache_key(string path, void|int lsp_version) {
    // Check if document is open in editor
    if (open_document_versions[path]) {
        // Open document: use LSP version (no disk stat)
        return sprintf("LSP:%d", lsp_version || open_document_versions[path]);
    } else {
        // Closed file: stat filesystem
        mapping st = file_stat(path);
        if (!st) return 0;  // File deleted
        return sprintf("FS:%d:%d", st->mtime, st->size);
    }
}
```

### Example 3: Dependency Graph Update

```pike
// Source: CONTEXT.md decision on incremental graph updates
// Prevents stale edge accumulation

mapping(string:array(string)) dependencies = ([]);      // forward edges
mapping(string:multiset(string)) dependents = ([]);     // reverse edges

void update_dependency_graph(string path, array(string) new_deps) {
    // Remove old edges (incremental update)
    if (dependencies[path]) {
        foreach (dependencies[path], string old_dep) {
            if (dependents[old_dep]) {
                dependents[old_dep][path] = 0;
            }
        }
    }

    // Add new edges
    dependencies[path] = new_deps;
    foreach (new_deps, string dep) {
        // Only track local dependencies (within project_root)
        if (is_local_file(dep)) {
            if (!dependents[dep]) {
                dependents[dep] = (<>);
            }
            dependents[dep][path] = 1;
        }
    }
}

int is_local_file(string path) {
    // Check if file is within project root
    string normalized = combine_path(getcwd(), path);
    return has_prefix(normalized, getcwd());
}
```

### Example 4: Transitive Invalidation

```pike
// Source: CONTEXT.md decision on BFS traversal
// Invalidates all files that transitively depend on changed file

void invalidate_transitive(string changed_path) {
    array(string) queue = ({ changed_path });
    multiset(string) visited = (< changed_path >);

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

        // Add dependents to queue
        if (dependents[path]) {
            foreach (indices(dependents[path]), string dependent) {
                if (!visited[dependent]) {
                    visited[dependent] = 1;
                    queue += ({ dependent });
                }
            }
        }
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No caching (recompile every request) | LSP.Cache for program_cache/stdlib_cache | Phase 12 (request consolidation) | Reduced redundant work within single request |
| No file tracking | File-based cache keys | Phase 13 (this phase) | Avoid recompiling unchanged files across requests |
| No dependency tracking | Transitive invalidation via graph | Phase 13 (this phase) | Correctly invalidate dependents |

**Deprecated/outdated:**
- Request-based caching only: Each request recompiles, even for unchanged files

## Open Questions

1. **Compiler hook API stability**: The exact API for `handle_inherit`/`handle_import` may vary by Pike version. Need to verify with Pike 8.0.1116 specifically.
   - **What we know:** Pike 8.0 has these hooks on the compilation handler
   - **What's unclear:** Exact function signatures and return types
   - **Recommendation:** Test with actual Pike 8.0.1116 during implementation, add runtime detection

2. **Open document tracking protocol**: How does TypeScript server communicate open document state to Pike subprocess?
   - **What we know:** LSP has `DidOpenTextDocument` and `didChange` notifications with version numbers
   - **What's unclear:** Whether to add new RPC method or piggyback on existing `analyze` call
   - **Recommendation:** Extend `analyze` RPC to accept optional `documentVersion` parameter

3. **Performance of dependency graph traversal**: For large projects, BFS may be expensive.
   - **What we know:** Graph size limited to local files only
   - **What's unclear:** Actual graph depth in real-world projects
   - **Recommendation:** Add metrics during implementation, optimize if needed

## Sources

### Primary (HIGH confidence)

- **pike-scripts/analyzer.pike** - Main entry point, dispatch table, Context service container
- **pike-scripts/LSP.pmod/Analysis.pmod/module.pmod** - Current `handle_analyze()` implementation, compilation flow
- **pike-scripts/LSP.pmod/Cache.pmod** - Existing LRU cache implementation (program_cache, stdlib_cache)
- **pike-scripts/LSP.pmod/Intelligence.pike** - Current introspection, `compile_string()` usage, dependency resolution
- **pike-scripts/LSP.pmod/Parser.pike** - Stateless parser pattern, compilation via `compile_string()`
- **packages/pike-bridge/src/bridge.ts** - TypeScript-to-Pike IPC, `analyze()` method, request deduplication
- **packages/pike-lsp-server/src/server.ts** - LSP document lifecycle, `validateDocument()`, document.version tracking
- **Pike 8.0 stdlib** - Verified availability of `compile_string()`, `file_stat()`, `master()` hooks

### Secondary (MEDIUM confidence)

- **Pike master() methods** - Verified indices include: `compile_file`, `compile_string`, `handle_inherit`, `handle_import`, `handle_include`
- **Cache.pmod/cache.pike** - Read first 100 lines to understand Pike's generic cache (decided not to use - async-oriented)

### Tertiary (LOW confidence)

- None - all research based on direct codebase inspection and Pike stdlib verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components use existing Pike stdlib or codebase patterns
- Architecture: HIGH - Based on existing LSP.Cache patterns + CONTEXT.md decisions
- Pitfalls: HIGH - Identified from codebase patterns (path handling, stat precision, etc.)
- Compiler hooks: MEDIUM - API exists but exact signatures need runtime verification

**Research date:** 2026-01-23
**Valid until:** 30 days (Pike 8.0 API is stable, no fast-moving dependencies)
