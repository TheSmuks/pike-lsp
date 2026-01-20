# Roadmap: Pike LSP Analyzer Refactoring

## Overview

Transform the monolithic 3,221-line `analyzer.pike` into a modular Pike codebase following stdlib conventions. The journey begins by establishing shared infrastructure (module.pmod, Compat.pmod, Cache.pmod), then extracts handler modules bottom-up to avoid circular dependencies, and concludes with comprehensive cross-version verification.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Establish shared infrastructure and version compatibility layer
- [x] **Phase 2: Parser Module** - Extract parsing, tokenization, and compilation handlers
- [x] **Phase 3: Intelligence Module** - Extract introspection and resolution handlers
- [x] **Phase 4: Analysis & Entry Point** - Extract analysis handlers and refactor main entry point
- [x] **Phase 5: Verification** - Cross-version testing and compatibility validation

## Phase Details

### Phase 1: Foundation

**Goal**: Establish LSP.pmod directory structure with shared utilities, version compatibility layer, and cache infrastructure that all subsequent modules depend on.

**Depends on**: Nothing (first phase)

**Completed**: 2026-01-19

**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, FND-09, FND-10, FND-11, FND-12, FND-13, VER-04, VER-05, QLT-04, QLT-05

**Success Criteria** (what must be TRUE):
1. LSP.pmod directory exists with module.pmod, Compat.pmod, and Cache.pmod files loadable by Pike interpreter
2. Compat.pmod detects Pike version and provides trim_whites() polyfill that works on 7.6, 7.8, and 8.0.x
3. Cache.pmod provides get/put/clear interface for program_cache and stdlib_cache with LRU eviction
4. Debug logging can be enabled/disabled at runtime through module.pmod utilities
5. Unit tests pass for Compat.pmod feature detection and Cache.pmod LRU operations

**Plans**: 6 plans (6 autonomous)

Plans:
- [x] 01-01-PLAN.md — Create LSP.pmod directory and module.pmod with shared utilities
- [x] 01-02-PLAN.md — Create Compat.pmod with version detection and polyfills
- [x] 01-03-PLAN.md — Create Cache.pmod with LRU caching infrastructure
- [x] 01-04-PLAN.md — Write unit tests for Compat.pmod and Cache.pmod
- [x] 01-05-PLAN.md — Write E2E test infrastructure and module.pmod tests (Wave 3)
- [x] 01-06-PLAN.md — Write E2E tests for Compat.pmod and Cache.pmod (Wave 3)

### Phase 2: Parser Module

**Goal**: Extract parsing, tokenization, compilation, and batch_parse handlers into Parser.pike class using shared infrastructure.

**Depends on**: Phase 1 (module.pmod, Compat.pmod, Cache.pmod must exist)

**Completed**: 2026-01-19

**Requirements**: PRS-01, PRS-02, PRS-03, PRS-04, PRS-05, PRS-06, PRS-07, PRS-08, PRS-09, PRS-10, PRS-11, QLT-01

**Success Criteria** (what must be TRUE):
1. Parser.pike class exists with parse_request, tokenize_request, compile_request, and batch_parse_request methods
2. Parser.pike uses LSP.Compat.trim_whites() for string operations
3. Parser.pike uses LSP.MAX_* constants from module.pmod
4. Handler errors return JSON-RPC error responses instead of crashing the server
5. Integration tests pass for parse, tokenize, and compile handlers
6. analyzer.pike delegates to Parser.pike for all parsing operations

**Plans**: 3 plans (3 autonomous, 3 waves)

Plans:
- [x] 02-01-PLAN.md — Create Parser.pike with parse_request and protected helpers (Wave 1)
- [x] 02-02-PLAN.md — Add tokenize, compile, and batch_parse methods (Wave 2)
- [x] 02-03-PLAN.md — Write Parser unit and integration tests (Wave 3)

### Phase 3: Intelligence Module

**Goal**: Extract introspection, resolution, and stdlib query handlers into Intelligence.pike class.

**Depends on**: Phase 1 (module.pmod, Cache.pmod, Compat.pmod)

**Completed**: 2026-01-19

**Requirements**: INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-07, INT-08, INT-09, INT-10, INT-11

**Success Criteria** (what must be TRUE):
1. Intelligence.pike class exists with handle_introspect, handle_resolve, handle_resolve_stdlib, and handle_get_inherited methods
2. Intelligence.pike uses Tools.AutoDoc for documentation parsing and Cache.pmod for stdlib data caching
3. Intelligence handlers use Compat.trim_whites() for string operations
4. Handler errors return JSON-RPC error responses instead of crashing the server
5. Integration tests pass for introspect and resolve handlers

**Plans**: 4 plans (3 autonomous, 1 checkpoint, 4 waves)

Plans:
- [x] 03-01-PLAN.md — Create Intelligence.pike with handle_introspect and handle_resolve (Wave 1)
- [x] 03-02-PLAN.md — Add handle_resolve_stdlib with stdlib caching and documentation parsing (Wave 2)
- [x] 03-03-PLAN.md — Add handle_get_inherited for inheritance traversal (Wave 3)
- [x] 03-04-PLAN.md — Write integration tests and update analyzer.pike delegation (Wave 4)

### Phase 4: Analysis & Entry Point

**Goal**: Extract analysis handlers (occurrences, uninitialized, completion) into Analysis.pike and refactor analyzer.pike as JSON-RPC routing entry point.

**Depends on**: Phase 1 (module.pmod, Cache.pmod, Compat.pmod), Phase 2 (Parser.pike for tokenization)

**Completed**: 2026-01-19

**Requirements**: ANL-01, ANL-02, ANL-03, ANL-04, ANL-05, ANL-06, ANL-07, ANL-08, ANL-09, ANL-10, ENT-01, ENT-02, ENT-03, ENT-04, ENT-05, ENT-06, QLT-02, QLT-03

**Success Criteria** (what must be TRUE):
1. Analysis.pike class exists with handle_find_occurrences, handle_analyze_uninitialized, and handle_get_completion_context methods
2. Analysis.pike uses Parser.Pike for tokenization and Cache.pmod for compiled program caching
3. analyzer.pike routes JSON-RPC requests to Parser.pike, Intelligence.pike, and Analysis.pike instances
4. Old handler functions removed from analyzer.pike after extraction
5. VSCode extension communicates successfully without modification (JSON-RPC responses unchanged)
6. Integration tests pass for occurrences, completion context, and full request/response cycle
7. All modules load independently without circular dependencies

**Plans**: 6 plans (6 autonomous, 3 waves)

Plans:
- [x] 04-01-PLAN.md — Create Analysis.pike with handle_find_occurrences (Wave 1)
- [x] 04-02-PLAN.md — Add handle_get_completion_context to Analysis.pike (Wave 2)
- [x] 04-03-PLAN.md — Add handle_analyze_uninitialized with scope analysis (Wave 2)
- [x] 04-04-PLAN.md — Create dispatch table router with Context class (Wave 3)
- [x] 04-05-PLAN.md — Remove old handler functions from analyzer.pike (Wave 3)
- [x] 04-06-PLAN.md — Write integration tests and response format verification (Wave 3)

### Phase 5: Verification

**Goal**: Validate the refactored codebase runs correctly on target Pike versions with comprehensive cross-version testing and CI automation.

**Depends on**: Phase 4 (all modules extracted and entry point refactored)

**Completed**: 2026-01-20

**Requirements**: VER-01, VER-02, VER-03, VER-06, QLT-06

**Note on Version Support:**
Original ROADMAP mentioned Pike 7.6, 7.8, and 8.0.x. CONTEXT.md updated this to Pike 8.1116 (required) and latest stable (best-effort) based on practical availability on Ubuntu 24.04 CI. Older Pike versions (7.6/7.8) are not available in modern Linux distributions.

**Success Criteria** (what must be TRUE):
1. All handlers execute successfully on Pike 8.1116 (current stable target)
2. Latest Pike version tested with continue-on-error (best-effort forward compatibility)
3. Compat.pmod provides unified API across versions
4. Version detection logged at startup for debugging
5. Cross-version tests verify all 12 LSP methods on target versions
6. Module loading tested and verified via CI

**Plans**: 5 plans (5 autonomous, 3 waves)

Plans:
- [x] 05-01-PLAN.md — Create module loading smoke tests (Wave 1)
- [x] 05-02-PLAN.md — Extend CI with Pike version matrix and test runner (Wave 1)
- [x] 05-03-PLAN.md — Add compatibility documentation to README and CONTRIBUTING (Wave 2)
- [x] 05-04-PLAN.md — Create cross-version handler tests (Wave 2)
- [x] 05-05-PLAN.md — Run complete test suite and create verification report (Wave 3)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 6/6 | Complete | 2026-01-19 |
| 2. Parser Module | 3/3 | Complete | 2026-01-19 |
| 3. Intelligence Module | 4/4 | Complete | 2026-01-19 |
| 4. Analysis & Entry Point | 6/6 | Complete | 2026-01-19 |
| 5. Verification | 5/5 | Complete | 2026-01-20 |

**Project Status:** ALL PHASES COMPLETE

**Summary:**
- Total plans: 30 (26 refactoring + 4 phase planning)
- All 52 v1 requirements satisfied
- 111 tests passing on Pike 8.0.1116
- CI configured for cross-version validation (8.1116 required, latest best-effort)
- Ready for production deployment
