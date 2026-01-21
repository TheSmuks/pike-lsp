# Pike LSP - Project Overview

## What This Is

A Language Server Protocol implementation for Pike, providing code intelligence (hover, completion, go-to-definition, diagnostics) in VSCode and other LSP-compatible editors.

## Current Status

**Status:** ✅ v2 Milestone Complete (2026-01-21)
**Current Focus:** Planning v3 (Run `/gsd:new-milestone`)
**Core Value:** Safety without rigidity - solve actual pain points without over-engineering

## Requirements

### Validated

- **v2 LSP Modularization** (71 requirements) — Shipped 2026-01-21
  - Key deliveries: Observability, Safety Net, Bridge Extraction, Server Grouping, Pike Reorganization, E2E Verification
  - Archive: [.planning/milestones/v2-REQUIREMENTS.md](milestones/v2-REQUIREMENTS.md)

- **v1 Pike Analyzer Refactoring** (52 requirements) — Shipped 2026-01-20
  - Key deliveries: Modular LSP.pmod structure
  - Archive: [.planning/milestones/v1-pike-refactoring/](milestones/v1-pike-refactoring/)

### Active

(None - Run `/gsd:new-milestone` to define next requirements)

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
*Last updated: 2026-01-21 after v2 milestone completion*
