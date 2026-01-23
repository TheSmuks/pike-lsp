# Pike LSP - Project Overview

## What This Is

A Language Server Protocol implementation for Pike, providing code intelligence (hover, completion, go-to-definition, diagnostics) in VSCode and other LSP-compatible editors.

## Current Status

**Status:** ✅ v3.0 Performance Optimization Complete (2026-01-23)
**Current Focus:** Planning next milestone
**Core Value:** Safety without rigidity - solve actual pain points without over-engineering

## v3.0 Performance Optimization - COMPLETE (2026-01-23)

**Delivered:** Measurable performance improvements across startup, validation, caching, and responsiveness.

**Key achievements:**
- 99.7% faster Pike subprocess startup (19ms → 0.05ms)
- 66% reduction in IPC overhead (3 calls → 1 call for validation)
- 61% faster cache hits vs. misses (313µs vs. 805µs)
- Fixed stdlib introspection - all modules load without crashes
- 50% faster diagnostic feedback (500ms → 250ms debounce)
- Established comprehensive benchmarking infrastructure with CI regression gate

Archive: [.planning/milestones/v3-ROADMAP.md](milestones/v3-ROADMAP.md) | [.planning/milestones/v3-REQUIREMENTS.md](milestones/v3-REQUIREMENTS.md)

## Requirements

### Validated

- **v3.0 Performance Optimization** (34 requirements) — Shipped 2026-01-23
  - Key deliveries: Benchmarking infrastructure, startup optimization, request consolidation, caching, stdlib introspection, responsiveness tuning
  - Archive: [.planning/milestones/v3-REQUIREMENTS.md](milestones/v3-REQUIREMENTS.md)

- **v2 LSP Modularization** (71 requirements) — Shipped 2026-01-21
  - Key deliveries: Observability, Safety Net, Bridge Extraction, Server Grouping, Pike Reorganization, E2E Verification
  - Archive: [.planning/milestones/v2-REQUIREMENTS.md](milestones/v2-REQUIREMENTS.md)

- **v1 Pike Analyzer Refactoring** (52 requirements) — Shipped 2026-01-20
  - Key deliveries: Modular LSP.pmod structure
  - Archive: [.planning/milestones/v1-pike-refactoring/](milestones/v1-pike-refactoring/)

### Active

See: [.planning/REQUIREMENTS.md](REQUIREMENTS.md) for v3.0 requirements

## Roadmap

See: [.planning/MILESTONES.md](MILESTONES.md) for full history.

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

---
*Last updated: 2026-01-23 after v3.0 milestone completion*
