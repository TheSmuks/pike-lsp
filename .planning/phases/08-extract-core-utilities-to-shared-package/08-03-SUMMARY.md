---
phase: 08-extract-core-utilities-to-shared-package
plan: 03
subsystem: shared-utilities
tags: [typescript, logger, error-handling, workspace-dependencies, code-deduplication]

# Dependency graph
requires:
  - phase: 08-extract-core-utilities-to-shared-package
    plan: 08-02
    provides: @pike-lsp/core package with Logger and Error classes, pike-bridge migration pattern
provides:
  - pike-lsp-server package consumes @pike-lsp/core for shared utilities
  - Code duplication eliminated (errors.ts, logging.ts removed from pike-lsp-server)
  - All packages now use shared Logger and Error classes from @pike-lsp/core
affects: Future packages can follow this pattern for shared utilities

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Workspace dependency consumption pattern
    - Re-export pattern for server-specific types while using shared utilities

key-files:
  created: []
  modified:
    - packages/pike-lsp-server/package.json
    - packages/pike-lsp-server/src/core/index.ts
    - packages/pike-lsp-server/src/server.ts
    - packages/pike-lsp-server/src/features/*.ts
    - packages/pike-lsp-server/src/services/*.ts
    - packages/core/src/errors.ts
  deleted:
    - packages/pike-lsp-server/src/core/errors.ts
    - packages/pike-lsp-server/src/core/logging.ts

key-decisions:
  - "08-03-D01: Keep PikeSettings and DocumentCacheEntry in pike-lsp-server - these are server-specific types with dependencies on server constants"
  - "08-03-D02: Re-export from @pike-lsp/core in pike-lsp-server/core/index.ts for unified imports"

patterns-established:
  - "Workspace packages use 'workspace:*' protocol for dependencies"
  - "Re-export shared utilities from package index for consumer convenience"
  - "Server-specific types remain in server package while using shared utilities"

# Metrics
duration: 4min
completed: 2026-01-21
---

# Phase 8: Plan 3 - Migrate pike-lsp-server to @pike-lsp/core Summary

**pike-lsp-server now consumes Logger, LSPError, BridgeError, and PikeError from @pike-lsp/core, eliminating 278 lines of duplicate code**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-21T18:46:44Z
- **Completed:** 2026-01-21T18:50:20Z
- **Tasks:** 3
- **Files modified:** 11 (8 modified, 2 deleted, 1 package.json)

## Accomplishments

- Added @pike-lsp/core workspace dependency to pike-lsp-server
- Updated all Logger imports across 8 files to use @pike-lsp/core
- Updated core/index.ts to re-export from @pike-lsp/core
- Added missing BridgeError class to @pike-lsp/core package
- Deleted duplicate files: errors.ts (175 lines), logging.ts (103 lines)
- Verified LSP functionality with E2E tests (7/7 passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add workspace dependency on @pike-lsp/core** - `f8960e4` (feat)
2. **Task 2: Update pike-lsp-server to use @pike-lsp/core utilities** - `5921c37` (feat)
3. **Task 3: Remove duplicate error and logging files** - `e700168` (feat)

## Files Created/Modified

- `packages/pike-lsp-server/package.json` - Added @pike-lsp/core workspace dependency
- `packages/pike-lsp-server/src/core/index.ts` - Re-exports from @pike-lsp/core, keeps server-specific types
- `packages/pike-lsp-server/src/server.ts` - Logger import from @pike-lsp/core
- `packages/pike-lsp-server/src/features/diagnostics.ts` - Logger import from @pike-lsp/core
- `packages/pike-lsp-server/src/features/symbols.ts` - Logger import from @pike-lsp/core
- `packages/pike-lsp-server/src/features/advanced.ts` - Logger import from @pike-lsp/core
- `packages/pike-lsp-server/src/features/hierarchy.ts` - Logger import from @pike-lsp/core
- `packages/pike-lsp-server/src/features/navigation.ts` - Logger import from @pike-lsp/core
- `packages/pike-lsp-server/src/services/index.ts` - Logger type import from @pike-lsp/core
- `packages/pike-lsp-server/src/services/bridge-manager.ts` - Logger type import from @pike-lsp/core
- `packages/core/src/errors.ts` - Added BridgeError class (was missing)
- `packages/pike-lsp-server/src/core/errors.ts` - DELETED (now uses @pike-lsp/core)
- `packages/pike-lsp-server/src/core/logging.ts` - DELETED (now uses @pike-lsp/core)

## Decisions Made

- **08-03-D01: Keep PikeSettings and DocumentCacheEntry in pike-lsp-server** - These types have dependencies on server-specific constants (DEFAULT_MAX_PROBLEMS, DIAGNOSTIC_DELAY_DEFAULT) and the PikeSymbol type from @pike-lsp/pike-bridge, making them inappropriate for the shared @pike-lsp/core package.

- **08-03-D02: Re-export pattern in core/index.ts** - The pike-lsp-server/core/index.ts re-exports from @pike-lsp/core while also exporting server-specific types, providing a unified import interface for internal consumers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added BridgeError to @pike-lsp/core package**
- **Found during:** Task 2 (Update imports in server package)
- **Issue:** The @pike-lsp/core package was missing the BridgeError class. The original plan 08-01 only extracted LSPError and PikeError, but pike-lsp-server had BridgeError which was being used internally.
- **Fix:** Added BridgeError class to packages/core/src/errors.ts with proper layer='bridge' and constructor matching the pattern used by PikeError.
- **Files modified:** packages/core/src/errors.ts
- **Verification:** Build succeeded, E2E tests pass
- **Committed in:** 5921c37 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The addition of BridgeError to @pike-lsp/core was necessary for the extraction to work correctly. It completes the error class hierarchy (LSPError base, BridgeError, PikeError) and aligns with the original design intent of shared error handling.

## Issues Encountered

- **Build error: Module '"@pike-lsp/core"' has no exported member 'BridgeError'** - The core package was created in 08-01 but only included LSPError and PikeError. I added BridgeError following the established pattern to complete the error class hierarchy.

## Authentication Gates

None encountered.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8 (Core Utility Extraction) is now COMPLETE
- All duplicate Logger and Error code has been eliminated:
  - @pike-lsp/core: single source of truth
  - pike-bridge: consumes @pike-lsp/core (completed in 08-02)
  - pike-lsp-server: consumes @pike-lsp/core (completed in 08-03)
- Total lines of duplicate code eliminated: ~512 (234 from pike-bridge + 278 from pike-lsp-server)
- Project architecture reflects leaf-package utility sharing pattern
- Ready to proceed to Phase 9 or next milestone

---
*Phase: 08-extract-core-utilities-to-shared-package*
*Completed: 2026-01-21*
