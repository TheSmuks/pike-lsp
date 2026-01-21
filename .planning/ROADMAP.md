# Roadmap: LSP Modularization v2

## Overview

Transform the Pike LSP from a working but hard-to-debug system into a modular, observable, and testable codebase. This milestone focuses on **infrastructure-first** improvements: establish observability and safety nets before major refactoring.

**Philosophy:** Safety without rigidity - solve actual pain points without over-engineering.

**Source:** [Design Document v2](../docs/plans/2026-01-20-lsp-modularization-design-v2.md)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5, 6): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Lean Observability** - Error tracking and structured logging
- [x] **Phase 2: Safety Net** - Pre-push hooks, smoke tests, and CI pipeline
- [x] **Phase 3: Bridge Extraction** - Isolate IPC mechanics from business logic
- [x] **Phase 4: Server Grouping** - Split server.ts by capability
- [x] **Phase 5: Pike Reorganization** - Split large Pike files using .pmod idiom
- [x] **Phase 6: Automated LSP Feature Verification** - E2E tests for symbols, hover, definition, completion
- [x] **Phase 7: Fix Document Lifecycle Handler Duplication** - Gap closure for integration bug
- [x] **Phase 8: Extract Core Utilities to Shared Package** - Code deduplication with @pike-lsp/core
- [ ] **Phase 9: Implement Pike Version Detection** - Robust version reporting via JSON-RPC

## Phase Details

### Phase 1: Lean Observability

**Goal**: See what's happening without complex cross-language infrastructure. TypeScript maintains error chains to track path; Pike returns flat, simple error dict.

**Depends on**: Nothing (first phase)

**Status**: Complete

**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04, OBS-05, OBS-06, OBS-07, OBS-08, OBS-09, OBS-10

**Success Criteria** (what must be TRUE):
1. LSPError, BridgeError, PikeError classes exist with layer tracking
2. Error.chain property returns full path: "Hover failed -> Bridge timeout -> Pike error"
3. Logger class exists with OFF, ERROR, WARN, INFO, DEBUG, TRACE levels
4. Logger.setLevel() controls global filtering
5. Pike make_error() helper returns flat dicts: `{ error: 1, kind, msg, line }`
6. Bridge captures Pike stderr and logs via TypeScript Logger

**Deliverables:**
- `packages/pike-lsp-server/src/core/errors.ts`
- `packages/pike-lsp-server/src/core/logging.ts`
- Pike `make_error()` helper function

**Plans**: 3 plans in 2 waves
- [x] 01-01-PLAN.md - TypeScript error classes (LSPError, BridgeError, PikeError)
- [x] 01-02-PLAN.md - Logger class with component namespacing and log levels
- [x] 01-03-PLAN.md - Pike make_error() helper and Bridge stderr integration

**Completed**: 2026-01-20

---

### Phase 2: Safety Net

**Goal**: Catch regressions on push/PR without slowing local development. No pre-commit hooks - allow broken intermediate commits on feature branches.

**Depends on**: Phase 1 (errors and logging must exist for meaningful test output)

**Status**: Complete

**Requirements**: SAF-01, SAF-02, SAF-03, SAF-04, SAF-05, SAF-06, SAF-07, SAF-08, SAF-09, SAF-10, SAF-11

**Success Criteria** (what must be TRUE):
1. `.husky/pre-push` hook exists and runs on git push
2. Pre-push validates: TypeScript builds, Pike compiles, smoke tests pass
3. Smoke test suite verifies bridge lifecycle (start/stop without crash)
4. Smoke tests cover: parse returns array, introspect returns data, invalid Pike returns error
5. CI pipeline runs on push to main and PRs
6. CI includes VSCode E2E tests with xvfb

**Deliverables:**
- `.husky/pre-push`
- `packages/pike-lsp-server/src/tests/smoke.test.ts`
- Extended `.github/workflows/test.yml` with Pike, smoke tests, and xvfb

**Plans**: 3 plans in 3 waves
- [x] 02-01-PLAN.md - Pre-push hook with Husky v9 (validates build, Pike, smoke tests)
- [x] 02-02-PLAN.md - Smoke test suite (bridge lifecycle, parse, introspect, error handling)
- [x] 02-03-PLAN.md - CI pipeline extension (Pike installation, smoke tests, xvfb for E2E)

**Completed**: 2026-01-20

---

### Phase 3: Bridge Extraction

**Goal**: Isolate IPC mechanics from business logic. The stdin bug would be caught here - pure IPC can be tested independently.

**Depends on**: Phase 1 (BridgeError class needed for error wrapping)

**Status**: Complete

**Requirements**: BRG-01, BRG-02, BRG-03, BRG-04, BRG-05, BRG-06, BRG-07, BRG-08, BRG-09, BRG-10, BRG-11, BRG-12, BRG-13

**Success Criteria** (what must be TRUE):
1. `PikeProcess` class exists in `packages/pike-bridge/src/process.ts`
2. PikeProcess handles spawn, readline, events (message, stderr, exit, error)
3. PikeProcess can be tested in isolation (pure IPC mechanics)
4. `PikeBridge` refactored to use `PikeProcess` internally
5. PikeBridge handles request/response correlation, timeouts, error wrapping
6. PikeBridge can be tested with mock PikeProcess (policy logic only)

**Deliverables:**
- `packages/pike-bridge/src/process.ts` (~200 lines)
- Refactored `packages/pike-bridge/src/bridge.ts` (~300 lines)
- Unit tests for both

**Plans**: 2 plans in 2 waves
- [x] 03-01-PLAN.md - Create PikeProcess class (spawn, readline, EventEmitter)
- [x] 03-02-PLAN.md - Refactor PikeBridge to use PikeProcess + unit tests

**Completed**: 2026-01-20

---

### Phase 4: Server Grouping

**Goal**: Split `server.ts` (4,715 lines) by capability, not by verb. Group related handlers: navigation (hover, definition), editing (completion, rename), etc.

**Depends on**: Phase 1 (core/errors.ts, core/logging.ts), Phase 3 (bridge-manager depends on refactored bridge)

**Status**: Complete

**Requirements**: SRV-01, SRV-02, SRV-03, SRV-04, SRV-05, SRV-06, SRV-07, SRV-08, SRV-09, SRV-10, SRV-11, SRV-12, SRV-13, HLT-01, HLT-02, HLT-03, HLT-04, HLT-05, HLT-06

**Success Criteria** (what must be TRUE):
1. `core/` directory exists with errors.ts, logging.ts, types.ts
2. `features/` directory exists with navigation.ts, editing.ts, symbols.ts, diagnostics.ts
3. `services/` directory exists with bridge-manager.ts, document-cache.ts
4. server.ts reduced to ~150 lines (wiring only)
5. Feature files use `registerXHandlers(connection, services)` pattern
6. Health check command shows server uptime, bridge status, Pike version, recent errors

**Deliverables:**
- `packages/pike-lsp-server/src/core/` (3 files)
- `packages/pike-lsp-server/src/features/` (6 files)
- `packages/pike-lsp-server/src/services/` (2+ files)
- Refactored `server.ts`
- Health check command in VSCode extension

**Plans**: 6 plans in 4 waves
- [x] 04-01-PLAN.md - Core infrastructure (types.ts, document-cache.ts, bridge-manager.ts, services/index.ts)
- [x] 04-02-PLAN.md - Navigation feature handlers (hover, definition, references, highlight, declaration, typeDefinition, implementation)
- [x] 04-03-PLAN.md - Editing feature handlers (completion, signatureHelp, prepareRename, renameRequest)
- [x] 04-04-PLAN.md - Symbols and diagnostics features (documentSymbol, workspaceSymbol, document lifecycle, validation)
- [x] 04-05-PLAN.md - Advanced features and server refactor (hierarchy, semantic tokens, code actions, formatting, links, code lens)
- [x] 04-06-PLAN.md - Health check command (HLT-01 through HLT-06)

**Completed**: 2026-01-21

---

### Phase 5: Pike Reorganization

**Goal**: Split large Pike files using `.pmod` idiom, but keep it to 3-4 files max per module. Avoid micro-modules that hurt grep-ability.

**Depends on**: Phase 4 (server-side must be stable before Pike changes)

**Status**: Complete

**Requirements**: PIK-01, PIK-02, PIK-03, PIK-04, PIK-05, PIK-06, PIK-07, PIK-08, PIK-09, PIK-10, PIK-11, PIK-12

**Success Criteria** (what must be TRUE):
1. `Intelligence.pmod/` directory with module.pmod + 3 .pike files
2. `Analysis.pmod/` directory with module.pmod + 3 .pike files
3. Intelligence.pike reduced from 1,660 to ~100 lines (delegating class)
4. Analysis.pike reduced from 1,191 to ~80 lines (delegating class)
5. Related logic stays together (StdlibResolver with Resolution, Occurrences with Variables)
6. All classes use `create(object ctx)` constructor pattern
7. All classes wrap handlers in catch with LSPError returns
8. Integration tests verify module loading via master()->resolv()

**Deliverables:**
- `pike-scripts/LSP.pmod/Intelligence.pmod/` (4 files: module.pmod, Introspection.pike, Resolution.pike, TypeAnalysis.pike)
- `pike-scripts/LSP.pmod/Analysis.pmod/` (4 files: module.pmod, Diagnostics.pike, Completions.pike, Variables.pike)
- Updated integration tests
- Backward-compatible delegating classes replacing original single files

**Plans**: 6 plans in 4 waves
- [x] 05-01-PLAN.md - Create Intelligence.pmod with module.pmod and Introspection class
- [x] 05-02-PLAN.md - Create Resolution.pike and TypeAnalysis.pike
- [x] 05-03-PLAN.md - Create Analysis.pmod with module.pmod and Diagnostics class
- [x] 05-04-PLAN.md - Create Completions.pike and Variables.pike
- [x] 05-05-PLAN.md - Replace original files with delegating classes, verify context works
- [x] 05-06-PLAN.md - Update tests, E2E smoke test verification

**Completed**: 2026-01-21

---

### Phase 6: Automated LSP Feature Verification

**Goal**: Verify LSP features (symbols, hover, definition, completion) return valid data end-to-end in VSCode integration tests. Current tests only verify extension activation and file opening, but don't check if features work. This phase closes the verification gap identified in CLAUDE.md: "Previous agents broke the LSP by not testing with the actual VSCode extension."

**Depends on**: Phase 5 (Pike modules must be stable)

**Status**: Complete

**Requirements**: LSP-E2E-01, LSP-E2E-02, LSP-E2E-03, LSP-E2E-04, LSP-E2E-05, LSP-E2E-06

**Success Criteria** (what must be TRUE):
1. VSCode integration test calls `textDocument/documentSymbol` and verifies symbols array returned (not null)
2. VSCode integration test calls `textDocument/hover` and verifies MarkupContent returned (not null)
3. VSCode integration test calls `textDocument/definition` and verifies Location returned (not null)
4. VSCode integration test calls `textDocument/completion` and verifies CompletionList returned (not null)
5. E2E feature tests run in CI pipeline (vscode-e2e job) before allowing merge
6. CLAUDE.md verification checklist updated to reference automated tests

**Deliverables:**
- `packages/vscode-pike/src/test/integration/lsp-features.test.ts` (new file with 4+ tests)
- Updated `.github/workflows/test.yml` with E2E feature gate checks
- Updated `.husky/pre-push` to include E2E feature verification
- Updated `.claude/CLAUDE.md` verification section

**Plans**: 2 plans in 2 waves
- [x] 06-01-PLAN.md - Create LSP feature integration tests (symbols, hover, definition, completion)
- [x] 06-02-PLAN.md - Add E2E feature tests to CI pipeline and pre-push hooks

**Completed**: 2026-01-21

---

### Phase 7: Fix Document Lifecycle Handler Duplication

**Goal**: Remove duplicate document lifecycle handlers from server.ts that were inadvertently left during Phase 4 refactoring. These duplicate handlers cause race conditions that corrupt the document cache, breaking LSP features (symbols, hover, go-to-definition).

**Depends on**: Phase 6 (E2E tests revealed the integration bug)

**Status**: Complete

**Requirements**: Closes GAP-01, INT-01 from v2-MILESTONE-AUDIT.md

**Success Criteria** (what must be TRUE):
1. Lines 579-608 removed from `packages/pike-lsp-server/src/server.ts`
2. Only `diagnostics.ts` handlers remain (comprehensive version with error handling)
3. All 7 E2E tests pass (symbols, hover, definition, completion)
4. Document cache populates reliably on file open
5. No duplicate handler registration warnings in logs

**Gap Closure**:
- **GAP-01**: Duplicate document lifecycle handlers in server.ts and diagnostics.ts
- **INT-01**: Document cache not populated reliably (Phase 04 -> Phase 06)
- **E2E Flow breaks**: Document symbols, Hover, Go-to-definition (5 of 7 tests failing)

**Deliverables:**
- Modified `packages/pike-lsp-server/src/server.ts` (remove lines 579-608)
- All E2E tests passing (7/7)
- Updated v2-MILESTONE-AUDIT.md status (if re-audited)

**Plans**: 1 plan
- [x] 07-01-PLAN.md - Fix bridge initialization timing and stdlib preloading

**Completed**: 2026-01-21

---

### Phase 8: Extract Core Utilities to Shared Package

**Goal**: Eliminate code duplication by extracting Logger and Error classes to a shared `@pike-lsp/core` package. Currently, these ~400 lines are duplicated between `pike-lsp-server` and `pike-bridge` to avoid circular dependencies.

**Depends on**: Phase 7 (ensure critical functionality works before refactoring)

**Status**: Complete

**Requirements**: Addresses Tech Debt #1 from v2-MILESTONE-AUDIT.md

**Success Criteria** (what must be TRUE):
1. `@pike-lsp/core` package created in `packages/core/`
2. Logger class extracted to `@pike-lsp/core/src/logging.ts`
3. Error classes (LSPError, BridgeError, PikeError) extracted to `@pike-lsp/core/src/errors.ts`
4. `pike-lsp-server` imports from `@pike-lsp/core` instead of local files
5. `pike-bridge` imports from `@pike-lsp/core` instead of local files
6. All existing tests pass (no behavior changes)
7. ~400 lines of duplicate code removed

**Tech Debt Closure**:
- **Tech Debt #1**: Duplicate Logger and Error classes in pike-bridge vs pike-lsp-server

**Deliverables:**
- New package: `packages/core/` with package.json, tsconfig.json
- Extracted: `@pike-lsp/core/src/logging.ts` (Logger class)
- Extracted: `@pike-lsp/core/src/errors.ts` (LSPError, BridgeError, PikeError)
- Updated imports in `pike-lsp-server/src/` (8 files)
- Updated imports in `pike-bridge/src/` (2 files)
- Removed: `pike-lsp-server/src/core/logging.ts` and `errors.ts` (duplicates)
- Removed: `pike-bridge/src/logging.ts` and `errors.ts` (duplicates)

**Plans**: 3 plans
- [x] 08-01-PLAN.md — Create shared core package with Logger and Error classes
- [x] 08-02-PLAN.md — Migrate pike-bridge to use shared core package
- [x] 08-03-PLAN.md — Migrate pike-lsp-server to use shared core package

**Completed**: 2026-01-21

---

### Phase 9: Implement Pike Version Detection

**Goal**: Complete the Pike version detection feature in BridgeManager so health checks show actual Pike version instead of "Unknown".

**Depends on**: Phase 7 (ensure critical functionality works first)

**Status**: Complete

**Requirements**: Addresses Tech Debt #2 from v2-MILESTONE-AUDIT.md

**Success Criteria** (what must be TRUE):
1. BridgeManager.getHealth() returns actual Pike version string (not null)
2. Health check command shows Pike version (e.g., "Pike 8.0.1116")
3. Version detection handles Pike subprocess communication errors gracefully
4. Falls back to "Unknown" if version detection fails (don't crash)

**Tech Debt Closure**:
- **Tech Debt #2**: Pike version detection incomplete (bridge-manager.ts:72 returns null)

**Deliverables:**
- Updated: `packages/pike-lsp-server/src/services/bridge-manager.ts` (implement version detection)
- Method to query Pike version via bridge (e.g., `pike --version` or JSON-RPC method)
- Health check shows actual version instead of "Unknown"

**Plans**: 3 plans in 3 waves
- [x] 09-01-PLAN.md - Analyzer support for get_version RPC
- [x] 09-02-PLAN.md - Bridge integration and version caching
- [x] 09-03-PLAN.md - E2E verification and health check display

**Impact**: Better observability, health check completeness

**Completed**: 2026-01-21

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

Each phase produces working code. Can pause at any phase without breaking the codebase.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Lean Observability | 3/3 | Complete | 2026-01-20 |
| 2. Safety Net | 3/3 | Complete | 2026-01-20 |
| 3. Bridge Extraction | 2/2 | Complete | 2026-01-20 |
| 4. Server Grouping | 6/6 | Complete | 2026-01-21 |
| 5. Pike Reorganization | 6/6 | Complete | 2026-01-21 |
| 6. Automated LSP Feature Verification | 2/2 | Complete | 2026-01-21 |
| 7. Fix Document Lifecycle Handler Duplication | 1/1 | Complete | 2026-01-21 |
| 8. Extract Core Utilities to Shared Package | 3/3 | Complete | 2026-01-21 |
| 9. Implement Pike Version Detection | 3/3 | Complete | 2026-01-21 |

**Project Status:** v2 MILESTONE COMPLETE

**v2 Requirements:**
- Total: 71 (65 original + 6 LSP-E2E)
- Complete: 71
- Pending: 0

---
*Roadmap created: 2026-01-20*
*Last updated: 2026-01-21*
*Source: LSP Modularization Design v2 (Middle Ground)*
