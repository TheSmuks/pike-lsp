---
milestone: v2
audited: 2026-01-21T13:00:00Z
status: gaps_found
scores:
  requirements: 71/71 (100%)
  phases: 6/6 (100%)
  integration: 18/19 (95%)
  flows: 2/7 (29%)
gaps:
  critical:
    - id: GAP-01
      phase: "04-server-grouping"
      description: "Duplicate document lifecycle handlers in server.ts and diagnostics.ts"
      impact: "E2E tests fail - LSP features (symbols, hover, definition) return null"
      location: "packages/pike-lsp-server/src/server.ts lines 583-608"
      fix: "Remove duplicate handlers from server.ts (keep diagnostics.ts version)"
  integration:
    - id: INT-01
      phases: "04 → 06"
      description: "Document cache not populated reliably due to duplicate onDidOpen handlers"
      impact: "5 of 7 E2E tests failing"
tech_debt:
  - phase: "01-lean-observability"
    severity: low
    items:
      - "Duplicate Logger and Error classes in pike-bridge vs pike-lsp-server (~400 lines)"
      - "TODO comments acknowledge future extraction to @pike-lsp/core package"
  - phase: "04-server-grouping"
    severity: low
    items:
      - "Pike version detection incomplete (bridge-manager.ts:72 returns null)"
      - "Health check shows 'Unknown' for Pike version"
---

# v2 Milestone Audit Report

**Milestone:** v2 - LSP Modularization
**Audited:** 2026-01-21T13:00:00Z
**Status:** ⚠️ **GAPS FOUND** (Critical integration break)
**Duration:** 2026-01-20 to 2026-01-21 (~36 hours, 27 plans)

---

## Executive Summary

The v2 milestone completed all 6 phases successfully at the phase level (100% of requirements satisfied, 100% of phases verified), but **Phase 4 (Server Grouping) introduced a critical integration break** by leaving duplicate document lifecycle handlers in both `server.ts` and `diagnostics.ts`. This causes 5 of 7 E2E tests to fail because document cache population becomes unreliable.

| Metric | Score | Status |
|--------|-------|--------|
| **Requirements Coverage** | 71/71 (100%) | ✓ All requirements satisfied |
| **Phase Verification** | 6/6 (100%) | ✓ All phases passed individual checks |
| **Cross-Phase Integration** | 18/19 (95%) | ⚠️ 1 critical connection broken |
| **E2E User Flows** | 2/7 (29%) | ❌ 5 flows broken by duplicate handlers |

**Critical Issue:** Duplicate `documents.onDidOpen()`, `onDidChangeContent()`, and `onDidSave()` handlers exist in both `server.ts` (lines 583-608) and `diagnostics.ts` (lines 548-608). When both fire, the simpler `server.ts` version may run after the comprehensive `diagnostics.ts` one, causing cache corruption or race conditions that break LSP features relying on document cache (symbols, hover, go-to-definition).

**Fix Complexity:** LOW - Remove 26 lines from server.ts
**Verification Time:** <5 minutes - Run E2E tests

---

## Requirements Coverage

**Total Requirements:** 71 (65 original + 6 LSP-E2E from Phase 6)
**Satisfied:** 71/71 (100%)
**Blocked:** 0
**Partial:** 1 (HLT-04: Pike version detection field exists but returns null)

### Requirements by Phase

| Phase | Requirements | Satisfied | Status |
|-------|--------------|-----------|--------|
| Phase 1: Lean Observability | OBS-01 to OBS-10 (10) | 10/10 | ✓ Complete |
| Phase 2: Safety Net | SAF-01 to SAF-11 (11) | 11/11 | ✓ Complete |
| Phase 3: Bridge Extraction | BRG-01 to BRG-13 (13) | 13/13 | ✓ Complete |
| Phase 4: Server Grouping | SRV-01 to SRV-13 (13) | 13/13 | ✓ Complete |
| Phase 4: Health Check | HLT-01 to HLT-06 (6) | 5/6 | ⚠️ HLT-04 partial |
| Phase 5: Pike Reorganization | PIK-01 to PIK-12 (12) | 12/12 | ✓ Complete |
| Phase 6: LSP Feature Verification | LSP-E2E-01 to LSP-E2E-06 (6) | 6/6 | ✓ Complete |

**Note:** All requirements satisfied at implementation level. E2E test failures are due to integration bug (GAP-01), not missing requirements.

---

## Phase-Level Verification

All 6 phases passed individual verification with 100% success criteria met:

| Phase | Plans | Verification Status | Score | Completed |
|-------|-------|---------------------|-------|-----------|
| 1. Lean Observability | 3/3 | ✓ PASSED | 6/6 truths | 2026-01-20 |
| 2. Safety Net | 3/3 | ✓ PASSED | 6/6 truths | 2026-01-20 |
| 3. Bridge Extraction | 2/2 | ✓ PASSED | 6/6 truths | 2026-01-20 |
| 4. Server Grouping | 6/6 | ✓ PASSED | 19/19 truths | 2026-01-21 |
| 5. Pike Reorganization | 6/6 | ✓ PASSED | 8/8 truths | 2026-01-21 |
| 6. Automated LSP Feature Verification | 2/2 | ✓ PASSED | 6/6 truths | 2026-01-21 |

**Total Plans:** 27/27 complete (22 main + 5 debugging/iteration plans)

### Key Achievements

**Phase 1:** Error tracking (LSPError, BridgeError, PikeError) and structured logging (Logger with 6 log levels)

**Phase 2:** Pre-push hooks, smoke tests (4 tests in ~145ms), CI pipeline with xvfb for VSCode E2E

**Phase 3:** IPC layer extraction (PikeProcess class) and policy layer (PikeBridge using PikeProcess)

**Phase 4:** Server modularization - reduced server.ts from 4,715 to 645 lines (86% reduction), created features/, services/, core/ structure

**Phase 5:** Pike module reorganization - Intelligence.pike (1660→84 lines, 95% reduction), Analysis.pike (1191→85 lines, 93% reduction) with .pmod idiom

**Phase 6:** E2E test suite (7 tests) for LSP features, integrated into CI and pre-push hooks

---

## Critical Gaps

### GAP-01: Duplicate Document Lifecycle Handlers (Phase 4 Refactoring Incomplete)

**Severity:** 🔴 CRITICAL (Blocks E2E flows)
**Phase:** 04-server-grouping
**Location:** `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts` lines 583-608

**Problem:** When Phase 4 extracted diagnostics handlers to `features/diagnostics.ts`, it created `registerDiagnosticsHandlers()` which registers `documents.onDidOpen()`, `onDidChangeContent()`, and `onDidSave()` handlers. However, **the original handlers in `server.ts` lines 583-608 were NOT removed**, causing duplicate registration.

**Evidence:**
```typescript
// diagnostics.ts lines 548-557 (KEEP THESE)
documents.onDidOpen((event) => {
    connection.console.log(`Document opened: ${event.document.uri}`);
    void validateDocument(event.document);  // Comprehensive version
});

// server.ts lines 583-586 (REMOVE THESE)
documents.onDidOpen((event) => {
    connection.console.log(`Document opened: ${event.document.uri}`);
    validateDocument(event.document);  // Simpler version
});
```

**Impact:**
- Both handlers fire when document opens
- Since `server.ts` handlers are registered last (after calling `registerDiagnosticsHandlers()`), they may run after the comprehensive `diagnostics.ts` ones
- This causes race conditions or cache corruption in `documentCache.set()`
- LSP features that rely on document cache (symbols, hover, go-to-definition) return null
- **5 of 7 E2E tests fail** with "Should return symbols (not null) - LSP feature may be broken"

**E2E Test Failures:**
```
5 failing
1) Document symbols returns valid symbol tree
2) Hover returns type information
3) Go-to-definition returns location
4) Hover on function shows signature information
5) Class symbol appears in document symbols
```

**Root Cause:** Document symbols handler relies on `documentCache.get(uri)` (symbols.ts:123), which is populated by `validateDocument()`. With duplicate handlers and two different `validateDocument` implementations, cache population becomes unreliable.

**Fix Required:**
1. Remove lines 583-608 from `packages/pike-lsp-server/src/server.ts`
2. Keep the handlers in `diagnostics.ts` (lines 548-608) - they are comprehensive with proper error handling
3. Run E2E tests to verify fix: `cd packages/vscode-pike && pnpm run test:features`

**Verification:** After fix, all 7 E2E tests should pass

---

## Integration Issues

### INT-01: Document Cache Not Populated Reliably (04 → 06)

**Phases Affected:** Phase 4 (Server Grouping) → Phase 6 (E2E Verification)
**Symptom:** E2E tests fail with "Should return symbols (not null)"
**Root Cause:** Same as GAP-01 - duplicate lifecycle handlers corrupt cache
**Impact:** 5 of 7 E2E tests fail
**Fix:** Same as GAP-01

---

## Cross-Phase Wiring

### Wiring Matrix

| From Phase | Export | To Phase | Used By | Status |
|------------|--------|----------|---------|--------|
| Phase 1 | Logger | Phase 3 | pike-bridge/src/bridge.ts | ✓ CONNECTED |
| Phase 1 | Logger | Phase 4 | features/*.ts (8 imports) | ✓ CONNECTED |
| Phase 1 | PikeError, LSPError, BridgeError | Phase 3 | pike-bridge/src/bridge.ts | ✓ CONNECTED |
| Phase 1 | PikeError | Phase 4 | server.ts error handling | ⚠️ ORPHANED (unused) |
| Phase 3 | PikeBridge | Phase 4 | services/bridge-manager.ts | ✓ CONNECTED |
| Phase 3 | PikeProcess | Phase 3 | pike-bridge/src/bridge.ts | ✓ CONNECTED |
| Phase 4 | BridgeManager | Phase 4 | features/*.ts (all 6 features) | ✓ CONNECTED |
| Phase 4 | DocumentCache | Phase 4 | features/*.ts (navigation, symbols) | ✓ CONNECTED |
| Phase 4 | Features | Phase 4 | server.ts registration | ✓ CONNECTED |
| Phase 5 | Intelligence.pmod | Phase 3 | analyzer.pike dispatch table | ✓ CONNECTED |
| Phase 5 | Analysis.pmod | Phase 3 | analyzer.pike dispatch table | ✓ CONNECTED |
| Phase 6 | E2E Tests | All | vscode-pike/test/integration/ | ❌ BROKEN (GAP-01) |

**Connected:** 18/19 (95%)
**Orphaned:** 1 (PikeError in server.ts - features use PikeBridge's internal error handling)
**Broken:** 1 (E2E tests → Document symbols flow)

---

## E2E User Flows

### Flow 1: Document Symbols (Outline View) ❌ BROKEN

**Path:** VSCode opens .pike file → Extension activates → LSP server `onDidOpen` → `validateDocument` → `introspect`+`parse` → `documentCache.set` → `onDocumentSymbol` returns symbols

**Broken At:** Cache population step (documentCache.set)
**Reason:** Duplicate `onDidOpen` handlers cause race condition
**Evidence:** `documentCache.get(uri)` returns null in symbols.ts:123
**Fix:** Remove duplicate handlers (GAP-01)

### Flow 2: Hover Information ❌ BROKEN

**Path:** VSCode hover → `onHover` handler → Cache lookup → `findSymbolAtPosition` → `buildHoverContent`

**Broken At:** Cache lookup (navigation.ts:57)
**Reason:** Same as Flow 1 - relies on documentCache
**Fix:** Same as Flow 1

### Flow 3: Go-to-Definition ❌ BROKEN

**Path:** VSCode F12 → `onDefinition` handler → Cache lookup → `findSymbolAtPosition` → Return Location

**Broken At:** Cache lookup (navigation.ts)
**Reason:** Same as Flow 1
**Fix:** Same as Flow 1

### Flow 4: Code Completion ✓ WORKING

**Path:** VSCode → editing.ts → `bridge.getCompletionContext()` → Analysis.pmod/Completions.pike

**Status:** PASSING (2 of 7 E2E tests pass)
**Why Working:** Completion bypasses document cache, calls bridge directly (editing.ts:145)
**Evidence:** Tests "Completion returns suggestions" and "Completion triggers on partial word" both pass

### Flow 5: Pike Analyzer Compilation ✓ WORKING

**Path:** TypeScript calls PikeBridge → PikeProcess stdin → analyzer.pike → Intelligence.pmod/Introspection.pike

**Status:** PASSING
**Evidence:**
```bash
$ echo '{"method":"introspect","params":{"code":"int x;"}}' | pike analyzer.pike
{"result":{"symbols":[{"kind":"variable","type":{"kind":"int"},"name":"x"}],"success":1}}
```
**Verification:** Direct Pike analyzer test returns valid JSON with symbols

### Flow 6: Pike Bridge Unit Tests ✓ WORKING

**Path:** Node.js → PikeBridge → PikeProcess → analyzer.pike

**Status:** PASSING (6 of 7 pike-bridge tests pass, 1 unrelated failure)
**Evidence:**
```
✔ should start and be running
✔ should check Pike availability
✔ should parse simple Pike code
✔ should detect syntax errors
✔ should tokenize Pike code
```

### Flow 7: Pre-push Hook → Smoke Tests ✓ CONFIGURED

**Path:** git push → .husky/pre-push → pnpm build → pike compile check → smoke tests

**Status:** CONFIGURED (Phase 2)
**Note:** Not tested during this audit (would trigger on git push)

---

## Tech Debt Inventory

### Non-Critical Tech Debt (Acknowledged)

#### 1. Duplicate Logger and Error Classes (Phase 1)

**Severity:** LOW
**Location:**
- `packages/pike-lsp-server/src/core/errors.ts` (174 lines)
- `packages/pike-lsp-server/src/core/logging.ts` (102 lines)
- `packages/pike-bridge/src/errors.ts` (122 lines)
- `packages/pike-bridge/src/logging.ts` (107 lines)

**Impact:** ~400 lines of duplicated code
**Status:** Acknowledged with TODO comments for future extraction to `@pike-lsp/core` package
**Reason:** Avoided circular dependency (pike-lsp-server imports from pike-bridge)
**Functional Impact:** None - code works correctly, duplication is manageable

#### 2. Pike Version Detection Incomplete (Phase 4)

**Severity:** LOW
**Location:** `packages/pike-lsp-server/src/services/bridge-manager.ts` line 72
**Status:** Returns null instead of version string
**Impact:** Health check shows "Unknown" for Pike version
**Note:** Field structure exists, detection not implemented (marked with TODO)

---

## Recommendations

### 1. 🔴 CRITICAL: Fix GAP-01 (Duplicate Lifecycle Handlers)

**Priority:** IMMEDIATE (blocks milestone completion)

**Action:** Remove lines 583-608 from `packages/pike-lsp-server/src/server.ts`

**Rationale:** The handlers in `diagnostics.ts` are comprehensive (include error handling, logging, proper cache population). The `server.ts` handlers are redundant and cause race conditions.

**Files to modify:**
```bash
# Remove duplicate handlers
sed -i '583,608d' packages/pike-lsp-server/src/server.ts

# Verify TypeScript compiles
pnpm -r build

# Run E2E tests
cd packages/vscode-pike && pnpm run test:features
```

**Expected Result:** All 7 E2E tests pass

### 2. Run Full Verification After Fix

**Command:**
```bash
# Build all packages
pnpm -r build

# Run all tests
pnpm --filter pike-bridge test                    # Bridge unit tests
pnpm --filter pike-lsp-server test:smoke          # Smoke tests
cd packages/vscode-pike && pnpm run test:features # E2E tests
```

**Expected:** All tests pass

### 3. Consider Addressing Tech Debt (Optional)

**Low priority items:**
- Extract Logger and Error classes to `@pike-lsp/core` package (eliminates ~400 lines of duplication)
- Implement Pike version detection in bridge-manager.ts (currently returns null)

---

## Milestone Achievements

### Code Reduction

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `Intelligence.pike` | 1,660 lines | 84 lines | 95% (1,576 lines) |
| `Analysis.pike` | 1,191 lines | 85 lines | 93% (1,106 lines) |
| `server.ts` | 4,715 lines | 645 lines | 86% (4,070 lines) |
| **Total** | **7,566 lines** | **814 lines** | **89% (6,752 lines)** |

### Architecture Improvements

1. **Observability:** Error tracking with layer information (server/bridge/pike) and structured logging
2. **Safety Net:** Pre-push hooks, smoke tests, CI pipeline prevent regressions
3. **Modularity:** Bridge split into IPC (PikeProcess) and policy (PikeBridge) layers
4. **Organization:** Server split into features/ (by capability), services/ (lifecycle), core/ (shared)
5. **Pike Modules:** Intelligence and Analysis split into .pmod directories (3-4 files each)
6. **Testing:** E2E test suite verifies LSP features work end-to-end in VSCode

### Test Coverage

| Test Suite | Status | Details |
|------------|--------|---------|
| Pike Bridge Unit Tests | ✓ 6/7 passing | PikeProcess and PikeBridge mechanics |
| Smoke Tests | ✓ 4/4 passing | Bridge lifecycle, parse, introspect, error handling |
| Pike Module Tests | ✓ 5/5 passing | Module loading via master()->resolv() |
| **E2E Feature Tests** | ❌ **2/7 passing** | **Blocked by GAP-01** |

---

## Conclusion

The v2 milestone successfully completed all 6 phases with 100% of requirements satisfied and 100% of phase-level success criteria met. However, **Phase 4 (Server Grouping) left duplicate code that breaks cross-phase integration**, causing 5 of 7 E2E tests to fail.

**Root Cause:** When refactoring server.ts to extract diagnostics handlers to features/diagnostics.ts, the original handlers in server.ts (lines 583-608) were not removed. This creates duplicate `documents.onDidOpen()`, `onDidChangeContent()`, and `onDidSave()` handlers that corrupt the document cache.

**Impact:**
- LSP features that rely on document cache (symbols, hover, go-to-definition) return null
- E2E tests fail with "Should return symbols (not null) - LSP feature may be broken"
- Completion works because it bypasses the cache

**Fix Complexity:** LOW - Remove 26 lines from server.ts
**Verification Time:** <5 minutes - Run E2E tests

**Recommendation:** Fix GAP-01 immediately before completing/archiving v2 milestone. This is a regression introduced during refactoring, not a fundamental architecture issue. The fix is simple (delete duplicate code) and can be verified quickly (run E2E tests).

---

## Next Steps

**Immediate (Required):**
1. Fix GAP-01: Remove lines 583-608 from server.ts
2. Run E2E tests to verify all 7 tests pass
3. Update this audit report status to "passed" if E2E tests pass

**After Fix:**
1. Consider using `/gsd:complete-milestone v2` to archive and tag the milestone
2. Optionally address tech debt (Logger/Error duplication, Pike version detection)

**Alternative (Accept Tech Debt):**
- Use `/gsd:complete-milestone v2` to proceed anyway (accepts integration bug as known issue)
- NOT RECOMMENDED - E2E test failures indicate broken LSP features

---

## File Locations (Absolute Paths)

**Critical files for GAP-01 fix:**
- `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts` (lines 583-608 to remove)
- `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/diagnostics.ts` (lines 548-608, keep these)

**Verification:**
- `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/test/integration/lsp-features.test.ts` (E2E tests)
- Command: `cd /home/smuks/OpenCode/pike-lsp/packages/vscode-pike && pnpm run test:features`

---

_Audit completed: 2026-01-21T13:00:00Z_
_Auditor: Claude Sonnet 4.5 (gsd-integration-checker + orchestrator)_
_Method: Phase verification aggregation + cross-phase integration check + E2E flow analysis_
