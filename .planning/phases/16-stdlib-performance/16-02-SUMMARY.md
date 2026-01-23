---
phase: 16-stdlib-performance
plan: 02
subsystem: typescript-stdlib-indexing
tags: [typescript, stdlib, cache, bootstrap-modules, stdlib-index-manager]

# Dependency graph
requires:
  - phase: 16-stdlib-performance
    plan: 01
    provides: direct-object-introspection, bootstrap-guard-removed
provides:
  - StdlibIndexManager allows all stdlib modules to be loaded on-demand
  - Removed TypeScript-side bootstrap module blacklist
  - Hover on stdlib types will now work for bootstrap modules
affects: [16-03, hover-provider, code-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "On-demand stdlib loading without bootstrap restrictions"
    - "Negative cache for actual missing modules only"

key-files:
  created: []
  modified:
    - packages/pike-lsp-server/src/stdlib-index.ts

key-decisions:
  - "Bootstrap module blacklist no longer needed - Pike-side introspection works (16-01)"
  - "Keep negativeCache for modules that genuinely don't exist (not bootstrap modules)"
  - "StdlibIndexManager.loadModule() returns symbols for all stdlib modules"

patterns-established:
  - "Pattern: On-demand stdlib loading - no pre-blacklisting of modules"
  - "Pattern: Negative cache for performance - only cache actual failures"

# Metrics
duration: 7min40s
completed: 2026-01-23
---

# Phase 16 Plan 2: Remove Bootstrap Module Blacklist from StdlibIndexManager Summary

**Removed TypeScript-side bootstrap module blacklist, enabling on-demand loading of Stdio, String, Array, and Mapping for hover and documentation**

## Performance

- **Duration:** 7 min 40 s (460 seconds)
- **Started:** 2026-01-23T17:33:51Z
- **Completed:** 2026-01-23T17:41:31Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Removed `BOOTSTRAP_MODULES` readonly Set from StdlibIndexManager
- Removed pre-population loop that added bootstrap modules to negativeCache
- Preserved negativeCache functionality for actual missing modules
- Verified all bootstrap modules load successfully with symbols

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove bootstrap module blacklist from StdlibIndexManager** - `34a0f94` (feat)
2. **Task 2: Verify stdlib modules load via bridge** - Verified (no commit needed - temporary test)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `packages/pike-lsp-server/src/stdlib-index.ts` - Removed BOOTSTRAP_MODULES Set and pre-population loop

## Decisions Made

- **Blacklist no longer needed**: Since 16-01 fixed Pike-side introspection, the TypeScript-side blacklist is obsolete.
- **Keep negativeCache**: The negative cache is still useful for modules that genuinely don't exist, preventing repeated lookups.
- **On-demand loading**: All stdlib modules are now loaded on-demand through `loadModule()` without pre-blocking.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **TypeScript composite build cache issue**: The initial `tsc` build appeared to succeed but produced no output files because of stale `tsconfig.tsbuildinfo`. Resolved by removing the buildinfo file and forcing a rebuild with `tsc -b`.

## Verification Results

Test command executed:
```javascript
import { StdlibIndexManager } from '/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/dist/stdlib-index.js';
import { PikeBridge } from '/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/dist/bridge.js';

const bridge = new PikeBridge();
await bridge.start();

const manager = new StdlibIndexManager(bridge);

const testModules = ['Stdio', 'String', 'Array', 'Mapping'];
for (const mod of testModules) {
  const info = await manager.getModule(mod);
  const symbolCount = info && info.symbols ? info.symbols.size : 0;
  console.log(`${mod}: ${info ? 'loaded (' + symbolCount + ' symbols)' : 'FAILED'}`);
}

console.log('Stats:', JSON.stringify(manager.getStats(), null, 2));
```

Results:
- Stdio: loaded (80 symbols)
- String: loaded (34 symbols)
- Array: loaded (42 symbols)
- Mapping: loaded (3 symbols)
- Stats: moduleCount=4, negativeCount=0

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- StdlibIndexManager no longer blocks bootstrap modules
- Ready for 16-03: Batch stdlib preloading during workspace initialization
- No blockers or concerns

---
*Phase: 16-stdlib-performance*
*Completed: 2026-01-23*
