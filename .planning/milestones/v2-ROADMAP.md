# Milestone v2: LSP Modularization

**Status:** ✅ SHIPPED 2026-01-21
**Phases:** 1-9
**Total Plans:** 33

## Overview

Transform the Pike LSP from a working but hard-to-debug system into a modular, observable, and testable codebase. This milestone focuses on **infrastructure-first** improvements: establish observability and safety nets before major refactoring.

**Philosophy:** Safety without rigidity - solve actual pain points without over-engineering.

## Phases

### Phase 1: Lean Observability

**Goal**: See what's happening without complex cross-language infrastructure. TypeScript maintains error chains to track path; Pike returns flat, simple error dict.
**Depends on**: Nothing (first phase)
**Plans**: 3 plans

Plans:

- [x] 01-01: TypeScript error classes (LSPError, BridgeError, PikeError)
- [x] 01-02: Logger class with component namespacing and log levels
- [x] 01-03: Pike make_error() helper and Bridge stderr integration

**Details:**
- Established Error/Logger classes with layer tracking.
- Pike returns flat dicts, TS adds layer context.

### Phase 2: Safety Net

**Goal**: Catch regressions on push/PR without slowing local development.
**Depends on**: Phase 1
**Plans**: 3 plans

Plans:

- [x] 02-01: Pre-push hook with Husky v9
- [x] 02-02: Smoke test suite (bridge lifecycle, parse, introspect)
- [x] 02-03: CI pipeline extension (Pike installation, smoke tests, xvfb)

**Details:**
- Implemented pre-push hooks and CI pipeline.
- Added smoke tests for critical paths.

### Phase 3: Bridge Extraction

**Goal**: Isolate IPC mechanics from business logic.
**Depends on**: Phase 1
**Plans**: 2 plans

Plans:

- [x] 03-01: Create PikeProcess class (spawn, readline, EventEmitter)
- [x] 03-02: Refactor PikeBridge to use PikeProcess + unit tests

**Details:**
- Isolated IPC logic into `PikeProcess`.
- Refactored `PikeBridge` to use `PikeProcess` internally.

### Phase 4: Server Grouping

**Goal**: Split `server.ts` by capability, not by verb.
**Depends on**: Phase 1, Phase 3
**Plans**: 6 plans

Plans:

- [x] 04-01: Core infrastructure (types.ts, document-cache.ts, bridge-manager.ts)
- [x] 04-02: Navigation feature handlers (hover, definition, references)
- [x] 04-03: Editing feature handlers (completion, signatureHelp, rename)
- [x] 04-04: Symbols and diagnostics features
- [x] 04-05: Advanced features and server refactor
- [x] 04-06: Health check command

**Details:**
- Split `server.ts` into capability-based feature modules.
- Created `core/`, `features/`, and `services/` directories.

### Phase 5: Pike Reorganization

**Goal**: Split large Pike files using `.pmod` idiom.
**Depends on**: Phase 4
**Plans**: 6 plans

Plans:

- [x] 05-01: Create Intelligence.pmod with module.pmod and Introspection class
- [x] 05-02: Create Resolution.pike and TypeAnalysis.pike
- [x] 05-03: Create Analysis.pmod with module.pmod and Diagnostics class
- [x] 05-04: Create Completions.pike and Variables.pike
- [x] 05-05: Replace original files with delegating classes
- [x] 05-06: Update tests, E2E smoke test verification

**Details:**
- Split `analyzer.pike` into modular `.pmod` structure.
- Reduced file sizes significantly (90%+).

### Phase 6: Automated LSP Feature Verification

**Goal**: Verify LSP features return valid data end-to-end.
**Depends on**: Phase 5
**Plans**: 2 plans

Plans:

- [x] 06-01: Create LSP feature integration tests
- [x] 06-02: Add E2E feature tests to CI pipeline and pre-push hooks

**Details:**
- Added E2E feature tests for symbols, hover, definition, completion.
- Integrated into CI/pre-push.

### Phase 7: Fix Document Lifecycle Handler Duplication (Gap Closure)

**Goal**: Remove duplicate document lifecycle handlers.
**Depends on**: Phase 6
**Plans**: 1 plan

Plans:

- [x] 07-01: Fix bridge initialization timing and stdlib preloading

**Details:**
- Fixed race conditions and duplicate handlers.
- Addressed integration gap found in audit.

### Phase 8: Extract Core Utilities to Shared Package (Tech Debt)

**Goal**: Eliminate code duplication by extracting Logger/Error classes.
**Depends on**: Phase 7
**Plans**: 3 plans

Plans:

- [x] 08-01: Create shared core package with Logger and Error classes
- [x] 08-02: Migrate pike-bridge to use shared core package
- [x] 08-03: Migrate pike-lsp-server to use shared core package

**Details:**
- Created `@pike-lsp/core` package.
- Removed ~500 lines of duplicate code.

### Phase 9: Implement Pike Version Detection (Tech Debt)

**Goal**: Complete Pike version detection.
**Depends on**: Phase 7
**Plans**: 3 plans

Plans:

- [x] 09-01: Analyzer support for get_version RPC
- [x] 09-02: Bridge integration and version caching
- [x] 09-03: E2E verification and health check display

**Details:**
- Implemented robust version detection via JSON-RPC.
- Health check now shows actual Pike version.

---

## Milestone Summary

**Key Decisions:**

- **V2-D01**: TypeScript error chains, Pike flat dicts (Pike lacks stack context)
- **V2-D02**: Group handlers by capability (4 files) not by verb (11 files)
- **V2-D03**: Pre-push hooks, not pre-commit (Green main, not green commits)
- **V2-D04**: Pike uses werror(), TypeScript wraps in Logger (Unified log stream)
- **V2-D05**: 3-4 Pike files per .pmod, not 8 (Avoid micro-modules)
- **08-01-D01**: Use .js extensions in barrel exports for ESM compatibility

**Issues Resolved:**

- **GAP-01**: Duplicate document lifecycle handlers (Fixed in Phase 7)
- **INT-01**: Document cache not populated reliably (Fixed in Phase 7)
- **Tech Debt #1**: Duplicate Logger/Error classes (Fixed in Phase 8)
- **Tech Debt #2**: Pike version detection incomplete (Fixed in Phase 9)

**Issues Deferred:**

- Move helper functions to utility modules (future enhancement)
- Investigate alternative approach for safe stdlib preloading (current approach crashes)

**Technical Debt Incurred:**

- Some workflows still have hardcoded paths (addressed partly in Phase 9 with `which.pike`)

---

_For current project status, see .planning/ROADMAP.md_

---
