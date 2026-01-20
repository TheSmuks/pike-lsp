---
phase: 01-lean-observability
plan: 01
subsystem: error-handling
tags: typescript, error-class, error-chaining, layer-tracking

# Dependency graph
requires: []
provides:
  - LSPError base class with layer tracking (server/bridge/pike)
  - BridgeError and PikeError specialized error classes
  - Error.chain property for readable error path traversal
  - Barrel export for @pike-lsp/pike-lsp-server/core
affects: [02-safety-net, 04-server-grouping]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Error class hierarchy extending native Error with override modifier
    - Layer tracking via readonly layer property
    - Error chain traversal using native Error.cause
    - ESM barrel exports with .js extension in import paths

key-files:
  created:
    - packages/pike-lsp-server/src/core/errors.ts
    - packages/pike-lsp-server/src/core/index.ts
  modified: []

key-decisions: []

patterns-established:
  - "Pattern: Layer-aware error tracking - every error knows its origin layer"
  - "Pattern: Error chain strings provide readable debugging paths like 'server -> bridge -> pike'"

# Metrics
duration: 3min
completed: 2026-01-20
---

# Phase 1 Plan 1: Error Class Hierarchy Summary

**TypeScript error class hierarchy (LSPError, BridgeError, PikeError) with layer tracking and chain traversal for debuggable error paths**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-20T20:03:40Z
- **Completed:** 2026-01-20T20:06:43Z
- **Tasks:** 3 (combined into 2 commits)
- **Files created:** 2

## Accomplishments

- Created LSPError base class with layer tracking (server/bridge/pike) and chain property for error path traversal
- Created BridgeError and PikeError subclasses with fixed layer values for convenient error creation
- Established barrel export pattern for clean imports from @pike-lsp/pike-lsp-server/core

## Task Commits

Each task was committed atomically:

1. **Task 1-2: Create LSPError base class with BridgeError and PikeError subclasses** - `d203bc2` (feat)
2. **Task 3: Create barrel export for core module** - `93c7636` (feat)

## Files Created

- `packages/pike-lsp-server/src/core/errors.ts` (174 lines) - LSPError, BridgeError, PikeError classes with layer tracking and chain traversal
- `packages/pike-lsp-server/src/core/index.ts` (10 lines) - Barrel export re-exporting all error classes and ErrorLayer type

## Decisions Made

- Used native Error.cause via `{ cause }` constructor option (Node.js 16.9.0+) instead of manual property assignment
- Applied `override` modifier to cause property to satisfy TypeScript's strict mode
- Used conditional assignment (`if (cause) this.cause = cause`) to satisfy exactOptionalPropertyTypes rule

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Issue 1: TypeScript compilation errors with exactOptionalPropertyTypes**
- Initial implementation used direct property assignment `this.cause = cause`
- With `exactOptionalPropertyTypes: true`, TypeScript rejected assigning `Error | undefined` to `Error`
- **Fix:** Changed to conditional assignment only when cause is provided

**Issue 2: Missing override modifier**
- TypeScript required `override` keyword on the cause property since it overrides Error.cause
- **Fix:** Added `public override readonly cause?: Error;`

## Authentication Gates

None - no external services required authentication.

## Next Phase Readiness

- Error class hierarchy is ready for use in logging module (plan 01-02)
- BridgeError and PikeError provide foundation for Safety Net phase error categorization
- No blockers or concerns
