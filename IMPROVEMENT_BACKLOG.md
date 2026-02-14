# Improvement Backlog

## Critical (broken functionality)
- [x] **P0: Fix diagnostics-provider tests** - FIXED by worker-1. Mock infrastructure now properly implements triggerOnDidOpen, sendDiagnostics, etc.

## High (blocking/stale work)
- [x] **PR #28** - CLOSED but work was NOT lost. PR #31 (same branch) merged 18 minutes later. All Roxen features present.
- [x] **PR #30** - FIXED by worker-3. CI now passing.

## Medium (improvements)
- [x] **Audit Roxen features** - COMPLETED (worker-4). All Roxen features from PR #28 were delivered via PR #31.
- [ ] **Convert remaining placeholder tests** - IN PROGRESS. Test quality: 97% real (75 placeholders remaining)
  - [x] Tier 1 providers (hover, completion, definition, references, document-symbol) - 0 placeholders
  - [x] Diagnostics provider - 43 placeholders converted (PR #34)
  - [x] Selection ranges provider - 31 placeholders converted (PR #36)
  - [x] Call hierarchy provider - 15 placeholders converted (PR #38)
  - [x] Document links provider - 8 placeholders converted (PR #41)
  - [x] Type hierarchy provider - 34 placeholders converted (PR #43, PR #45, PR #47)
  - [x] Workspace scanner - 5 placeholders converted (PR #50)
  - [x] Formatting provider - 41 placeholders converted (PR #51)
  - [x] Workspace symbol provider - 25 placeholders converted (PR #52)
  - [ ] Remaining files need bridge/handler infrastructure

## Low (nice to have)
- [x] **LSP Feature Coverage Audit** - COMPLETED (worker-3, 2026-02-14). All LSP 3.17 features implemented.
- [ ] **Performance improvements**
- [ ] **Pike Source E2E Testing** - Add tests against real stdlib modules (/usr/local/pike/8.0.1116/lib/modules/)

---

## Audit Findings (2026-02-14)

### Code TODOs Found
| File | Line | TODO | Estimate |
|------|------|------|----------|
| `packages/pike-bridge/src/corpus.test.ts` | 395 | Categorize false positives and tighten assertion | 2-4h |
| `packages/pike-lsp-server/src/tests/pike-analyzer/compatibility.test.ts` | 475 | Implement compatibility.handleMissingModule() | 1-2h |

### Coverage Gaps Identified
| Area | File/Line | Gap | Impact | Estimate |
|-------|------------|-----|--------|----------|
| Cross-file cycle detection | `features/hierarchy.ts:561,628,669` | NOT IMPLEMENTED | Call/type hierarchy single-file only | 8-16h |
| Chained access completion | `tests/editing/completion-provider.test.ts:869` | Type resolution not implemented | `a.b.c` completion incomplete | 4-8h |
| Import/inherit symbols | `tests/import-inherit-resolution.test.ts:406,558,559` | Missing: symbols, LocalMod, cached lookup | Module info incomplete | 6-12h |

### LSP Feature Coverage
**Status:** COMPLETE - All LSP 3.17 features implemented
- 21 standard capabilities fully registered
- No gaps in core LSP functionality
- See audit details below for full list

### Placeholder Tests
**Current:** 75 placeholders remaining (all in `vscode-pike`)
**Breakdown:**
- Category 31 (Language Registration): 31 placeholders
- Category 34 (Configuration Options): ~10 placeholders
- Category 35 (Auto-Detection): ~5 placeholders
- Category 36 (Context Menus): ~8 placeholders
- Category 37 (Output Channel): ~7 placeholders
- Category 38 (Status Bar & Notifications): ~6 placeholders
- Category 39 (Debug Mode): ~1 placeholder
- Category 33 (Commands): ~7 placeholders

**Note:** `pike-lsp-server` (98% real) and `pike-bridge` (100% real) have no placeholders.

### ADR-001: Parser Tests (DO NOT IMPLEMENT)
**File:** `packages/pike-lsp-server/src/tests/pike-analyzer/parser.test.ts`
- ~60 `// TODO: Implement parser.parse*()` comments present
- **Status:** Intentionally NOT implemented per ADR-001
- **Reason:** Pike's native `Parser.Pike` is used instead of TypeScript-side parser
- **Action:** Leave as-is, documents architectural decision

### Recommended Next Steps (Priority Order)
1. **Convert vscode-pike placeholder tests** (35 remaining) - Unblocks completion
2. **Fix corpus.test.ts false positives** - Test integrity issue
3. **Implement chained access completion** - High value feature gap
4. **Cross-file hierarchy analysis** - Completes call/type hierarchy
5. **Import/inherit symbol exports** - Better module resolution

## Completed
- [x] Fix mock infrastructure - added `onDidChangeConfiguration`, `triggerOnDidOpen`, `onDidOpen`, `onDidSave` to mocks
- [x] Fix build issue - removed broken `prebuild` script from package.json
- [x] Clean up all stale branches (12 local, 12 remote deleted)
- [x] **PR #28/31 Roxen Audit** - All Roxen features successfully delivered
- [x] **PR #33** - Circular inheritance test + Roxen audit documentation
- [x] **PR #34** - 43 diagnostics-provider placeholder tests converted
- [x] **PR #36** - 31 selection-ranges placeholder tests converted
- [x] **PR #38** - 15 call-hierarchy placeholder tests converted
- [x] **PR #41** - 8 document-links placeholder tests converted
- [x] **PR #43** - 10 type-hierarchy placeholder tests converted
- [x] **PR #45** - 15 more type-hierarchy placeholder tests converted
- [x] **PR #47** - 9 more type-hierarchy placeholder tests converted
- [x] **PR #50** - 5 workspace-scanner placeholder tests converted
- [x] **PR #51** - 41 formatting-provider placeholder tests converted
- [x] **PR #52** - 25 workspace-symbol-provider placeholder tests converted

## Roxen Feature Audit (PR #28/31)

**Finding:** NO FEATURES WERE LOST. PR #28 was closed but PR #31 with identical branch (`feat/roxen-production-ready`) was merged 18 minutes later.

### Timeline
- **2026-02-13 21:49:24Z** - PR #28 closed (same branch: `feat/roxen-production-ready`)
- **2026-02-13 22:08:22Z** - PR #31 merged (same branch: `feat/roxen-production-ready`)
- **Commit:** `a288f70` - "feat: Roxen framework LSP integration - production ready"

### Deliverables Verified Present

**TypeScript Features** (`src/features/roxen/`):
- ✅ `detector.ts` - Module detection (inherit patterns, module.h includes)
- ✅ `completion.ts` - MODULE_/TYPE_/VAR_ completions
- ✅ `constants.ts` - 22 MODULE_*, 22 TYPE_*, 8 VAR_* flags
- ✅ `diagnostics.ts` - Roxen validation diagnostics
- ✅ `symbols.ts` - Enhanced symbol grouping
- ✅ `types.ts` - TypeScript types
- ✅ `parser-helpers.ts` - RXML parsing helpers
- ✅ `completions/request-id.ts` - RequestID property completions
- ✅ `index.ts` - Feature exports

**Test Files** (`src/tests/features/roxen/`):
- ✅ `completion.test.ts` - Completion tests
- ✅ `constants.test.ts` - Constant value verification
- ✅ `diagnostics.test.ts` - Diagnostic tests
- ✅ `integration.test.ts` - End-to-end tests
- ✅ `mixed-content.test.ts` - RXML mixed content tests
- ✅ `symbols.test.ts` - Symbol extraction tests

**Pike Stubs** (`pike-scripts/LSP.pmod/RoxenStubs.pmod/`):
- ✅ `Roxen.pike` - RequestID class (25+ properties), MODULE_* constants
- ✅ `RXML.pike` - Tag, TagSet, PXml classes with flags
- ✅ `module.pike` - Module index

**Pike Analyzer** (`pike-scripts/LSP.pmod/Roxen.pmod/`):
- ✅ `Roxen.pike` - Main detection/parsing logic (35KB)
- ✅ `MixedContent.pike` - RXML string extraction (13KB)

**Documentation**:
- ✅ `ROXEN_IMPLEMENTATION.md` - 282-line comprehensive guide
- ✅ `STATUS.md` - Updated with "Roxen: PRODUCTION READY"
- ✅ `README.md` - Roxen support noted

### Total Files Delivered: 28 Roxen-related files

### Conclusion
PR #28 was not lost work - it was a re-opening via PR #31. All Roxen 6.1 framework LSP integration features are present and functional in main.
