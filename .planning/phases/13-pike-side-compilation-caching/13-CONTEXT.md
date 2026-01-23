# Phase 13: Pike-Side Compilation Caching - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

## Phase Boundary

Implement in-memory caching of compiled Pike programs within the subprocess to avoid recompiling unchanged code on subsequent requests. Cache invalidates on file modification via stat-based key mismatch, persists within session (clears on VSCode restart). Support transitive invalidation through dependency tracking.

## Implementation Decisions

### Cache Key Strategy
- **Composite string key:** `path\0mtime\0size` using `\0` as separator (no escaping issues with colons in paths)
- **Pike default mtime:** Second precision from `Stdio.Stat.mtime` is sufficient; size in key catches same-second edge cases
- **Automatic invalidation:** Different key = automatic cache miss, no explicit invalidation logic needed for basic case

### Cache Invalidation
- **Dual-path approach:**
  - **Open documents:** Use LSP version numbers from `didChange`, skip disk stat entirely
  - **Closed files:** Stat on every lookup + implicit key mismatch on change
- **Transitive dependency invalidation:** BFS through reverse dependency graph when tracked file changes
- **Guard clause:** Only run invalidation if file exists in dependency index (`dependents[path] || dependencies[path]`)
- **Path normalization:** Use `combine_path(getcwd(), path)` before index lookup

### Cache Storage Structure
- **Nested by file:** `mapping(string:mapping(string:CompilationResult))`
  - Outer key: file path
  - Inner key: `mtime\0size` version key
- **O(1) invalidation:** `m_delete(cache, path)` removes all versions of a file
- **Size limit:** MAX_CACHED_FILES = 500, nuclear eviction (clear cache, keep dependency graph)
- **CompilationResult contents:** Minimal viable - diagnostics, imports, compiled_program. Derive symbols lazily from program object.

### Dependency Handling
- **Extraction via Pike compiler hooks:** Use compile_file/handle_inherit overrides to capture actual resolved paths during compilation
- **Local dependencies only:** Track files within project_root, skip stdlib/external modules (they don't change during session)
- **Incremental graph updates:** Remove old edges, add new edges per recompile. Prevents stale edge accumulation.
- **Data structures:**
  - `dependencies: mapping(string:array(string))` - forward edges (what file imports)
  - `dependents: mapping(string:multiset(string))` - reverse edges (what imports file)

### Claude's Discretion
- Exact cache size limit tuning (start with 500, adjust based on real-world usage)
- Whether to add LRU eviction if nuclear proves disruptive (unlikely)
- Additional_source_paths configuration format for vendored libs
- Pike compiler hook API specifics (varies by version, use what's available)

## Specific Ideas

- Cache key format: `sprintf("%s\0%d\0%d", path, st->mtime, st->size)` - single O(1) mapping lookup
- Dependency tracking only for files inside project_root to keep graph small
- LSP open documents tracked separately: `mapping(string:DocumentState)` with in-memory content

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 13-pike-side-compilation-caching*
*Context gathered: 2026-01-23*
