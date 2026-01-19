# Domain Pitfalls: Pike Code Modularization

**Domain:** Pike programming language refactoring
**Researched:** 2026-01-19
**Target:** Refactoring monolithic analyzer.pike (3,221 lines) into LSP.pmod/ module structure

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Circular Module Dependencies

**What goes wrong:** Module A imports Module B, which imports Module A. Pike's module system cannot resolve circular dependencies, causing "Cannot resolve module" errors at runtime.

**Why it happens:** During refactoring, shared utilities are extracted into a common module, but handler modules still directly reference each other instead of going through the common module. Pike's `master()->resolv()` and module loading system does not support circular references.

**Consequences:**
- Module loading fails completely
- Application won't start
- Error messages are cryptic: "Cannot resolve module" or "Undefined identifier"

**Evidence from Pike stdlib:**
> "Circular dependencies do not work (currently, at least)" — Pike 8.0.164 release notes

The Pike stdlib avoids this through strict layering:
- Low-level modules (Parser, ADT) have no dependencies on each other
- Mid-level modules (Tools) depend only on low-level modules
- High-level application code depends on mid-level modules

**Prevention:**
1. **Draw dependency graph before coding** — Map all module imports visually
2. **Enforce one-way dependencies** — Modules can only depend on modules "below" them
3. **Create a shared utilities module** — All common code goes in `LSP.pmod/module.pmod` at the bottom of the hierarchy
4. **Use dependency injection** — Pass dependencies as function parameters instead of importing them
5. **Test incrementally** — After extracting each module, verify it loads independently

**Detection (warning signs):**
- Module A has `#include "module.pike"` and Module B has `#include "moduleA.pike"`
- `resolv()` calls fail with "Cannot resolve" errors
- Adding a new import breaks previously working code
- Modules need to be loaded in specific order

**Phase mapping:**
- **Phase 1 (Foundation)**: Create `LSP.pmod/module.pmod` with all shared utilities
- **Phase 2 (Parser)**: Extract Parser.pike, verify it only depends on module.pmod
- **Phase 3 (Intelligence)**: Extract Intelligence.pike, verify no circular dependency with Parser
- **Phase 4 (Analysis)**: Extract Analysis.pike, verify acyclic dependency graph

---

### Pitfall 2: Shared State Corruption

**What goes wrong:** Multiple modules access shared state (caches, global variables) without synchronization, causing race conditions, stale data, or crashes.

**Why it happens:** The monolithic analyzer.pike has shared caches:
```pike
mapping(string:program) program_cache = ([]);
mapping(string:mapping) stdlib_cache = ([]);
```

When modules are extracted, if each module creates its own cache instance, they become inconsistent. If they share a single cache without proper access patterns, they corrupt each other's data.

**Consequences:**
- Cache misses when data should be present
- Stale compilation results returned
- Memory leaks from orphaned cache entries
- Inconsistent behavior between handlers

**Evidence from analyzer.pike:**
The current implementation has:
- `program_cache` for compiled programs
- `stdlib_cache` for resolved stdlib modules
- `cache_access_time` for LRU tracking
- `evict_lru_programs()` and `evict_lru_stdlib()` for cache management

If Cache.pmod is extracted but handlers bypass it to access caches directly, the LRU logic breaks.

**Prevention:**
1. **Create a dedicated Cache.pmod** — All cache access goes through this module only
2. **Never expose cache mappings directly** — Provide get/put/clear functions only
3. **Use `protected` modifier** — Hide internal cache data from external modules
4. **Cache key prefixing** — Each module uses its own key prefix to avoid collisions
5. **Single cache instance** — Cache.pmod is instantiated once and passed to handlers

**Detection (warning signs):**
- Multiple modules define `mapping(string:program) cache = ([]);`
- Direct assignment to `module->cache[key]` outside Cache.pmod
- Cache size grows unbounded (eviction not working)
- Different handlers return different results for same input

**Phase mapping:**
- **Phase 1 (Foundation)**: Extract Cache.pmod with get/put/clear interface
- **Phase 2 (Parser)**: Migrate Parser to use Cache.pmod interface
- **Phase 3 (Intelligence)**: Migrate Intelligence to use Cache.pmod interface
- **Phase 4 (Analysis)**: Migrate Analysis to use Cache.pmod interface
- **Phase 5 (Verification)**: Audit all modules for direct cache access

---

### Pitfall 3: Function/Constant Not Found in Older Pike Versions

**What goes wrong:** Code uses functions or constants that exist in Pike 8.0 but not in 7.6 or 7.8, causing compilation failures or runtime errors.

**Why it happens:** Development happens on Pike 8.0 (which has `String.trim_whites()`), but deployment may target Pike 7.6 or 7.8 (which don't have it).

**Consequences:**
- Code won't compile on older Pike versions
- Runtime "Undefined function" errors
- VSCode extension fails to start for users with older Pike

**Evidence from project:**
The current analyzer.pike uses `String.trim_whites()` which was discovered to be available in Pike 8.0 but its availability in earlier versions is uncertain. Prior code had to use custom `trim_string()` functions.

**Prevention:**
1. **Create Compat.pmod** — Centralized version compatibility layer
2. **Use `#if constant()` for feature detection** — Check at compile time
3. **Provide polyfills** — Implement missing functions in Compat.pmod
4. **Version-specific code paths** — Use `#pike __REAL_VERSION__` when needed
5. **Test on all target versions** — CI must test 7.6, 7.8, 8.0.x

**Example from Compat.pmod:**
```pike
// Compat.pmod provides unified string trimming
#if constant(String.trim_whites)
string trim(string s) { return String.trim_whites(s); }
#else
string trim(string s) {
  // Polyfill implementation
  return (s = "" + s) && s[0..] && s[-1..] && s; // Simplified
}
#endif
```

**Detection (warning signs):**
- Direct use of stdlib functions without `#if constant()` check
- No version-specific test failures in CI
- Manual "works on my machine" testing only

**Phase mapping:**
- **Phase 1 (Foundation)**: Create Compat.pmod with version detection infrastructure
- **Phase 1 (Foundation)**: Add polyfills for String.trim_whites and other used functions
- **All phases**: Replace direct stdlib calls with Compat.pmod equivalents
- **Phase 5 (Verification)**: Test on Pike 7.6, 7.8, and 8.0.x

---

### Pitfall 4: Breaking JSON-RPC Protocol During Refactoring

**What goes wrong:** Module boundaries change the structure or format of JSON-RPC responses, breaking the VSCode extension that depends on the exact protocol.

**Why it happens:** When extracting handlers into modules, the response format may accidentally change (e.g., missing fields, different nesting, changed error format).

**Consequences:**
- VSCode extension shows "Request failed" errors
- Symbol information doesn't appear in editor
- Autocomplete suggestions don't work
- Requires simultaneous update of TypeScript bridge

**Evidence from protocol:**
The current protocol expects specific response structures:
```pike
return ([
  "result": ([
    "success": 1,
    "symbols": symbols_array,
    "functions": functions_array,
    "variables": variables_array
  ])
]);
```

If a module returns a different structure, the TypeScript bridge fails to parse it.

**Prevention:**
1. **Keep protocol interface in analyzer.pike** — Main file handles JSON-RPC, modules don't
2. **Define internal data structures** — Modules return Pike mappings, not JSON
3. **Serialize only at boundary** — analyzer.pike converts to JSON at the end
4. **Version the protocol** — Add protocol version field to catch mismatches
5. **Contract tests** — Tests verify exact JSON structure matches expected

**Detection (warning signs):**
- Modules call `Standards.JSON.encode()` directly
- Modules return strings instead of mappings
- Response structure changes in handler functions
- TypeScript type definitions don't match Pike responses

**Phase mapping:**
- **Phase 1 (Foundation)**: Define internal data structures (not JSON structures)
- **Phase 2-4 (Module extraction)**: Keep modules returning Pike mappings only
- **Phase 5 (Verification)**: Run contract tests against TypeScript bridge

---

### Pitfall 5: Module Loading Failures on Different Platforms

**What goes wrong:** Modules that load successfully on Linux fail to load on Windows or macOS due to path handling, case sensitivity, or module system differences.

**Why it happens:** Pike's module loading uses system-specific path resolution. Hard-coded paths, wrong case in filenames, or platform-specific assumptions cause failures.

**Consequences:**
- LSP server won't start on Windows
- "Cannot find module" errors on macOS
- Extension only works on Linux

**Evidence from Pike documentation:**
> "The __FILE__ constant is not reliable on Windows for module path resolution"

The stdlib uses `master()->resolv()` and `combine_path()` for cross-platform module resolution.

**Prevention:**
1. **Use `master()->resolv()`** — Let Pike's module system handle paths
2. **Use `combine_path()`** — Join paths in platform-independent way
3. **Avoid __FILE__ for module paths** — Not reliable on Windows
4. **Lowercase filenames** — Avoid case sensitivity issues
5. **Test on all platforms** — CI must run on Windows, macOS, and Linux

**Detection (warning signs):**
- Direct path strings like `"/home/user/module.pike"`
- Use of `__FILE__` for module resolution
- Mixed case in module filenames
- Platform-specific path separators (`/` vs `\`)

**Phase mapping:**
- **All phases**: Use `master()->resolv()` for all module loading
- **Phase 5 (Verification)**: Test on Windows, macOS, and Linux

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt.

### Pitfall 6: Inconsistent Error Handling

**What goes wrong:** Some modules use `catch` and return error mappings, others let exceptions propagate, making error recovery inconsistent.

**Prevention:**
- Define standard error response structure in module.pmod
- All handlers return errors in same format
- Use catch consistently around external calls

**Phase mapping:** Phase 1 (Foundation) — define error structure

---

### Pitfall 7: Debug Logging Loss

**What goes wrong:** After refactoring, debug logging is scattered or lost, making debugging harder.

**Prevention:**
- Create `LSP.pmod/Log.pmod` for centralized logging
- Preserve existing debug_mode flag and log levels
- Add module context to log messages

**Phase mapping:** Phase 1 (Foundation) — create Log.pmod

---

### Pitfall 8: Test Isolation Failures

**What goes wrong:** Tests for one module fail because another module's state isn't reset between tests.

**Prevention:**
- Each test creates fresh module instances
- Cache.pmod provides reset() function for tests
- Use test fixtures that set up clean state

**Phase mapping:** Phase 5 (Verification) — add cache reset functions

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 9: Naming Collisions

**What goes wrong:** Function or variable names collide when modules are combined.

**Prevention:**
- Use module prefix for internal functions (e.g., `parser_parse()`)
- Use `protected` for internal functions
- Use namespaces through module structure

---

### Pitfall 10: Documentation Drift

**What goes wrong:** Comments reference old function locations or outdated structures.

**Prevention:**
- Update comments during refactoring, not after
- Use AutoDoc comments that can be extracted
- Run documentation generation to catch broken references

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| **Phase 1: Foundation** | Creating circular dependencies between module.pmod and Compat.pmod | Make Compat.pmod dependency-free, module.pmod depends only on Compat |
| **Phase 1: Foundation** | Cache interface too restrictive, requiring rework | Design Cache.pmod interface with all current use cases in mind |
| **Phase 2: Parser** | Breaking Parser.Pike integration | Test with real Pike code after extraction, not just unit tests |
| **Phase 3: Intelligence** | Stdlib resolution breaks due to module path changes | Use master()->resolv() consistently, test with actual stdlib modules |
| **Phase 4: Analysis** | Token analysis breaks due to shared state changes | Verify all handlers use Cache.pmod, not direct cache access |
| **Phase 5: Verification** | Only testing on latest Pike version | Must test on 7.6, 7.8, and 8.0.x minimum |
| **Phase 5: Verification** | Only testing on one OS | Must test on Windows, macOS, and Linux |

---

## Stdlib Anti-Patterns Analysis

The Pike stdlib provides examples of both good and bad patterns:

### Good Patterns to Follow

1. **Strict layering** — No circular dependencies
2. **Protected functions** — Internal implementation hidden
3. **module.pmod files** — Shared constants and utilities
4. **Feature detection** — `#if constant()` for compatibility
5. **Lazy loading** — Modules loaded only when needed

### Anti-Patterns to Avoid

1. **Tight coupling between Parser modules** — Parser.XML and Parser.HTML have similar but duplicated code due to lack of shared base
2. **ADT.Struct conditional compilation complexity** — Heavy use of `#if` checks makes code hard to read; better to have version-specific modules
3. **Tools.AutoDoc monolithic parsing** — DocParser and PikeParser are tightly coupled; extracting one is difficult

### Lessons from Stdlib Evolution

The Pike 8.0 release notes show:
- Circular dependencies still don't work — architecture must prevent them
- String module additions (trim_whites) show backward compatibility concerns
- Module system is stable but rigid — design module structure carefully first

---

## Sources

### HIGH Confidence

- **Pike 8.0.164 Release Notes** — States "Circular dependencies do not work (currently, at least)"
- **analyzer.pike** — Current monolithic implementation, 3,221 lines
- **Pike Module Documentation** — https://pike.lysator.liu.se/docs/man/chapter_30.html
- **Pike stdlib source** — `/home/smuks/Antigravity/PikeLSP/Pike-v8.0.1116/lib/modules/`

### MEDIUM Confidence

- **Parser.Pike tokenizer** — Available in Pike 8.0 stdlib
- **String.trim_whites()** — Available in Pike 8.0, uncertain in earlier versions
- **master()->resolv()** — Official module resolution mechanism

### LOW Confidence

- Exact feature differences between Pike 7.6, 7.8, and 8.0 — Need phase-specific testing
- Best practices for Pike module testing — No official testing framework documentation found
- Performance characteristics of module loading — Needs measurement during Phase 5

### Validation Needed

- [ ] Verify String.trim_whites availability in Pike 7.6 and 7.8
- [ ] Test circular dependency handling in actual Pike versions
- [ ] Measure performance impact of module boundaries
- [ ] Confirm Windows module loading behavior with .pmod structure
