# Project Research Summary

**Project:** Pike LSP Analyzer Refactoring
**Domain:** Pike programming language module refactoring
**Researched:** 2025-01-19
**Confidence:** HIGH

## Executive Summary

This is a **code refactoring project** — transforming a monolithic 3,221-line `analyzer.pike` file into a modular `LSP.pmod/` structure following Pike stdlib conventions. Expert Pike module development uses `.pmod` directories with optional `module.pmod` files for shared utilities, `.pike` files for concrete classes, and strict layering to avoid circular dependencies.

The recommended approach follows Pike's established module patterns: create `LSP.pmod/module.pmod` for shared constants and helpers, extract handler classes into individual `.pike` files (Parser.pike, Intelligence.pike, Analysis.pike), and encapsulate shared state in a dedicated `Cache.pmod` submodule. Version compatibility is handled through a `Compat.pmod` module using `#if constant()` feature detection and polyfills for functions like `String.trim_whites()`.

**Key risks** are circular module dependencies (Pike cannot resolve them), shared state corruption during extraction, and version compatibility issues (code runs on 8.0 but may fail on 7.6/7.8). Mitigation includes strict one-way dependency graphs, centralized cache access through Cache.pmod only, and comprehensive feature detection before using stdlib functions.

## Key Findings

### Recommended Stack

Pike's module system uses `.pmod` directories as namespaces and `.pike` files for concrete implementations. The refactoring targets Pike 7.6, 7.8, and 8.0.x compatibility.

**Core technologies:**
- **`.pmod` directories** — Module namespaces with optional `module.pmod` for shared exports
- **`#pike __REAL_VERSION__`** — Matches module to running interpreter version
- **`#if constant()`** — Compile-time feature detection for version compatibility
- **Pike stdlib patterns** — Parser.pmod, Tools.pmod/AutoDoc.pmod as reference implementations
- **LRU cache pattern** — Used for program_cache and stdlib_cache management

### Expected Features

This is a refactoring project, so features are about correct module decomposition rather than user-facing capabilities.

**Must have (table stakes):**
- **Module extraction** — Split 3,221-line analyzer.pike into logical modules
- **Shared utilities module** — module.pmod with constants, error classes, helpers
- **Cache encapsulation** — Cache.pmod for LRU cache management
- **Version compatibility layer** — Compat.pmod with feature detection and polyfills
- **Preserved JSON-RPC protocol** — Maintain exact response structure for VSCode extension

**Should have (competitive):**
- **Unified Compat API** — Single import for all version-specific code
- **Runtime feature cache** — Detect features once, reuse results
- **Centralized logging** — Log.pmod for consistent debug output

**Defer (v2+):**
- **Version-specific optimizations** — Use newer APIs when available
- **Comprehensive polyfills** — Cover all stdlib differences beyond current needs
- **Performance benchmarking** — Measure module boundary overhead

### Architecture Approach

The recommended architecture uses Pike's handler pattern: stateless modules with shared state isolated in Cache.pmod. Handlers communicate through the main entry point (analyzer.pike) which routes JSON-RPC methods to appropriate handlers.

**Major components:**
1. **LSP.module** — Shared utilities, constants, error handling, JSON helpers (all modules inherit from this)
2. **LSP.Parser** — Source parsing, tokenization, compilation diagnostics (uses Cache)
3. **LSP.Intelligence** — Type introspection, module resolution, stdlib queries (uses Cache)
4. **LSP.Analysis** — Find occurrences, uninitialized detection, completion context (uses Parser and Cache)
5. **LSP.Cache** — LRU cache management, access time tracking (singleton state)
6. **LSP.Compat** — Version detection, feature polyfills (dependency-free)

### Critical Pitfalls

1. **Circular Module Dependencies** — Pike cannot resolve circular imports. Prevention: draw dependency graph first, enforce one-way dependencies, put all shared code in module.pmod, test each module loads independently.

2. **Shared State Corruption** — Multiple modules accessing caches without synchronization causes inconsistency. Prevention: dedicated Cache.pmod with get/put/clear interface only, never expose mappings directly, use protected modifier.

3. **Version Compatibility Failures** — Code using 8.0 features fails on 7.6/7.8. Prevention: Compat.pmod with `#if constant()` detection, polyfills for `String.trim_whites()` and other uncertain functions, test on all target versions.

4. **Breaking JSON-RPC Protocol** — Module boundaries changing response structure breaks VSCode extension. Prevention: keep protocol handling in analyzer.pike, modules return Pike mappings not JSON, contract tests for exact structure.

5. **Module Loading Failures on Platforms** — Path handling differences cause failures on Windows/macOS. Prevention: use `master()->resolv()` for module resolution, `combine_path()` for paths, avoid `__FILE__`, test cross-platform.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation
**Rationale:** Must establish shared infrastructure first to prevent circular dependencies later. module.pmod and Compat.pmod must exist before extracting any handler modules.
**Delivers:** LSP.pmod directory structure, module.pmod with shared utilities, Compat.pmod with feature detection, Cache.pmod with LRU interface
**Addresses:** Shared utilities extraction, version compatibility infrastructure
**Avoids:** Circular dependencies (Compat is dependency-free), shared state corruption (Cache interface defined upfront)

### Phase 2: Parser Module
**Rationale:** Parser is the most independent module — has no dependencies on other handlers, only on module.pmod and Cache. Extracting it first validates the architecture pattern.
**Delivers:** Parser.pike with parse/tokenize/compile handlers, migrated to use Cache.pmod interface
**Uses:** Parser.Pike from stdlib, Cache.pmod for compiled programs
**Implements:** Architecture's Parser component

### Phase 3: Intelligence Module
**Rationale:** Intelligence (type introspection, stdlib resolution) depends on Parser but not on Analysis. Extracting after Parser validates dependency chain.
**Delivers:** Intelligence.pike with introspect/resolve/stdlib handlers, stdlib cache integration
**Uses:** Tools.AutoDoc for introspection, Cache.pmod for stdlib data
**Implements:** Architecture's Intelligence component

### Phase 4: Analysis Module
**Rationale:** Analysis (occurrences, completion, uninitialized detection) may depend on both Parser and Intelligence. Extracting last ensures lower layers are stable.
**Delivers:** Analysis.pike with occurrence/completion/uninitialized handlers
**Uses:** Parser for tokenization, Cache for compiled programs
**Implements:** Architecture's Analysis component

### Phase 5: Verification
**Rationale:** After all modules extracted, need comprehensive testing across versions and platforms to catch any remaining issues.
**Delivers:** Test suite, cross-platform verification, version compatibility validation, performance baseline
**Addresses:** All remaining pitfalls, platform-specific issues
**Avoids:** Shipping broken code to users

### Phase Ordering Rationale

- **Foundation first** — Establishes shared state (Cache) and compatibility layer (Compat) before any handlers need them
- **Bottom-up extraction** — Parser (no handler deps) → Intelligence (depends on Parser) → Analysis (may depend on both) mirrors dependency graph
- **Verification last** — Only after all modules extracted can we test integration and cross-version behavior
- **Avoids circular dependencies** — By creating shared utilities first and enforcing one-way dependencies

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Intelligence):** Stdlib resolution across Pike versions has sparse documentation, may need trial-and-error testing during implementation
- **Phase 5 (Verification):** Cross-platform testing requirements (especially Windows) need detailed planning, CI infrastructure research

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Pike stdlib provides clear examples of module.pmod patterns, well-documented
- **Phase 2 (Parser):** Parser.Pike usage is well-established in Pike ecosystem, stdlib examples abundant
- **Phase 4 (Analysis):** Token analysis and completion are standard LSP patterns, no Pike-specific complexities expected

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct analysis of Pike 8.0.1116 stdlib source code, official documentation |
| Features | HIGH | analyzer.pike source analyzed, Pike version patterns documented |
| Architecture | HIGH | Based on Pike manual Chapter 30 (Writing Modules) and stdlib patterns |
| Pitfalls | HIGH | Circular dependencies explicitly documented in Pike release notes |

**Overall confidence:** HIGH

### Gaps to Address

- **String.trim_whites() in Pike 7.6/7.8:** Uncertain when this function was introduced. Mitigation: include polyfill in Compat.pmod regardless.
- **Parser.Pike.split() availability in older versions:** Needs verification. Mitigation: feature detection with fallback.
- **Windows module loading behavior:** No direct testing done. Mitigation: use documented cross-platform patterns (`master()->resolv()`, `combine_path()`).
- **Performance impact of module boundaries:** Not measured. Mitigation: establish baseline in Phase 5, optimize if needed.

## Sources

### Primary (HIGH confidence)

- **Pike v8.0.1116 stdlib source** — Direct analysis of Tools.pmod/AutoDoc.pmod, Parser.pmod, ADT.pmod module patterns
- **[Pike Manual - Chapter 30: Writing Pike Modules](https://pike.lysator.liu.se/docs/man/chapter_30.html)** — Official .pmod structure documentation
- **[Pike Manual - Chapter 29: Backward Compatibility](https://pike.lysator.liu.se/docs/man/chapter_29.html)** — Version compatibility mechanisms
- **[Pike Manual - Chapter 6: Preprocessor](https://pike.lysator.liu.se/docs/man/chapter_6.html)** — `#if constant()`, `#pike` directive documentation
- **analyzer.pike source** — `/home/smuks/OpenCode/pike-lsp/pike-scripts/analyzer.pike` (3,221 lines analyzed)

### Secondary (MEDIUM confidence)

- **[Pike 7.8 Release Notes](https://pike.lysator.liu.se/download/notes/7.8.xml)** — Changes between 7.6 and 7.8
- **[Pike 8.0 Release Notes](https://pike.lysator.lyu.se/download/notes/8.0.1738.xml)** — Changes between 7.8 and 8.0
- **[String.trim_whites Reference](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/String/trim_whites.html)** — Confirms 8.0+ availability

### Tertiary (LOW confidence)

- Exact introduction version of String.trim_whites() — Needs verification against 7.6/7.8 interpreters
- Parser.Pike.split() availability in Pike 7.6 — Needs runtime testing
- Best practices for Pike unit testing — No official testing framework documentation found

---
*Research completed: 2025-01-19*
*Ready for roadmap: yes*
