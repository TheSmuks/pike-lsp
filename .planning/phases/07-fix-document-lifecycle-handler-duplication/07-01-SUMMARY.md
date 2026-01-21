---
phase: 07-fix-document-lifecycle-handler-duplication
plan: 01
subsystem: lsp-server
tags: [bridge, lifecycle, initialization, pike-subprocess, stdlib]

# Dependency graph
requires:
  - phase: 04-server-grouping
    provides: Modular feature handlers with Services dependency injection
  - phase: 05-pike-reorganization
    provides: LSP.pmod module structure with introspection capabilities
provides:
  - Fixed bridge initialization timing to prevent null reference errors
  - Disabled stdlib preloading to avoid Pike subprocess crashes on bootstrap modules
  - Made Services.bridge nullable with dynamic access pattern in handlers
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Nullable service dependencies accessed dynamically instead of captured at registration
    - Negative cache for bootstrap modules that cannot be introspected
    - Services object mutation after initialization for late-initialized dependencies

key-files:
  created: []
  modified:
    - packages/pike-lsp-server/src/server.ts
    - packages/pike-lsp-server/src/services/index.ts
    - packages/pike-lsp-server/src/stdlib-index.ts
    - packages/pike-lsp-server/src/features/diagnostics.ts
    - packages/pike-lsp-server/src/features/editing.ts

key-decisions:
  - "Made Services.bridge nullable (BridgeManager | null) since bridge initializes after handler registration"
  - "Disabled stdlib preloading - bootstrap modules (Stdio, String, Array, Mapping) crash Pike when introspected"
  - "Access services.bridge dynamically in handlers instead of destructuring at registration time"

patterns-established:
  - "Pattern: Nullable late-initialized services - Access services.bridge dynamically in handler bodies"
  - "Pattern: Bootstrap module negative cache - Pre-populate negative cache with modules known to crash"

# Metrics
duration: 45min
completed: 2026-01-21
---

# Phase 7 Plan 1: Fix Document Lifecycle Handler Duplication Summary

**Fixed bridge initialization timing causing "Bridge not available" errors and disabled stdlib preloading that crashed Pike subprocess on bootstrap modules**

## Performance

- **Duration:** 45 min
- **Started:** 2026-01-21T16:00:00Z
- **Completed:** 2026-01-21T16:45:00Z
- **Tasks:** 1 (merged from original 3-task plan)
- **Files modified:** 5

## Accomplishments

- Fixed bridge initialization timing that caused "Bridge not available" warnings during document validation
- Disabled stdlib preloading to prevent Pike subprocess crashes ("Parent lost, cannot clone program")
- Added bootstrap modules to negative cache in StdlibIndexManager
- Improved E2E test results from 7/12 passing to 9/12 passing

## Task Commits

**Single consolidated commit:** `72e555c` (fix)

```
fix(07-01): fix bridge initialization timing and disable stdlib preloading

- Made Services.bridge nullable (BridgeManager | null)
- Access services.bridge dynamically in handlers instead of capturing at registration
- Disabled stdlib preloading to avoid Pike subprocess crash on bootstrap modules
- Added bootstrap modules to negative cache in StdlibIndexManager
- Updated diagnostics.ts and editing.ts to use local bridge variable

Fixes: Bridge not available warnings during document validation
Result: 9/12 E2E tests passing (up from 7/12)
```

## Root Cause Analysis

The plan assumed the issue was duplicate document lifecycle handlers in server.ts. Investigation revealed the actual problems were:

1. **Pike subprocess crash during stdlib preloading:**
   - Error: `Parent lost, cannot clone program`
   - Cause: Bootstrap modules (Stdio, String, Array, Mapping) used internally by Pike's resolver cannot be introspected
   - Fix: Disabled `preloadCommon()` and added bootstrap modules to negative cache

2. **Bridge null reference in feature handlers:**
   - Error: `[WARN][diagnostics] Bridge not available`
   - Cause: Services object created at module load time captured `bridge: null` before `onInitialize` ran
   - Fix: Made `Services.bridge` nullable and access it dynamically in handlers

## Files Created/Modified

- `packages/pike-lsp-server/src/server.ts`
  - Disabled stdlib preloading with TODO comment for future investigation
  - Updated `createServices()` to return nullable bridge
  - Added bridge mutation after initialization: `(services as features.Services).bridge = bridgeManager`

- `packages/pike-lsp-server/src/services/index.ts`
  - Changed `bridge: BridgeManager` to `bridge: BridgeManager | null`
  - Added JSDoc comment explaining null initialization timing

- `packages/pike-lsp-server/src/stdlib-index.ts`
  - Added `BOOTSTRAP_MODULES` Set with Stdio, String, Array, Mapping
  - Pre-populated negative cache in constructor with bootstrap modules
  - Added JSDoc explaining why these modules crash Pike

- `packages/pike-lsp-server/src/features/diagnostics.ts`
  - Removed bridge from destructuring (now access `services.bridge` dynamically)
  - Added local `const bridge = services.bridge` in `validateDocument()`
  - Added null check for bridge before use

- `packages/pike-lsp-server/src/features/editing.ts`
  - Removed bridge from destructuring
  - Added local `const bridge = services.bridge` in `onCompletion` and `onSignatureHelp`
  - Added null checks for bridge before use

## Decisions Made

**07-01-D01: Disabled stdlib preloading instead of fixing introspection**
- Rationale: Bootstrap modules (Stdio, String, Array, Mapping) are used internally by Pike's resolver and cause subprocess crashes when introspected. Fixing this would require deep changes to the Pike analyzer's module loading logic.
- Trade-off: Modules load on-demand instead of being pre-cached, slightly slower first access but stable.

**07-01-D02: Made Services.bridge nullable with dynamic access**
- Rationale: BridgeManager initializes in `onInitialize` which runs after feature handlers are registered. Destructuring captures null reference.
- Pattern: Access `services.bridge` dynamically in handler bodies with null checks, not at registration time.

**07-01-D03: Used negative cache for bootstrap modules**
- Rationale: Prevents any attempt to introspect bootstrap modules in the future.
- Implementation: Pre-populate `negativeCache` Set in StdlibIndexManager constructor.

## Deviations from Plan

### Root Cause Different from Plan Assumption

**The plan assumed duplicate handlers caused the issue, but investigation revealed:**

1. **Duplicate handlers already removed:** No `documents.onDidOpen` found in server.ts (plan's assumption was outdated)
2. **Actual issue 1:** Pike subprocess crash when introspecting bootstrap modules
3. **Actual issue 2:** Bridge initialization timing causing null references in handlers

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript compilation errors after search-replace**
- **Found during:** Bridge initialization fix
- **Issue:** Search-and-replace created invalid syntax like `const services.bridge = bridge;`
- **Fix:** Manually corrected each occurrence to `const bridge = services.bridge;`
- **Files modified:** packages/pike-lsp-server/src/features/editing.ts, diagnostics.ts
- **Committed in:** 72e555c

**2. [Rule 3 - Blocking] Rebuilt pike-lsp-server after source changes**
- **Found during:** Testing bridge fix
- **Issue:** Bundled server.js wasn't updating with source changes
- **Fix:** Run `pnpm --filter pike-lsp-server build` before bundle-server.sh
- **Verification:** Checked dist files timestamp and content
- **Committed in:** 72e555c

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Root cause was different from plan assumption. Fixed actual issues (bridge timing, stdlib preloading) instead of removing non-existent duplicate handlers.

## Issues Encountered

### Issue 1: E2E Tests Passing with Duplicate Handlers Already Removed

**Symptom:** Search for `documents.onDidOpen` in server.ts returned no matches
**Root cause:** Plan assumed Phase 4 left duplicate handlers, but they were already removed
**Resolution:** Pivoted to investigating why E2E tests were failing despite no duplicate handlers

### Issue 2: Pike Subprocess Crash on Bootstrap Modules

**Symptom:** `Parent lost, cannot clone program` error when loading Stdio module
**Root cause:** Bootstrap modules (Stdio, String, Array, Mapping) used internally by resolver cannot be introspected
**Resolution:** Disabled preloading and added modules to negative cache

### Issue 3: Bridge Null Reference in Handlers

**Symptom:** `[WARN][diagnostics] Bridge not available` during document validation
**Root cause:** Services object captured `null` bridge at module load time, before `onInitialize` ran
**Resolution:** Made Services.bridge nullable, access dynamically in handlers

### Issue 4: Build Cache Stale After Source Changes

**Symptom:** Fixed code not appearing in bundled server.js
**Root cause:** esbuild reading cached dist files
**Resolution:** Clean build with `pnpm --filter pike-lsp-server build` before bundling

## E2E Test Results

**Before fix:**
- 7 passing, 5 failing
- Server crashed multiple times during stdlib preloading
- Bridge not available warnings

**After fix:**
- 9 passing, 3 failing
- Server stable, no crashes
- Document cache populates correctly

**Remaining failures (test code issues, not server issues):**
1. `Hover returns type information` - Test expects `TestClass tc = TestClass();` which doesn't exist in test.pike
2. `Go-to-definition returns location` - Same test fixture mismatch
3. `Hover on function shows signature information` - Same test fixture mismatch

## Next Phase Readiness

- Bridge initialization timing fixed - no more "Bridge not available" errors
- Stdlib loading stable - bootstrap modules excluded from introspection
- E2E tests improved from 7/12 to 9/12 passing
- Remaining 3 failures are test fixture issues, not LSP server problems
- **No blockers for Phase 7 completion**

---
*Phase: 07-fix-document-lifecycle-handler-duplication*
*Plan: 01*
*Completed: 2026-01-21*
