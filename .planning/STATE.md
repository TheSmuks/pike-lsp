# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-20)

**Core value:** Safety without rigidity - solve actual pain points without over-engineering
**Current focus:** v2 Milestone - LSP Modularization

## Current Position

Phase: 3 of 5 (Bridge Extraction)
Plan: 1 of 2 complete
Status: In progress - PikeProcess IPC wrapper created
Last activity: 2026-01-20 — Completed plan 03-01 (PikeProcess Class)

Progress: [████████░░] 47% (7/15 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 5 min
- Total execution time: 35 min

**By Phase:**

| Phase | Plans | Complete | Avg/Plan |
|-------|-------|----------|----------|
| 1. Lean Observability | 3 | 3 | 8 min |
| 2. Safety Net | 3 | 3 | 3 min |
| 3. Bridge Extraction | 2 | 1 | 2 min |
| 4. Server Grouping | 3 | 0 | - |
| 5. Pike Reorganization | 2 | 0 | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

**Implementation Decisions (from plans 01-01, 01-02, 01-03, 02-01, 02-02, 02-03, 03-01):**

| ID | Decision | Rationale |
|----|----------|-----------|
| 01-01-D01 | Use native Error.cause via { cause } option | Node.js 16.9.0+ support, cleaner than manual property assignment |
| 01-01-D02 | Conditional cause assignment for exactOptionalPropertyTypes | Avoids TypeScript strict mode error when assigning undefined |
| 01-02-D01 | All logs to console.error (stderr) | LSP servers emit diagnostics to stderr, not stdout |
| 01-02-D02 | Numeric log levels for comparison | Enables efficient level-based filtering without string comparisons |
| 01-02-D03 | No transports/formatters in Logger | Keep logging minimal per lean observability principle |
| 01-03-D01 | Duplicated errors.ts and logging.ts in pike-bridge | Avoid circular dependency (bridge <-> server). TODO: Extract to shared @pike-lsp/core |
| 01-03-D02 | Pike returns flat dicts, TypeScript adds layer tracking | Pike lacks stack context. make_error() returns {error, kind, msg, line} |
| 02-01-D01 | Pre-push hook only, not pre-commit | "Green main, not green commits" philosophy - allow broken intermediate commits |
| 02-01-D02 | Conditional smoke test validation | Hook works before smoke tests exist (plan 02-02 pending) |
| 02-02-D01 | Smoke tests verify structure not content | Tests stay stable as implementation changes, focus on "does it crash" not "exact output" |
| 02-02-D02 | Single bridge instance reused across tests | Faster than start/stop per test, 30 second timeout accommodates slow PikeBridge startup |
| 02-03-D01 | Pike 8.0 from apt for main CI test job | Reliable, matches production environment |
| 02-03-D02 | Smoke tests run after unit tests in CI | Fast feedback loop, keeps related tests grouped |
| 02-03-D03 | VSCode E2E job waits for unit tests | Job dependency via needs: [test, pike-test] ensures E2E only runs if unit tests pass |
| 02-03-D04 | xvfb-run wraps VSCode E2E tests | Provides X11 display for headless Linux CI environment |
| 03-01-D01 | readline.createInterface() for stdout reading | Prevents JSON fragmentation and stdin bug by reading complete lines |
| 03-01-D02 | PikeProcess is pure IPC wrapper, no business logic | Separation: PikeProcess handles spawn/readline/events, PikeBridge handles correlation/timeouts/deduplication |

**Design Decisions (from v2 design document):**

| ID | Decision | Rationale |
|----|----------|-----------|
| V2-D01 | TypeScript error chains, Pike flat dicts | Pike lacks stack context - pretending otherwise creates leaky abstractions |
| V2-D02 | Group handlers by capability (4 files) not by verb (11 files) | Reduces cognitive load by keeping related logic collocated |
| V2-D03 | Pre-push hooks, not pre-commit | Maintains defense in depth without strangling minute-by-minute workflow |
| V2-D04 | Pike uses werror(), TypeScript wraps in Logger | Achieves unified log stream without over-engineering Pike logging library |
| V2-D05 | 3-4 Pike files per .pmod, not 8 | Avoids micro-modules that hurt grep-ability |

### Roadmap Evolution

**2026-01-20**: v2 milestone initialized
- Source: Design Document v2 (Middle Ground)
- Previous milestone: v1 Pike Refactoring (archived)
- Approach: Infrastructure-First with Pragmatic Implementation

### Pending Todos

None yet.

### Blockers/Concerns

**From design document:**
- Phase 3 (Bridge Extraction) is critical - the stdin bug would be caught here
- Phase 4 depends on Phase 1 (errors.ts, logging.ts) and Phase 3 (refactored bridge)
- Phase 5 should wait until server-side is stable

**Current (as of plan 02-03):**
- No blockers - Safety Net phase complete (pre-push hooks + smoke tests + CI)
- TODO: Consider extracting errors.ts and logging.ts to shared @pike-lsp/core package to eliminate duplication

## Session Continuity

Last session: 2026-01-20
Stopped at: Completed plan 03-01 (PikeProcess Class)
Resume file: None

## Previous Milestone Summary

### v1: Pike LSP Analyzer Refactoring (Complete)

**Completed:** 2026-01-20
**Total Duration:** ~4 hours
**Plans Completed:** 30 (26 refactoring + 4 phase planning)

**Key Outcomes:**
- Split 3,221-line analyzer.pike into modular LSP.pmod structure
- 52 v1 requirements satisfied (51/52, 98%)
- 111 tests passing on Pike 8.0.1116
- CI configured for cross-version validation

**Archived at:** `.planning/milestones/v1-pike-refactoring/`

## Next Steps

1. **Phase 3 (Bridge Extraction) in progress** - 1 of 2 plans complete
2. Execute plan 03-02 (Introspection Extraction) - integrate PikeProcess into PikeBridge
3. Continue with Phase 4 (Server Grouping)
4. Complete Phase 5 (Pike Reorganization)
