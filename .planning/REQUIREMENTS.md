# Requirements: Pike LSP Analyzer Refactoring

**Defined:** 2025-01-19
**Core Value:** Modularity without breaking functionality

## v1 Requirements

Requirements for the refactoring milestone. Each maps to roadmap phases.

### Foundation

- [x] **FND-01**: Create LSP.pmod/ directory structure following Pike stdlib conventions
- [x] **FND-02**: Create module.pmod with shared constants (MAX_TOP_LEVEL_ITERATIONS, MAX_BLOCK_ITERATIONS)
- [x] **FND-03**: Create module.pmod with shared error classes (LSPError base class)
- [x] **FND-04**: Create module.pmod with JSON helper functions
- [x] **FND-05**: Create Compat.pmod with version detection (pike_version() function)
- [x] **FND-06**: Create Compat.pmod with `#if constant()` feature detection
- [x] **FND-07**: Create Compat.pmod with String.trim_whites() polyfill for Pike 7.6/7.8
- [x] **FND-08**: Create Cache.pmod with get/put/clear interface for program_cache
- [x] **FND-09**: Create Cache.pmod with get/put/clear interface for stdlib_cache
- [x] **FND-10**: Create Cache.pmod with LRU eviction logic (max_cached_programs, max_stdlib_modules)
- [x] **FND-11**: Create debug logging infrastructure in module.pmod
- [x] **FND-12**: Unit tests for Compat.pmod feature detection
- [x] **FND-13**: Unit tests for Cache.pmod LRU operations

### Parser Module

- [x] **PRS-01**: Extract handle_parse function to Parser.pike class
- [x] **PRS-02**: Extract handle_tokenize function to Parser.pike class
- [x] **PRS-03**: Extract handle_compile function to Parser.pike class
- [x] **PRS-04**: Extract handle_batch_parse function to Parser.pike class
- [x] **PRS-05**: Parser.pike uses Cache.pmod for compiled program caching
- [x] **PRS-06**: Parser.pike imports from module.pmod (shared utilities)
- [x] **PRS-07**: Parser.pike uses Compat.trim_whites() for string operations
- [x] **PRS-08**: Parser.pike wraps handlers in catch blocks returning JSON-RPC errors
- [x] **PRS-09**: Integration tests for parse handler
- [x] **PRS-10**: Integration tests for tokenize handler
- [x] **PRS-11**: Integration tests for compile handler

### Intelligence Module

- [x] **INT-01**: Extract handle_introspect function to Intelligence.pike class
- [x] **INT-02**: Extract handle_resolve function to Intelligence.pike class
- [x] **INT-03**: Extract handle_resolve_stdlib function to Intelligence.pike class
- [x] **INT-04**: Extract handle_get_inherited function to Intelligence.pike class
- [x] **INT-05**: Intelligence.pike uses Tools.AutoDoc for documentation parsing
- [x] **INT-06**: Intelligence.pike uses Cache.pmod for stdlib data caching
- [x] **INT-07**: Intelligence.pike imports from module.pmod (shared utilities)
- [x] **INT-08**: Intelligence.pike uses Compat.trim_whites() for string operations
- [x] **INT-09**: Intelligence.pike wraps handlers in catch blocks returning JSON-RPC errors
- [x] **INT-10**: Integration tests for introspect handler
- [x] **INT-11**: Integration tests for resolve handlers

### Analysis Module

- [x] **ANL-01**: Extract handle_find_occurrences function to Analysis.pike class
- [x] **ANL-02**: Extract handle_analyze_uninitialized function to Analysis.pike class
- [x] **ANL-03**: Extract handle_get_completion_context function to Analysis.pike class
- [x] **ANL-04**: Analysis.pike uses Parser.Pike for tokenization
- [x] **ANL-05**: Analysis.pike uses Cache.pmod for compiled program caching
- [x] **ANL-06**: Analysis.pike imports from module.pmod (shared utilities)
- [x] **ANL-07**: Analysis.pike uses Compat.trim_whites() for string operations
- [x] **ANL-08**: Analysis.pike wraps handlers in catch blocks returning JSON-RPC errors
- [x] **ANL-09**: Integration tests for occurrences handler
- [x] **ANL-10**: Integration tests for completion context handler

### Entry Point

- [x] **ENT-01**: Refactor analyzer.pike to route JSON-RPC to handler classes
- [x] **ENT-02**: analyzer.pike imports Parser.pike, Intelligence.pike, Analysis.pike
- [x] **ENT-03**: analyzer.pike creates handler instances on startup
- [x] **ENT-04**: analyzer.pike maintains backward compatibility with bridge protocol
- [x] **ENT-05**: Remove old handler functions from analyzer.pike after extraction
- [x] **ENT-06**: Integration tests for full JSON-RPC request/response cycle

### Version Compatibility

- [x] **VER-01**: Code runs on Pike 8.1116 (verified locally, with Compat polyfills)
- [ ] **VER-02**: Code runs on Pike 8.x latest (PENDING - will verify in CI)
- [x] **VER-03**: Code runs on Pike 8.0.x (native implementations preferred)
- [x] **VER-04**: Compat.pmod provides unified API regardless of Pike version
- [x] **VER-05**: Version detection logged at startup for debugging
- [x] **VER-06**: Cross-version tests verify all handlers on each target version

### Quality Assurance

- [x] **QLT-01**: Handler errors return JSON-RPC error responses, don't crash server
- [x] **QLT-02**: All modules load independently (no circular dependencies)
- [x] **QLT-03**: JSON-RPC response structure unchanged (VSCode extension compatibility)
- [x] **QLT-04**: Cache.pmod encapsulates all shared state (no direct mapping access)
- [x] **QLT-05**: Debug logging can be enabled/disabled at runtime
- [x] **QLT-06**: Module loading tested on Pike 8.1116 (and verified in cross-version tests)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Performance

- **PERF-01**: Benchmark module boundary overhead vs monolithic version
- **PERF-02**: Optimize hot paths if overhead exceeds 10%
- **PERF-03**: Version-specific optimizations (use newer APIs when detected)

### Testing

- **TEST-01**: Unit test coverage above 80%
- **TEST-02**: Property-based tests for Cache.pmod LRU behavior
- **TEST-03**: Fuzz testing for Parser input robustness

## Out of Scope

| Feature | Reason |
|---------|--------|
| Changing JSON-RPC protocol | Must maintain VSCode extension compatibility |
| Rewriting algorithm logic | Focus on organization, not feature changes |
| New LSP capabilities | Refactoring only, no new features |
| Pike 7.x support below 7.6 | Too old, significant compatibility burden |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 1 | Complete |
| FND-05 | Phase 1 | Complete |
| FND-06 | Phase 1 | Complete |
| FND-07 | Phase 1 | Complete |
| FND-08 | Phase 1 | Complete |
| FND-09 | Phase 1 | Complete |
| FND-10 | Phase 1 | Complete |
| FND-11 | Phase 1 | Complete |
| FND-12 | Phase 1 | Complete |
| FND-13 | Phase 1 | Complete |
| PRS-01 | Phase 2 | Complete |
| PRS-02 | Phase 2 | Complete |
| PRS-03 | Phase 2 | Complete |
| PRS-04 | Phase 2 | Complete |
| PRS-05 | Phase 2 | Complete |
| PRS-06 | Phase 2 | Complete |
| PRS-07 | Phase 2 | Complete |
| PRS-08 | Phase 2 | Complete |
| PRS-09 | Phase 2 | Complete |
| PRS-10 | Phase 2 | Complete |
| PRS-11 | Phase 2 | Complete |
| INT-01 | Phase 3 | Complete |
| INT-02 | Phase 3 | Complete |
| INT-03 | Phase 3 | Complete |
| INT-04 | Phase 3 | Complete |
| INT-05 | Phase 3 | Complete |
| INT-06 | Phase 3 | Complete |
| INT-07 | Phase 3 | Complete |
| INT-08 | Phase 3 | Complete |
| INT-09 | Phase 3 | Complete |
| INT-10 | Phase 3 | Complete |
| INT-11 | Phase 3 | Complete |
| ANL-01 | Phase 4 | Complete |
| ANL-02 | Phase 4 | Complete |
| ANL-03 | Phase 4 | Complete |
| ANL-04 | Phase 4 | Complete |
| ANL-05 | Phase 4 | Complete |
| ANL-06 | Phase 4 | Complete |
| ANL-07 | Phase 4 | Complete |
| ANL-08 | Phase 4 | Complete |
| ANL-09 | Phase 4 | Complete |
| ANL-10 | Phase 4 | Complete |
| ENT-01 | Phase 4 | Complete |
| ENT-02 | Phase 4 | Complete |
| ENT-03 | Phase 4 | Complete |
| ENT-04 | Phase 4 | Complete |
| ENT-05 | Phase 4 | Complete |
| ENT-06 | Phase 4 | Complete |
| VER-01 | Phase 5 | Complete |
| VER-02 | Phase 5 | Pending (CI) |
| VER-03 | Phase 5 | Complete |
| VER-04 | Phase 1 | Complete |
| VER-05 | Phase 1 | Complete |
| VER-06 | Phase 5 | Complete |
| QLT-01 | Phase 2 | Complete |
| QLT-02 | Phase 4 | Complete |
| QLT-03 | Phase 4 | Complete |
| QLT-04 | Phase 1 | Complete |
| QLT-05 | Phase 1 | Complete |
| QLT-06 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52
- Unmapped: 0 ✓
- Complete: 51/52 (98%)
- Pending: 1/52 (2%) - VER-02 will be verified in CI

---
*Requirements defined: 2025-01-19*
*Last updated: 2026-01-20 after Phase 5 completion*
