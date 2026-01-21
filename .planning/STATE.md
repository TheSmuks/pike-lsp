# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-20)

**Core value:** Safety without rigidity - solve actual pain points without over-engineering
**Current focus:** v2 Milestone - LSP Modularization

## Current Position

Phase: 5 of 5 (Pike Reorganization)
Plan: 4 of ? complete
Status: Phase 5 in progress - Analysis.pmod complete with Completions and Variables
Last activity: 2026-01-21 — Completed plan 05-04 (Analysis.pmod with Completions and Variables)

Progress: [████████████] 91% (22/24 v2 plans complete, Phase 5 in progress)

## Performance Metrics

**Velocity:**
- Total plans completed: 22
- Average duration: 6 min
- Total execution time: 134 min

**By Phase:**

| Phase | Plans | Complete | Avg/Plan |
|-------|-------|----------|----------|
| 1. Lean Observability | 3 | 3 | 8 min |
| 2. Safety Net | 3 | 3 | 3 min |
| 3. Bridge Extraction | 2 | 2 | 3 min |
| 4. Server Grouping | 6 | 6 | 6 min |
| 5. Pike Reorganization | 4 | 4 | 6 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

**Implementation Decisions (from plans 01-01, 01-02, 01-03, 02-01, 02-02, 02-03, 03-01, 03-02, 04-01, 04-02, 04-03, 04-04, 04-05, 04-06):**

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
| 03-02-D01 | MockPikeProcess class enables isolated unit testing | Tests can run without Pike installation by simulating process behavior |
| 03-02-D02 | PikeBridge delegates all IPC to PikeProcess | Clean separation: PikeProcess handles spawn/readline/events, PikeBridge handles correlation/timeouts/deduplication |
| 04-01-D01 | Used type imports to avoid circular dependencies | import type prevents circular deps between services and core |
| 04-01-D02 | DocumentCacheEntry type centralizes document state | Used by both cache and consumers, single source of truth |
| 04-01-D03 | BridgeManager wraps PikeBridge via composition | Composition over inheritance for cleaner separation of concerns |
| 04-02-D01 | Navigation handlers receive Services bundle + TextDocuments | Clean dependency injection without accessing global documents |
| 04-02-D02 | Helper functions kept in navigation.ts module | Module cohesion - related functions co-located with their handlers |
| 04-02-D03 | Used Array.from() for DocumentCache.entries() iteration | Avoids downlevelIteration compilation issues with ES5 target |
| 04-03-D01 | TextDocuments passed as parameter not in Services | TextDocuments is LSP protocol managed, keeps Services focused on server state |
| 04-03-D02 | Helper functions kept in editing.ts module | Functions like buildCompletionItem are feature-specific, no sharing required |
| 04-03-D03 | Direct logger usage without child() method | Logger class doesn't have child() method, using logger.debug/info directly |
| 04-04-D01 | Use new Logger() instead of logger.child() | Logger class doesn't have child method, create new instance per feature |
| 04-04-D02 | Import SymbolKind as value not type | Needed for enum member access in switch statement |
| 04-04-D03 | Add analyzeUninitialized to BridgeManager | Exposes PikeBridge method for diagnostics feature handlers |
| 04-05-D01 | Made BridgeManager.bridge public readonly for feature handler access | Avoids getter methods while maintaining encapsulation |
| 04-05-D02 | Used Array.from() for DocumentCache iteration | DocumentCache is a Map subclass, needs explicit conversion for for/of loops |
| 04-05-D03 | Added globalSettings and includePaths to Services interface | Advanced handlers need mutable access to config |
| 04-05-D04 | Extracted defaultSettings to core/types.ts | Removes duplication with server.ts, provides single source of truth |
| 04-06-D01 | Use connection.workspace.onExecuteCommand for workspace commands | Workspace commands require workspace-level handler, not connection-level |
| 04-06-D02 | Register command after client.start() in extension.ts | Ensures LanguageClient is available when command is invoked |
| 04-06-D03 | Use dot notation (pike.lsp.showDiagnostics) consistently | Standard VSCode command format, must match across server.ts, extension.ts, package.json |

**Implementation Decisions (from plan 05-01):**

| ID | Decision | Rationale |
|----|----------|-----------|
| 05-01-D01 | Use module.submodule.class pattern for accessing classes in nested .pmod directories | Pike creates submodules for .pike files inside .pmod directories; constant export creates circular dependency |
| 05-01-D02 | Keep shared helper functions in module.pmod, classes in separate .pike files | Pike's .pmod system merges module.pmod contents directly into module namespace |
| 05-01-D03 | Use master()->resolv() for module resolution instead of constant exports | Avoids circular dependency at compile time; runtime resolution works correctly |

**Implementation Decisions (from plan 05-02):**

| ID | Decision | Rationale |
|----|----------|-----------|
| 05-02-D01 | Resolution class uses sibling Introspection for program introspection | Introspection class already has introspect_program implementation; use master()->resolv("LSP.Intelligence.Introspection.Introspection") to access |
| 05-02-D02 | TypeAnalysis.parse_autodoc called by Resolution.parse_stdlib_documentation | AutoDoc parsing logic belongs in TypeAnalysis class; Resolution delegates for separation of concerns |
| 05-02-D03 | Both classes access module.pmod helpers via master()->resolv | Pike's module system requires runtime resolution; functionp() check ensures function exists |
| 05-02-D04 | BOOTSTRAP_MODULES constant guards against circular dependency | Modules used by the resolver (Stdio, String, Array, Mapping) return early during resolution to avoid timeout |

**Implementation Decisions (from plan 05-03):**

| ID | Decision | Rationale |
|----|----------|-----------|
| 05-03-D01 | Use module.pmod for shared helpers in .pmod subdirectories | Pike's .pmod pattern allows module.pmod to export functions directly to the namespace |
| 05-03-D02 | Access module.pmod functions via master()->resolv() in classes | Classes within the .pmod need a reference to module.pmod to access functions; use program module_program = master()->resolv("LSP.Analysis.module") |
| 05-03-D03 | File and class with same name (Diagnostics.pike contains class Diagnostics) | Standard Pike pattern where file name matches primary class name; access via master()->resolv("LSP.Analysis.Diagnostics")->Diagnostics |

**Implementation Decisions (from plan 05-04):**

| ID | Decision | Rationale |
|----|----------|-----------|
| 05-04-D01 | Completions.pike contains handle_get_completion_context with token-based context analysis | Token-based analysis is more accurate than regex for determining completion context; scans backward from cursor to find access operators (->, ., ::) |
| 05-04-D02 | Variables.pike contains handle_find_occurrences per v2 design (Occurrences not separate file) | Finding occurrences is fundamentally about tracking variable references; keeping Occurrences in Variables.pike maintains grep-ability and reduces micro-modules |
| 05-04-D03 | Both classes use create(object ctx) constructor pattern matching Diagnostics class | Consistent pattern across all Analysis.pmod classes; context reserved for future use with LSP context |

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

**Current (as of plan 04-06):**
- No blockers - Phase 4 complete, ready for Phase 5
- TODO: Consider extracting errors.ts and logging.ts to shared @pike-lsp/core package to eliminate duplication
- TODO: Consider moving helper functions (flattenSymbols, buildSymbolPositionIndex) to utility modules
- TODO: Pike version detection in BridgeManager.getHealth() - returns null for now (documented limitation)

## Session Continuity

Last session: 2026-01-21
Stopped at: Completed plan 05-02 (Intelligence.pmod with Resolution and TypeAnalysis)
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

1. **Phase 5 (Pike Reorganization)** - Split large Pike files using .pmod idiom
2. Final milestone completion
