# Pike LSP - Project Overview

## What This Is

A Language Server Protocol implementation for Pike, providing code intelligence (hover, completion, go-to-definition, diagnostics) in VSCode and other LSP-compatible editors.

## Current Milestone: v2 - LSP Modularization

**Started:** 2026-01-20
**Status:** Planning
**Core Value:** Safety without rigidity - solve actual pain points without over-engineering

### Goals

1. **Debuggability** - Know where errors occur (bridge? parser? server?)
2. **Testability** - Test components in isolation
3. **Maintainability** - Navigate and modify without touching unrelated code
4. **Reliability** - Guardrails prevent broken code from reaching main

### What Changed from v1

The v1 milestone focused on Pike-side modularization (splitting analyzer.pike into LSP.pmod modules). v2 focuses on TypeScript-side infrastructure:

| Aspect | v1 (Pike Refactor) | v2 (LSP Modularization) |
|--------|-------------------|------------------------|
| Focus | Pike code organization | TypeScript infrastructure |
| Error handling | Per-handler catch blocks | Cross-layer error chains |
| Testing | Module unit tests | E2E smoke tests + CI |
| Bridge | Unchanged | IPC extraction + policy split |
| Server | Unchanged | Capability-based grouping |

### Philosophy

**Infrastructure-First with Pragmatic Implementation:**
- Establish observability before major refactoring
- Pre-push hooks (not pre-commit) for safety without friction
- TypeScript error chains, Pike flat dicts (no over-engineering)
- Group by capability (navigation, editing) not by verb (hover, definition)
- 3-4 Pike files per .pmod, not 8 micro-modules

## Requirements

See: `.planning/REQUIREMENTS.md` (65 v2 requirements)

## Roadmap

See: `.planning/ROADMAP.md` (5 phases)

1. **Phase 1: Lean Observability** - Error tracking and structured logging
2. **Phase 2: Safety Net** - Pre-push hooks, smoke tests, CI
3. **Phase 3: Bridge Extraction** - Isolate IPC from business logic
4. **Phase 4: Server Grouping** - Split server.ts by capability
5. **Phase 5: Pike Reorganization** - Split Pike files using .pmod

## Architecture

```
VSCode Extension (vscode-pike)
    |
    v
TypeScript LSP Server (pike-lsp-server)
    |                    \
    v                     \--> features/  (navigation.ts, editing.ts, ...)
PikeBridge (pike-bridge)       services/  (bridge-manager.ts, ...)
    |                          core/      (errors.ts, logging.ts)
    v
Pike Analyzer (pike-scripts/analyzer.pike)
    |
    v
LSP Modules (LSP.pmod/)
    |-- Intelligence.pmod/  (Introspection, Resolution, TypeAnalysis)
    |-- Analysis.pmod/      (Diagnostics, Completions, Variables)
    |-- Parser.pike
    |-- Cache.pmod
    \-- Compat.pmod
```

## Previous Milestones

### v1: Pike LSP Analyzer Refactoring (Complete)

**Completed:** 2026-01-20
**Duration:** ~4 hours (30 plans)
**Outcome:** Split 3,221-line analyzer.pike into modular LSP.pmod structure

Archived at: `.planning/milestones/v1-pike-refactoring/`

---
*Last updated: 2026-01-20*
