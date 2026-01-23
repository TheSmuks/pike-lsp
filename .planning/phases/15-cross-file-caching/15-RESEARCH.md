# Phase 15: Cross-File Caching - Research

**Researched:** 2026-01-23
**Domain:** Pike compilation cache verification, cross-file dependency testing
**Confidence:** HIGH

## Summary

Phase 15 is a **verification phase**, not new feature development. Phase 13 built the CompilationCache infrastructure with dependency tracking (DependencyTrackingCompiler, bidirectional dependency graph, transitive invalidation via BFS). This phase confirms that imported/inherited files are correctly cached and that modifying a dependency file invalidates dependent files' caches.

**Key findings from Phase 13 verification:**
- CompilationCache module (477 lines) implements nested mapping cache (path -> version -> CompilationResult)
- DependencyTrackingCompiler captures inherit/import directives via regex-based parsing
- Bidirectional dependency graph supports transitive invalidation
- Current implementation stores empty dependencies array (line 756 in Analysis.pmod/module.pmod): `ResultClass(compiled_prog, ({}), ({}))`

**Primary recommendation:** Phase 15 should verify that the dependency tracking infrastructure actually works end-to-end. The existing `DependencyTrackingCompiler.extract_dependencies()` method parses inherit/import directives, but it's not being used in the main compilation flow. Verification tests must confirm both that dependencies are tracked and that transitive invalidation works.

## Standard Stack

### Core (Existing from Phase 13)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Pike stdlib | 8.0.1116 | `compile_string()`, `master()->resolv()` | Native compilation |
| LSP.CompilationCache | existing | Nested mapping cache with dependency tracking | Built in Phase 13 |
| DependencyTrackingCompiler | existing | Extracts inherit/import dependencies | Built in Phase 13 |
| mitata | existing | Benchmark runner | Already in use |

### Testing Framework

| Component | Purpose | How to Use |
|-----------|---------|------------|
| `packages/pike-lsp-server/benchmarks/runner.ts` | Benchmark runner | Extend with new test group |
| `packages/pike-lsp-server/benchmarks/fixtures/` | Test fixtures | Add cross-file test fixtures |
| `scripts/check-benchmark-regression.js` | CI regression gate | Add verification checks |

**Installation:** No new packages needed - extends existing benchmark suite.

## Architecture Patterns

### Current CompilationCache Structure

```
CompilationCache.pmod (module-level singleton):
|
+-- compilation_cache = ([
|      "/path/to/file.pike": ([
|          "LSP:1": CompilationResult,
|          "FS:1737654400\01234": CompilationResult,
|      ])
|   ])
|
+-- dependencies = ([
|      "/path/to/file.pike": ({"/path/to/dep.pike"}),
|   ])
|
+-- dependents = ([
|      "/path/to/dep.pike": (< "/path/to/file.pike" >),
|   ])
|
+-- DependencyTrackingCompiler class:
|   +-- extract_dependencies(code, filename)
|   +-- compile_with_tracking(code, filename)
|
+-- Cache operations:
    +-- get(path, version_key) -> CompilationResult
    +-- put(path, version_key, result)
    +-- invalidate(path, transitive)
    +-- invalidate_transitive(changed_path) // BFS traversal
```

### Current Integration (from Phase 13)

```pike
// In LSP.pmod/Analysis.pmod/module.pmod (lines 707-760)
cache = get_compilation_cache();
cache_key = cache->make_cache_key(filename, lsp_version);
cached_result = cache->get(filename, cache_key);

if (cached_result && cached_result->compiled_program) {
    compiled_prog = cached_result->compiled_program;  // CACHE HIT
    cache_hit = 1;
} else {
    compiled_prog = compile_string(code, filename);  // CACHE MISS
    // Store with EMPTY dependencies (GAP: not using DependencyTrackingCompiler)
    object result = ResultClass(compiled_prog, ({}), ({}));
    cache->put(filename, cache_key, result);
}
```

### Gap Identified: Empty Dependencies

**Current state:** Line 756 in Analysis.pmod/module.pmod stores results with empty dependencies:
```pike
object result = ResultClass(compiled_prog, ({}), ({}));  // deps = ([])
```

**What's missing:** The DependencyTrackingCompiler exists but is not wired into the compilation flow. Dependencies are not being captured during actual compilation.

**Impact for Phase 15:** Without dependency tracking in the main flow, cross-file cache invalidation won't work automatically. This is the key verification gap.

### Pattern 1: Cross-File Test Fixture Structure

**What:** Create a main file that inherits from a library file

**When to use:** For testing cross-file caching and dependency invalidation

**Example fixture structure:**
```
benchmarks/fixtures/
├── cross-file/
│   ├── main.pike         // inherits lib/utils.pike
│   └── lib/
│       └── utils.pike    // utility class
```

```pike
// main.pike
inherit "../fixtures/cross-file/lib/utils.pike";

class Main {
    void run() {
        Utils()->do_something();
    }
}
```

### Pattern 2: Verification Function Structure

**What:** Add verification functions to benchmark suite

**When to use:** After benchmarks complete, verify cache behavior

**Example:**
```typescript
// In runner.ts, after benchmarks complete:
async function verify_import_caching() {
    // 1. Compile main.pike (should cache both main and utils)
    const response1 = await bridge.analyze(mainCode, ['introspect'], 'main.pike', 1);

    // 2. Check cache stats - should show 2 files cached
    const stats1 = await bridge.sendRequest('get_cache_stats', {});
    console.assert(stats1.size >= 2, 'Expected at least 2 files in cache');

    // 3. Re-compile with same version - should hit cache
    const response2 = await bridge.analyze(mainCode, ['introspect'], 'main.pike', 1);
    console.assert(response2._perf?.cache_hit === true, 'Expected cache hit');

    return { passed: true };
}

async function verify_dependency_invalidation() {
    // 1. Compile main.pike
    await bridge.analyze(mainCode, ['introspect'], 'main.pike', 1);

    // 2. Simulate lib/utils.pike change by calling with new "version"
    // (In real scenario, file change would trigger invalidate)
    const stats = await bridge.sendRequest('get_cache_stats', {});
    const sizeBefore = stats.size;

    // 3. Invalidate utils.pike directly (simulating file change)
    await bridge.sendRequest('invalidate_cache', { path: 'lib/utils.pike', transitive: true });

    // 4. Check cache - both utils.pike AND main.pike should be gone
    const statsAfter = await bridge.sendRequest('get_cache_stats', {});
    console.assert(statsAfter.size < sizeBefore, 'Expected cache to invalidate dependents');

    return { passed: true };
}
```

### Anti-Patterns to Avoid

- **Using relative paths in cache keys**: Creates ambiguity - use normalized absolute paths
- **Testing with stdlib dependencies**: Stdlib files are filtered out (is_local_file) - use project-local files only
- **Assuming cache persists across benchmarks**: Each benchmark group may have different state - check explicitly
- **Forgetting to reset cache between tests**: Use `invalidate_all()` or create fresh bridge instance

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-file test setup | Manual file creation | Use fixtures directory pattern | Existing benchmark infrastructure |
| Cache assertions | Custom verification code | `get_cache_stats` RPC handler | Already exposes cache state |
| Path resolution | String manipulation | `combine_path(getcwd(), path)` | Pike stdlib handles this |
| IPC for cache stats | New RPC methods | Existing `get_cache_stats` handler | Already implemented |

**Key insight:** Phase 13 already built all the infrastructure. Phase 15 is about verifying it works, not building new features.

## Common Pitfalls

### Pitfall 1: Testing with Non-Local Dependencies

**What goes wrong:** Stdlib or external dependencies are filtered out by `is_local_file()`, so dependency graph appears empty

**Why it happens:** Phase 13 explicitly filters to project-local files only (line 141-144 in CompilationCache.pmod)

**How to avoid:** Create test fixtures within the project directory, use `inherit` for same-project files

**Warning signs:** `dependencies` array is empty after compilation

### Pitfall 2: Regex-Based Dependency Extraction Misses Complex Cases

**What goes wrong:** `extract_dependencies()` uses simple line-based regex that may miss multi-line imports or conditional inherits

**Why it happens:** Lines 263-321 in CompilationCache.pmod use string prefix matching (has_prefix)

**How to avoid:** Keep test fixtures simple - single-line inherit/import statements

**Warning signs:** Expected dependencies don't appear in dependency graph

### Pitfall 3: Empty Dependencies Bug in Current Implementation

**What goes wrong:** Line 756 in Analysis.pmod/module.pmod creates CompilationResult with empty dependencies array

**Why it happens:** Comment says "DependencyTrackingCompiler integration can be added later"

**How to avoid:** Phase 15 must either (a) wire up DependencyTrackingCompiler or (b) document this as a gap

**Warning signs:** `update_dependency_graph()` is never called with non-empty deps

### Pitfall 4: Transitive Invalidation Without Dependencies

**What goes wrong:** Calling `invalidate_transitive()` has no effect if dependency graph is empty

**Why it happens:** BFS traversal starts from `dependents[changed_path]`, which is empty if no dependencies tracked

**How to avoid:** Verify dependencies are tracked before testing transitive invalidation

**Warning signs:** Invalidating a file doesn't invalidate its dependents

### Pitfall 5: Path Normalization in Tests

**What goes wrong:** Test uses relative path but cache uses absolute path, creating duplicate entries

**Why it happens:** `combine_path(project_root, path)` normalizes differently than expected

**How to avoid:** Use absolute paths consistently in tests, or verify normalization behavior first

**Warning signs:** Cache size larger than expected, duplicate keys

## Code Examples

### Example 1: Minimal Cross-File Fixture

```pike
// File: packages/pike-lsp-server/benchmarks/fixtures/cross-file/lib/utils.pike
//! Utility base class for cross-file caching tests

class Utils {
    string get_greeting() {
        return "Hello from utils";
    }
}
```

```pike
// File: packages/pike-lsp-server/benchmarks/fixtures/cross-file/main.pike
//! Main class that inherits from utils - for dependency tracking tests
inherit "lib/utils.pike";

class Main {
    void run() {
        object utils = Utils();
        // Call inherited method
        string greeting = utils->get_greeting();
    }
}
```

### Example 2: Verification Test Structure

```typescript
// In packages/pike-lsp-server/benchmarks/runner.ts
import * as fs from 'fs';
import * as path from 'path';

// Add after existing benchmark groups
group('Cross-File Cache Verification', async () => {
    const mainCode = fs.readFileSync(
        path.join(__dirname, 'fixtures/cross-file/main.pike'),
        'utf8'
    );
    const utilsCode = fs.readFileSync(
        path.join(__dirname, 'fixtures/cross-file/lib/utils.pike'),
        'utf8'
    );

    // Test 1: Verify both files are cached after compiling main
    bench('Import caching: compile main with dependency', async () => {
        const response = await bridge.analyze(mainCode, ['introspect'], 'main.pike', 1);
        return response;
    });

    // Test 2: Verify cache hit on recompile
    bench('Import caching: recompile main (cache hit)', async () => {
        const response = await bridge.analyze(mainCode, ['introspect'], 'main.pike', 1);
        return response;
    });

    // Test 3: Verify transitive invalidation
    bench('Dependency invalidation: invalidate utils, check main', async () => {
        // First, compile main (caches both)
        await bridge.analyze(mainCode, ['introspect'], 'main.pike', 1);

        // Get stats before invalidation
        const statsBefore = await bridge.sendRequest('get_cache_stats', {});

        // Invalidate utils (should also invalidate main)
        await bridge.sendRequest('invalidate_cache', {
            path: 'lib/utils.pike',
            transitive: true
        });

        // Get stats after - should be smaller
        const statsAfter = await bridge.sendRequest('get_cache_stats', {});

        console.log(`Cache size: ${statsBefore.size} -> ${statsAfter.size}`);
        return { before: statsBefore.size, after: statsAfter.size };
    });
});

// Add verification function after run() completes
if (!process.env.MITATA_JSON) {
    console.log('\n=== Cross-File Cache Verification ===');
    const stats = await (bridge as any).sendRequest('get_cache_stats', {});
    console.log(`Files in cache: ${stats.size}`);
    console.log(`Cache hits: ${stats.hits}, misses: ${stats.misses}`);
}
```

### Example 3: Adding invalidate_cache RPC Handler

```pike
// In pike-scripts/analyzer.pike - add to HANDLERS mapping
"invalidate_cache": lambda(mapping params, object ctx) {
    mixed CacheClass = master()->resolv("LSP.CompilationCache");
    if (CacheClass && programp(CacheClass)) {
        string path = params->path || "";
        int transitive = params->transitive || 0;

        if (transitive) {
            CacheClass->invalidate(path, 1);  // Transitive invalidation
        } else {
            CacheClass->invalidate(path, 0);  // Direct invalidation
        }

        return (["result": (["status": "invalidated"])]);
    }
    return (["error": (["code": -32601, "message": "Cache not available"])]);
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No cross-file caching | CompilationCache with dependency graph | Phase 13 | Infrastructure exists, needs verification |
| Regex-based dependency extraction | Not wired into main flow | Phase 13 | Gap: line 756 stores empty deps |

**Known gaps (from Phase 13):**
- DependencyTrackingCompiler exists but not used in handle_analyze (line 756 comment)
- Cross-file invalidation not tested end-to-end
- invalidate_cache RPC handler doesn't exist (needed for testing)

## Open Questions

1. **Is DependencyTrackingCompiler actually working?**
   - What we know: Class exists with extract_dependencies() method
   - What's unclear: Does regex parsing correctly find inherit statements?
   - Recommendation: Test with simple fixtures first, verify dependencies array is populated

2. **Does transitive invalidation work with empty dependency graph?**
   - What we know: invalidate_transitive() traverses dependents[] multiset
   - What's unclear: What happens when dependents is empty (current state with empty deps)?
   - Recommendation: Verify current behavior - likely does nothing without dependencies

3. **Should we add invalidate_cache RPC handler?**
   - What we know: Phase 13 has get_cache_stats but no invalidate handler
   - What's unclear: Is this needed for testing or can we test via file modification?
   - Recommendation: Add invalidate_cache for deterministic testing

## Sources

### Primary (HIGH confidence)

- **pike-scripts/LSP.pmod/CompilationCache.pmod** - Full module read, 477 lines
- **pike-scripts/LSP.pmod/Analysis.pmod/module.pmod** - Lines 707-760 (cache integration)
- **pike-scripts/analyzer.pike** - Lines 349-364 (get_cache_stats handler)
- **packages/pike-lsp-server/benchmarks/runner.ts** - Full file read, benchmark structure
- **packages/pike-lsp-server/benchmarks/fixtures/cache-test.pike** - Existing test fixture
- **.planning/phases/13-pike-side-compilation-caching/13-VERIFICATION.md** - Phase 13 verification report

### Secondary (MEDIUM confidence)

- **.planning/phases/13-pike-side-compilation-caching/13-RESEARCH.md** - Architecture patterns
- **.planning/STATE.md** - Phase 13 completion summary

### Tertiary (LOW confidence)

- None - all research based on direct codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components from Phase 13, verified in codebase
- Architecture: HIGH - CompilationCache structure fully understood
- Pitfalls: HIGH - Gap in line 756 identified, empty dependencies bug confirmed
- Verification approach: MEDIUM - Test structure is clear, but actual behavior of dependency tracking needs runtime verification

**Research date:** 2026-01-23
**Valid until:** 14 days (verification may reveal implementation gaps requiring re-planning)
