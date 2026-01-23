---
phase: 12-request-consolidation
plan: 04
subsystem: [diagnostics, typescript-lsp]
tags: [typescript, lsp, diagnostics, analyze, performance, ipc]

# Dependency graph
requires:
  - phase: 12-02
    provides: TypeScript analyze client with AnalyzeRequest/AnalyzeResponse types
provides:
  - Validation pipeline using single analyze() call
  - Response structure fix for analyze requests with failures
affects: [12-05, performance-optimization]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified-analyze-validation, partial-failure-handling, single-call-ipc]

key-files:
  created: []
  modified:
    - packages/pike-lsp-server/src/features/diagnostics.ts
    - packages/pike-bridge/src/bridge.ts
    - tsconfig.json

key-decisions:
  - "Single analyze() call replaces introspect(), parse(), analyzeUninitialized()"
  - "Partial failure handling with fallback defaults for each result type"
  - "Return full AnalyzeResponse structure (result + failures + _perf) from bridge"

patterns-established:
  - "Pattern: Single-call validation - 1 Pike IPC instead of 3 per document change"
  - "Pattern: Partial failure resilience - validation continues with degraded results"

# Metrics
duration: 25min
completed: 2026-01-23
---

# Phase 12 Plan 04: Validation Pipeline Consolidation Summary

**Rewrite validateDocument() to use single analyze() call instead of 3 separate calls**

## Performance

- **Duration:** 25 min
- **Started:** 2026-01-23T00:17:00Z
- **Completed:** 2026-01-23T00:42:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Replaced 3 separate Pike calls (introspect, parse, analyzeUninitialized) with single analyze() call
- Added partial failure handling with fallback values for each result type
- Added logging to verify single-call optimization during validation
- Fixed bridge response structure to return full AnalyzeResponse with failures
- Fixed tsconfig.json to remove non-existent pike-analyzer reference

## Task Commits

Each task was committed atomically:

1. **feat(12-04): replace 3 Pike calls with single analyze() in validateDocument** - `1ec0f9c`
2. **fix(12-04): return full analyze response structure with failures** - `f7cc5f4`
3. **fix(12-04): remove non-existent pike-analyzer reference from tsconfig** - `8df0d7e`

## Files Created/Modified

- `packages/pike-lsp-server/src/features/diagnostics.ts`
  - Replaced introspect(), parse(), analyzeUninitialized() with analyze(text, ['parse', 'introspect', 'diagnostics'], filename)
  - Added partial failure handling with fallback defaults for each result type
  - Added logging: "Calling unified analyze", "Analyze completed - parse/introspect/diagnostics", "Partial failures"
  - Updated all result processing to use consolidated analyze response data

- `packages/pike-bridge/src/bridge.ts`
  - Fixed handleResponse() to return full AnalyzeResponse structure for analyze requests
  - Detects analyze responses by presence of 'failures' property
  - Returns { result, failures, _perf } structure matching AnalyzeResponse type

- `tsconfig.json`
  - Removed reference to non-existent pike-analyzer package
  - Fixes TypeScript compilation errors

## Deviations from Plan

### Rule 1 - Bug: Bridge response structure missing failures

**Found during:** Task 1 verification
**Issue:** PikeBridge.handleResponse() only returned response.result, not the full response structure with failures
**Impact:** TypeScript code received data in wrong structure - analyzeResult.result.parse was undefined
**Fix:** Updated handleResponse() to detect analyze requests and return full { result, failures, _perf } structure
**Files modified:** packages/pike-bridge/src/bridge.ts
**Commit:** `f7cc5f4`

### Rule 1 - Bug: Syntax error in diagnostics.ts

**Found during:** TypeScript compilation after initial changes
**Issue:** Missing closing brace in diagnostics.push() for uninitialized variable diagnostic
**Impact:** TypeScript compilation failed with "Unexpected token" error
**Fix:** Added missing closing brace in range definition
**Files modified:** packages/pike-lsp-server/src/features/diagnostics.ts
**Commit:** Part of `1ec0f9c`

### Rule 3 - Blocking: Non-existent pike-analyzer package reference

**Found during:** TypeScript compilation
**Issue:** tsconfig.json referenced packages/pike-analyzer which doesn't exist
**Impact:** "File not found" errors prevented compilation
**Fix:** Removed pike-analyzer reference from tsconfig.json
**Files modified:** tsconfig.json
**Commit:** `8df0d7e`

## Verification

E2E tests pass with single-call optimization:
- Document symbols returns valid symbol tree
- Hover returns type information
- Go-to-definition returns location
- Completion returns suggestions
- All LSP features still functional after consolidation

Connection console logs confirm optimization:
```
[VALIDATE] Calling unified analyze for: /path/to/file.pike
[VALIDATE] Analyze completed - parse: true, introspect: true, diagnostics: true
```

## Performance Impact

**Before:** 3 Pike IPC calls per document validation
- introspect() - compilation + introspection
- parse() - parsing for positions
- analyzeUninitialized() - uninitialized variable analysis

**After:** 1 Pike IPC call per document validation
- analyze() with include=['parse', 'introspect', 'diagnostics']
- Pike consolidates compilation, tokenization, analysis internally
- ~66% reduction in IPC overhead during validation

## Next Phase Readiness

- Validation pipeline uses single analyze() call
- Partial failure handling ensures robustness
- Performance foundation laid for further consolidation
- Ready for Phase 12-05: Additional feature handler migration

---
*Phase: 12-request-consolidation*
*Completed: 2026-01-23*
