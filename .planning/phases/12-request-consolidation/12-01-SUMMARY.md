---
phase: 12-request-consolidation
plan: 01
subsystem: [pike-analysis]
tags: [pike, lsp, json-rpc, analysis, introspection, tokenization]

# Dependency graph
requires:
  - phase: 11-startup-optimization
    provides: Pike subprocess optimization, Context creation patterns
provides:
  - handle_analyze() method for consolidated Pike analysis
  - Unified compilation and tokenization sharing
  - Partial success response structure (result/failures)
  - Performance timing metadata (_perf.compilation_ms, _perf.tokenization_ms)
affects: [12-02, 12-03, validation-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [consolidated-analysis, partial-success-response, shared-operations]

key-files:
  created: []
  modified:
    - pike-scripts/analyzer.pike
    - pike-scripts/LSP.pmod/Analysis.pmod/module.pmod
    - pike-scripts/LSP.pmod/Intelligence.pmod/module.pmod
    - pike-scripts/LSP.pmod/Intelligence.pike

key-decisions:
  - "Use master()->resolv(\"LSP.Intelligence.Intelligence\") pattern to access class from module"
  - "Made introspect_program() public in Intelligence module for cross-module access"
  - "Performance timing via System.Timer() for compilation_ms and tokenization_ms"
  - "Partial success: each result type appears in either result OR failures, never both"

patterns-established:
  - "Pattern: Consolidated analysis - single compilation/tokenization shared across multiple result types"
  - "Pattern: Partial success structure - failures map mirrors result map structure"
  - "Pattern: Double-name module resolution - LSP.ModuleName.ClassName for pmod classes"

# Metrics
duration: 53min
completed: 2026-01-22
---

# Phase 12 Plan 01: Unified Analyze Handler Summary

**handle_analyze() method consolidates compilation, tokenization, and analysis into single Pike request with partial success support**

## Performance

- **Duration:** 53 min
- **Started:** 2026-01-22T21:25:06Z
- **Completed:** 2026-01-22T22:18:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented `handle_analyze()` method in Analysis.pmod that consolidates compilation, tokenization, and analysis
- Single compilation and tokenization shared across parse, introspect, diagnostics, and tokenize result types
- Partial success support: each requested type appears in either `result` or `failures`, never both
- Performance metadata (`_perf.compilation_ms`, `_perf.tokenization_ms`) included in responses

## Task Commits

Each task was committed atomically:

1. **Task 1: Add handle_analyze method to Analysis.pike** - `4fca18f` (feat)
2. **Task 2: Add performance timing to handle_analyze** - `4fca18f` (feat - included in Task 1)

**Plan metadata:** (to be added after metadata commit)

_Note: Tasks 1 and 2 were implemented together in a single commit since performance timing was integral to the handler design._

## Files Created/Modified

- `pike-scripts/analyzer.pike` - Added `analyze` method to HANDLERS dispatch table
- `pike-scripts/LSP.pmod/Analysis.pmod/module.pmod` - Added `handle_analyze()` method with shared operations
- `pike-scripts/LSP.pmod/Intelligence.pmod/module.pmod` - Added `introspect_program()` public delegating method
- `pike-scripts/LSP.pmod/Intelligence.pike` - Changed `introspect_program()` from protected to public
- `pike-scripts/LSP.pmod/Analysis.pike` - Cleaned up (removed duplicate handle_analyze implementation)

## Decisions Made

- **Double-name resolution pattern**: Use `master()->resolv("LSP.Intelligence.Intelligence")` to access the Intelligence class from within the Intelligence.pmod directory. This is necessary because Pike's module resolution returns the pmod directory when you resolve "LSP.Intelligence", not the class within it.

- **Public introspect_program()**: Made `introspect_program()` public (changed from protected) in both Intelligence.pike and Intelligence.pmod/Introspection.pike to allow cross-module calls from Analysis.pike.

- **Performance timing placement**: `_perf` metadata is placed at the result level (not top-level) to match the existing pattern from introspect handler.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Issue: "Cannot call undefined lfun" when calling intelligence->introspect_program**

- **Problem:** Initially used `master()->resolv("LSP.Intelligence")` which returns the pmod directory/module, not the Intelligence class. Calling `introspect_program()` on the module failed.
- **Solution:** Changed to use the double-name pattern `master()->resolv("LSP.Intelligence.Intelligence")` which resolves to the actual class, then instantiate it.
- **Verification:** After fix, introspect results were successfully included in analyze response.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `analyze` method ready for TypeScript client integration
- Response structure matches CONTEXT.md spec (result/failures separation)
- Performance timing available for performance regression detection
- Ready for Phase 12-02: TypeScript client integration

---
*Phase: 12-request-consolidation*
*Completed: 2026-01-22*
