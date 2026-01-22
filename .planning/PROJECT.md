# Pike LSP - Project Overview

## What This Is

A Language Server Protocol implementation for Pike, providing code intelligence (hover, completion, go-to-definition, diagnostics) in VSCode and other LSP-compatible editors.

## Current Status

**Status:** 🚧 v3 Milestone In Progress
**Current Focus:** LSP Performance Optimization
**Core Value:** Safety without rigidity - solve actual pain points without over-engineering

## Current Milestone: v3.0 LSP Performance Optimization

**Goal:** Reduce intellisense latency by consolidating Pike calls, adding caching, and optimizing startup time.

**Target features:**
- Consolidate triple Pike calls (introspect/parse/analyze) into single unified call
- Add symbol position caching to avoid redundant calculations
- Fix stdlib preloading (currently disabled due to crashes)
- Optimize debounce timing for faster feedback
- Investigate cross-file compilation caching

## Requirements

### Validated

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
*Last updated: 2026-01-22 after v3.0 milestone start*
