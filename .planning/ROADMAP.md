# Roadmap: LSP Modularization v2

## Overview

Transform the Pike LSP from a working but hard-to-debug system into a modular, observable, and testable codebase. This milestone focuses on **infrastructure-first** improvements: establish observability and safety nets before major refactoring.

**Philosophy:** Safety without rigidity - solve actual pain points without over-engineering.

**Source:** [Design Document v2](../docs/plans/2026-01-20-lsp-modularization-design-v2.md)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Lean Observability** - Error tracking and structured logging
- [x] **Phase 2: Safety Net** - Pre-push hooks, smoke tests, and CI pipeline
- [ ] **Phase 3: Bridge Extraction** - Isolate IPC mechanics from business logic
- [ ] **Phase 4: Server Grouping** - Split server.ts by capability
- [ ] **Phase 5: Pike Reorganization** - Split large Pike files using .pmod idiom

## Phase Details

### Phase 1: Lean Observability

**Goal**: See what's happening without complex cross-language infrastructure. TypeScript maintains error chains to track path; Pike returns flat, simple error dict.

**Depends on**: Nothing (first phase)

**Status**: Complete ✓

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
- [x] 01-01-PLAN.md — TypeScript error classes (LSPError, BridgeError, PikeError)
- [x] 01-02-PLAN.md — Logger class with component namespacing and log levels
- [x] 01-03-PLAN.md — Pike make_error() helper and Bridge stderr integration

**Completed**: 2026-01-20

---

### Phase 2: Safety Net

**Goal**: Catch regressions on push/PR without slowing local development. No pre-commit hooks - allow broken intermediate commits on feature branches.

**Depends on**: Phase 1 (errors and logging must exist for meaningful test output)

**Status**: Complete ✓

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
- [x] 02-01-PLAN.md — Pre-push hook with Husky v9 (validates build, Pike, smoke tests)
- [x] 02-02-PLAN.md — Smoke test suite (bridge lifecycle, parse, introspect, error handling)
- [x] 02-03-PLAN.md — CI pipeline extension (Pike installation, smoke tests, xvfb for E2E)

**Completed**: 2026-01-20

---

### Phase 3: Bridge Extraction

**Goal**: Isolate IPC mechanics from business logic. The stdin bug would be caught here - pure IPC can be tested independently.

**Depends on**: Phase 1 (BridgeError class needed for error wrapping)

**Status**: Planned

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
- [ ] 03-01-PLAN.md — Create PikeProcess class (spawn, readline, EventEmitter)
- [ ] 03-02-PLAN.md — Refactor PikeBridge to use PikeProcess + unit tests

---

### Phase 4: Server Grouping

**Goal**: Split `server.ts` (4,715 lines) by capability, not by verb. Group related handlers: navigation (hover, definition), editing (completion, rename), etc.

**Depends on**: Phase 1 (core/errors.ts, core/logging.ts), Phase 3 (bridge-manager depends on refactored bridge)

**Status**: Planned

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
- `packages/pike-lsp-server/src/features/` (4 files)
- `packages/pike-lsp-server/src/services/` (2+ files)
- Refactored `server.ts`
- Health check command in VSCode extension

**Plans**: TBD

---

### Phase 5: Pike Reorganization

**Goal**: Split large Pike files using `.pmod` idiom, but keep it to 3-4 files max per module. Avoid micro-modules that hurt grep-ability.

**Depends on**: Phase 4 (server-side must be stable before Pike changes)

**Status**: Planned

**Requirements**: PIK-01, PIK-02, PIK-03, PIK-04, PIK-05, PIK-06, PIK-07, PIK-08, PIK-09, PIK-10, PIK-11, PIK-12

**Success Criteria** (what must be TRUE):
1. `Intelligence.pmod/` directory with module.pmod + 3 .pike files
2. `Analysis.pmod/` directory with module.pmod + 3 .pike files
3. Intelligence.pike reduced from 1,660 to ~400-500 lines per file
4. Related logic stays together (StdlibResolver with Resolution, Occurrences with Variables)
5. All classes use `create(object ctx)` constructor pattern
6. All classes wrap handlers in catch with make_error() returns
7. Integration tests verify module loading via master()->resolv()

**Deliverables:**
- `pike-scripts/LSP.pmod/Intelligence.pmod/` (4 files)
- `pike-scripts/LSP.pmod/Analysis.pmod/` (4 files)
- Integration tests

**Plans**: TBD

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

Each phase produces working code. Can pause at any phase without breaking the codebase.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Lean Observability | 3/3 | Complete ✓ | 2026-01-20 |
| 2. Safety Net | 3/3 | Complete ✓ | 2026-01-20 |
| 3. Bridge Extraction | 0/2 | Planned | - |
| 4. Server Grouping | 0/? | Planned | - |
| 5. Pike Reorganization | 0/? | Planned | - |

**Project Status:** Phase 2 complete (Safety Net in place), ready for Phase 3

**v2 Requirements:**
- Total: 65
- Complete: 21
- Pending: 44

---
*Roadmap created: 2026-01-20*
*Last updated: 2026-01-20*
*Source: LSP Modularization Design v2 (Middle Ground)*
