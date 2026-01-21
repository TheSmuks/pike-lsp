# Phase 6: Automated LSP Feature Verification - Context

**Phase:** 06-automated-lsp-feature-verification
**Created:** 2026-01-21
**Status:** Ready to execute

## Problem Statement

The milestone audit revealed a critical verification gap: **current integration tests only verify extension activation and file opening, not whether LSP features actually work**.

From `.claude/CLAUDE.md`:
> "DO NOT commit changes without verifying LSP functionality works end-to-end. Previous agents broke the LSP by:
> 1. Not testing with the actual VSCode extension
> 2. Not checking Pike bridge communication works
> 3. Not looking at debug/error output from Pike subprocess"

Current test at `packages/vscode-pike/src/test/integration/extension.test.ts:102`:
```typescript
// Document should be open without errors
assert.strictEqual(document.languageId, 'pike');
```

This only checks languageId - it doesn't verify:
- Document symbols returns symbol tree (not null)
- Hover shows type information (not empty)
- Go-to-definition navigates correctly (not null)
- Completion returns suggestions (not empty)

**The Risk:** Agents can break hover/symbols/definition/completion, and all tests pass. This has happened before.

## What This Phase Adds

**Automated E2E verification** that tests the full stack: VSCode → LSP Server → Bridge → Pike

### New Tests (Plan 06-01)
1. **Document Symbols Test** - Calls `vscode.executeDocumentSymbolProvider`, verifies symbols array
2. **Hover Test** - Calls `vscode.executeHoverProvider`, verifies MarkupContent with type info
3. **Definition Test** - Calls `vscode.executeDefinitionProvider`, verifies Location returned
4. **Completion Test** - Calls `vscode.executeCompletionItemProvider`, verifies CompletionList

### CI Integration (Plan 06-02)
1. **CI Gate** - vscode-e2e job runs feature tests, blocks merge if features broken
2. **Pre-Push Hook** - Local verification before push (faster feedback)
3. **Documentation** - CLAUDE.md updated with automated test references

## Why Now

**Timing:** After Phase 5 (Pike reorganization) to ensure stable Pike modules before adding E2E tests.

**Urgency:** HIGH - Without this, future refactorings could break LSP features without detection.

**Effort:** LOW - 2 plans, reuses existing test infrastructure (`@vscode/test-electron`, xvfb in CI)

## Success Definition

**Done when:**
1. VSCode integration tests call actual LSP protocol methods
2. Tests verify responses contain valid data (not null/undefined)
3. CI blocks merge if any LSP feature returns null
4. Pre-push hook catches broken features before push
5. CLAUDE.md references automated tests
6. Breaking a feature causes tests to fail (regression detection proven)

## Integration Points

### Depends On
- Phase 5: Pike modules (Intelligence, Analysis) must work
- Phase 2: CI infrastructure (xvfb, vscode-e2e job) exists
- Phase 3: PikeBridge operational

### Provides To
- v2 Milestone: Completes comprehensive automated verification
- Future phases: E2E test baseline for new features
- Developers: Confidence that tests catch regressions

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tests flaky in CI | False failures block merges | Use 30s timeout, xvfb already stable |
| Tests too slow | Pre-push hook frustrating | Tests reuse activated extension (~10s total) |
| Test fixture breaks | All tests fail together | Simple fixture with basic Pike constructs |
| xvfb issues | Linux CI only | Already working from Phase 2 |

## Metrics

**Test Coverage Added:**
- Before: Extension activation only (1 integration test)
- After: 5+ integration tests (activation + 4 LSP features)

**Verification Path:**
- Before: Manual checklist only
- After: Automated CI gate + manual backup

**Regression Detection:**
- Before: Manual testing required to catch broken features
- After: CI automatically detects and blocks

## References

- `.planning/v2-MILESTONE-AUDIT.md` - Identified this gap in "Human Verification Required" section
- `.claude/CLAUDE.md` - Manual verification checklist to be enhanced
- `06-RESEARCH.md` - VSCode testing patterns and LSP protocol verification
