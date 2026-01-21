# Requirements: LSP Modularization v2

**Defined:** 2026-01-20
**Source:** [Design Document v2](../docs/plans/2026-01-20-lsp-modularization-design-v2.md)
**Core Value:** Safety without rigidity - solve actual pain points without over-engineering

## Goals

1. **Debuggability** - Know where errors occur (bridge? parser? server?)
2. **Testability** - Test components in isolation
3. **Maintainability** - Navigate and modify without touching unrelated code
4. **Reliability** - Guardrails prevent broken code from reaching main

## v2 Requirements

### Observability (OBS)

- [x] **OBS-01**: Create `LSPError` class with layer tracking (`server`, `bridge`, `pike`)
- [x] **OBS-02**: Create `BridgeError` subclass for IPC-layer errors
- [x] **OBS-03**: Create `PikeError` subclass for Pike subprocess errors
- [x] **OBS-04**: Implement error chain building (`error.chain` traverses cause hierarchy)
- [x] **OBS-05**: Create `Logger` class with component-based namespacing
- [x] **OBS-06**: Implement log levels: OFF, ERROR, WARN, INFO, DEBUG, TRACE
- [x] **OBS-07**: Logger output includes timestamp, level, component, message, and optional context
- [x] **OBS-08**: Logger.setLevel() controls global log filtering
- [x] **OBS-09**: Pike errors return flat dicts with `error`, `kind`, `msg`, `line` fields
- [x] **OBS-10**: Bridge captures Pike stderr and logs via TypeScript Logger

### Safety Net (SAF)

- [x] **SAF-01**: Create `.husky/pre-push` hook that blocks broken pushes
- [x] **SAF-02**: Pre-push validates TypeScript builds (`pnpm -r build`)
- [x] **SAF-03**: Pre-push validates Pike compiles (`pike -e 'compile_file("pike-scripts/analyzer.pike")'`)
- [x] **SAF-04**: Pre-push runs smoke tests (`pnpm --filter pike-lsp-server test:smoke`)
- [x] **SAF-05**: Create smoke test suite with bridge lifecycle tests
- [x] **SAF-06**: Smoke test validates parse request returns array
- [x] **SAF-07**: Smoke test validates introspect request returns data
- [x] **SAF-08**: Smoke test validates invalid Pike returns error (not crash)
- [x] **SAF-09**: Create CI pipeline (`.github/workflows/test.yml`)
- [x] **SAF-10**: CI runs on push to main and pull requests
- [x] **SAF-11**: CI installs Pike, runs build, tests, and VSCode E2E

### Bridge Extraction (BRG)

- [x] **BRG-01**: Create `PikeProcess` class in `packages/pike-bridge/src/process.ts`
- [x] **BRG-02**: PikeProcess handles spawn with stdin/stdout/stderr pipes
- [x] **BRG-03**: PikeProcess uses readline interface for line-by-line stdout reading
- [x] **BRG-04**: PikeProcess emits events: `message`, `stderr`, `exit`, `error`
- [x] **BRG-05**: PikeProcess.send() writes JSON + newline to stdin
- [x] **BRG-06**: PikeProcess.kill() cleans up readline and child process
- [x] **BRG-07**: PikeProcess.isAlive() returns process health status
- [x] **BRG-08**: Refactor `PikeBridge` to use `PikeProcess` internally
- [x] **BRG-09**: PikeBridge handles request/response correlation with pending map
- [x] **BRG-10**: PikeBridge implements timeout policy for requests (30s default)
- [x] **BRG-11**: PikeBridge wraps Pike errors in `PikeError` class
- [x] **BRG-12**: Unit tests for PikeProcess IPC mechanics
- [x] **BRG-13**: Unit tests for PikeBridge policy logic (with mock process)

### Server Grouping (SRV)

- [x] **SRV-01**: Create `packages/pike-lsp-server/src/core/errors.ts` with LSPError types
- [x] **SRV-02**: Create `packages/pike-lsp-server/src/core/logging.ts` with Logger
- [x] **SRV-03**: Create `packages/pike-lsp-server/src/core/types.ts` with shared types
- [x] **SRV-04**: Create `packages/pike-lsp-server/src/features/navigation.ts` (hover, definition, references, highlight)
- [x] **SRV-05**: Create `packages/pike-lsp-server/src/features/editing.ts` (completion, rename)
- [x] **SRV-06**: Create `packages/pike-lsp-server/src/features/symbols.ts` (documentSymbol, workspaceSymbol)
- [x] **SRV-07**: Create `packages/pike-lsp-server/src/features/diagnostics.ts` (publishDiagnostics)
- [x] **SRV-08**: Create `packages/pike-lsp-server/src/services/bridge-manager.ts` (bridge lifecycle, health)
- [x] **SRV-09**: Create `packages/pike-lsp-server/src/services/document-cache.ts` (parsed document cache)
- [x] **SRV-10**: Refactor `server.ts` to wiring-only (~150 lines)
- [x] **SRV-11**: Feature files use `registerXHandlers(connection, services)` pattern
- [x] **SRV-12**: Each feature handler has try/catch with logger.error fallback
- [x] **SRV-13**: Services interface bundles bridge, logger, documentCache

### Pike Reorganization (PIK)

- [x] **PIK-01**: Create `Intelligence.pmod/module.pmod` with shared helpers (type traversal, inheritance utils)
- [x] **PIK-02**: Create `Intelligence.pmod/Introspection.pike` (symbol extraction, docstrings)
- [x] **PIK-03**: Create `Intelligence.pmod/Resolution.pike` (name resolution, go-to-definition, StdlibResolver)
- [x] **PIK-04**: Create `Intelligence.pmod/TypeAnalysis.pike` (type inference, inheritance chains)
- [x] **PIK-05**: Create `Analysis.pmod/module.pmod` with shared helpers (scope tracking, position utils)
- [x] **PIK-06**: Create `Analysis.pmod/Diagnostics.pike` (error/warning generation)
- [x] **PIK-07**: Create `Analysis.pmod/Completions.pike` (completion context, suggestions)
- [x] **PIK-08**: Create `Analysis.pmod/Variables.pike` (uninitialized detection, scope tracking, Occurrences)
- [x] **PIK-09**: Each .pike class has `create(object ctx)` constructor
- [x] **PIK-10**: Each .pike class wraps handlers in catch blocks with make_error()
- [x] **PIK-11**: Intelligence.pike reduced from 1660 to ~400-500 lines per file
- [x] **PIK-12**: Integration tests verify module loading via master()->resolv()

### Health Check (HLT)

- [x] **HLT-01**: Implement `Pike LSP: Show Diagnostics` VSCode command
- [x] **HLT-02**: Health status shows server uptime
- [x] **HLT-03**: Health status shows bridge connection and Pike PID
- [x] **HLT-04**: Health status shows Pike version
- [x] **HLT-05**: Health status shows recent errors (last 5)
- [x] **HLT-06**: BridgeManager implements getHealth() returning HealthStatus interface

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rich cross-language error chains | Pike lacks stack context - keep it simple |
| 11 separate handler files | Too granular - group by capability |
| Pre-commit hooks | Too restrictive for local workflow |
| Symmetric Pike logging library | Over-engineering - Pike uses werror(), TS wraps it |
| 8 Pike module files | Too many micro-modules - keep to 3-4 per .pmod |

## Design Compromises (v1 → v2)

| Aspect | v1 Approach | v2 Approach |
|--------|-------------|-------------|
| Error handling | Rich cross-language chains | TS chains, Pike flat dicts |
| Handler structure | 11 files (one per verb) | 4 files (by capability) |
| Git discipline | Pre-commit hooks | Pre-push hooks |
| Pike logging | Symmetric logging library | Just `werror()`, TS wraps |
| Pike modules | 8 files | 3-4 files per .pmod |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OBS-01 to OBS-10 | Phase 1 | Complete ✓ |
| SAF-01 to SAF-11 | Phase 2 | Complete ✓ |
| BRG-01 to BRG-13 | Phase 3 | Complete ✓ |
| SRV-01 to SRV-13 | Phase 4 | Complete ✓ |
| PIK-01 to PIK-12 | Phase 5 | Pending |
| HLT-01 to HLT-06 | Phase 4 | Complete ✓ |

**Coverage:**
- v2 requirements: 65 total
- Mapped to phases: 65
- Unmapped: 0
- Complete: 53 (82%)

---
*Requirements defined: 2026-01-20*
*Source: LSP Modularization Design v2*
