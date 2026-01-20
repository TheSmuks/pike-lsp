---
phase: 01-lean-observability
plan: 03
subsystem: error-handling
tags: [pike, typescript, logger, pike-error, error-chain, stderr-capture]

# Dependency graph
requires:
  - phase: 01-lean-observability
    plan: 01
    provides: LSPError, BridgeError, PikeError classes
  - phase: 01-lean-observability
    plan: 02
    provides: Logger class with LogLevel enum
provides:
  - Pike error helper (make_error) in Pike LSP.pmod/module.pmod
  - Logger integration in PikeBridge for stderr capture
  - PikeError wrapping for all Pike subprocess failures
  - Error chain tracking from server -> bridge -> pike layers
affects:
  - phase: 02-safety-net (will use Logger for error reporting)
  - phase: 04-server-grouping (will use PikeError for subprocess errors)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pike returns flat error dicts via make_error()"
    - "TypeScript wraps in PikeError with layer tracking"
    - "Logger stderr capture with debug/trace levels"
    - "Error chain via native Error.cause property"

key-files:
  created:
    - packages/pike-bridge/src/errors.ts (local LSPError/PikeError copies)
    - packages/pike-bridge/src/logging.ts (local Logger copy)
  modified:
    - pike-scripts/LSP.pmod/module.pmod (added make_error)
    - packages/pike-bridge/src/bridge.ts (Logger integration, PikeError wrapping)
    - packages/pike-bridge/src/index.ts (exports PikeError, LSPError, Logger, LogLevel)
    - packages/pike-bridge/package.json (kept no-deps state)
    - packages/pike-lsp-server/package.json (removed exports that caused circular dep)

key-decisions:
  - "01-03-D01: Duplicated errors.ts and logging.ts in pike-bridge to avoid circular dependency"
  - "01-03-D02: Pike uses simple flat dicts, TypeScript adds layer tracking via PikeError"

patterns-established:
  - "Pattern: Pike returns flat dicts {error, kind, msg, line}, TypeScript wraps in PikeError"
  - "Pattern: Error layer tracked as 'server' | 'bridge' | 'pike'"
  - "Pattern: Logger.debug() for normal stderr, Logger.trace() for suppressed warnings"

# Metrics
duration: 18min
completed: 2026-01-20
---

# Phase 1 Plan 3: Safe error reporting with Logger + PikeError Summary

**Pike error helper make_error(), Logger stderr capture in PikeBridge, and PikeError wrapping for subprocess failures**

## Performance

- **Duration:** 18 min
- **Started:** 2026-01-20T20:10:40Z
- **Completed:** 2026-01-20T20:27:47Z
- **Tasks:** 5
- **Files modified:** 5
- **Files created:** 2

## Accomplishments

1. Added `make_error()` helper to Pike LSP.pmod/module.pmod for flat error dictionaries
2. Integrated Logger into PikeBridge for stderr capture with level filtering
3. Wrapped all Pike subprocess errors in PikeError class with layer tracking
4. Exported PikeError, LSPError, Logger, LogLevel from pike-bridge for consumers
5. Established cross-boundary error contract: Pike returns dicts, TypeScript adds chain

## Task Commits

Each task was committed atomically:

1. **Task 1: Add make_error() helper to Pike module.pmod** - `001acfe` (feat)
2. **Task 2: Import Logger into PikeBridge** - `69809e7` (feat)
3. **Task 3: Replace stderr handler with Logger integration** - `b1f63d6` (feat)
4. **Task 4: Wrap Pike errors in PikeError class** - `e82aa26` (feat)
5. **Task 5: Export PikeError from pike-bridge** - `c856aaf` (feat)
6. **Deviation fix: Add local error and logging modules to pike-bridge** - `0283e10` (feat)

## Files Created/Modified

- `pike-scripts/LSP.pmod/module.pmod` - Added `make_error()` function returning flat error dicts
- `packages/pike-bridge/src/errors.ts` - Local copy of LSPError/PikeError (avoid circular dep)
- `packages/pike-bridge/src/logging.ts` - Local copy of Logger (avoid circular dep)
- `packages/pike-bridge/src/bridge.ts` - Logger integration, PikeError wrapping
- `packages/pike-bridge/src/index.ts` - Exports PikeError, LSPError, Logger, LogLevel

## Decisions Made

### 01-03-D01: Duplicated error/logging modules to avoid circular dependency

**Rationale:** The plan originally had pike-bridge importing from @pike-lsp/pike-lsp-server/core, but pike-lsp-server also imports from pike-bridge. This created a circular workspace dependency that pnpm warned about and prevented proper builds.

**Solution:** Created local copies of errors.ts (LSPError, PikeError) and logging.ts (Logger, LogLevel) in pike-bridge. These are annotated with TODO comments to extract to a shared @pike-lsp/core package in the future.

### 01-03-D02: Pike returns flat dicts, TypeScript adds layer tracking

**Rationale:** Pike lacks stack context and reliable exception handling. Pretending otherwise creates leaky abstractions.

**Implementation:** `make_error()` returns `{error: 1, kind: "SYNTAX"|..., msg: string, line: int|void}`. Bridge wraps these responses in PikeError with layer='pike', enabling proper error chain tracking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Circular dependency between pike-bridge and pike-lsp-server**
- **Found during:** Task 2 (Import Logger into PikeBridge)
- **Issue:** Plan specified importing from @pike-lsp/pike-lsp-server/core, but pike-lsp-server depends on pike-bridge
- **Fix:** Created local copies of errors.ts and logging.ts in pike-bridge
- **Files modified:** packages/pike-bridge/src/errors.ts (created), packages/pike-bridge/src/logging.ts (created), packages/pike-bridge/package.json (removed dependency), packages/pike-lsp-server/package.json (removed exports)
- **Verification:** All packages build successfully, no circular dependency warning
- **Committed in:** `0283e10` (part of deviation fix commit)

**2. [Rule 3 - Blocking] TypeScript declaration files not generated**
- **Found during:** Build verification
- **Issue:** .d.ts files for types.ts, bridge.ts, constants.ts weren't being generated, causing import errors
- **Fix:** Deleted stale tsconfig.tsbuildinfo files and rebuilt
- **Files modified:** tsconfig.tsbuildinfo files (deleted)
- **Verification:** All .d.ts files generated, imports resolve correctly
- **Committed in:** Part of build process, not a separate commit

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes were necessary for correct operation. The circular dependency fix required duplicating code - a TODO was added to extract to a shared package later.

## Issues Encountered

- **pnpm circular dependency warning:** pike-bridge and pike-lsp-server had mutual dependencies. Fixed by creating local copies of shared modules.
- **TypeScript .d.ts files not generated:** Stale tsconfig.tsbuildinfo files prevented declaration generation. Fixed by deleting and rebuilding.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Error contract established: Pike returns flat dicts, TypeScript wraps in PikeError
- Logger available in pike-bridge for stderr capture with level filtering
- PikeError exported from pike-bridge for consumer error handling
- Ready for 01-04 (or next plan in Lean Observability phase)

**TODO:** Extract errors.ts and logging.ts to shared @pike-lsp/core package to eliminate duplication (would require architectural decision).

---
*Phase: 01-lean-observability*
*Plan: 03*
*Completed: 2026-01-20*
