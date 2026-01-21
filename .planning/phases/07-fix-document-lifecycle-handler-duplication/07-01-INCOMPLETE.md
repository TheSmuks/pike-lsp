---
phase: 07-fix-document-lifecycle-handler-duplication
plan: 01
subsystem: lsp-server, testing
tags: document-sync, language-client, bug-investigation

# Dependency graph
requires:
  - phase: 06-automated-lsp-feature-verification
    plan: 02
    provides: E2E feature tests that should pass
provides:
  - Documentation of LanguageClient document sync issue
  - Analysis of root cause beyond "duplicate handlers"
affects:
  - phase: 07-fix-document-lifecycle-handler-duplication
    plan: 01 must be revised to address actual root cause

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LanguageClient document sync issue identified"
    - "E2E tests fail due to missing didOpen notifications"

key-files:
  created: []
  modified:
    - packages/pike-lsp-server/src/server.ts (investigated, no duplicate handlers found)
    - packages/pike-lsp-server/src/features/diagnostics.ts (investigated, only location of handlers)
    - packages/vscode-pike/src/test/integration/lsp-features.test.ts (5 of 7 tests failing)

key-decisions:
  - "07-01-D01: Root cause is NOT duplicate handlers (they were already removed). The actual issue is that vscode-languageclient LanguageClient is not sending textDocument/didOpen notifications to the LSP server."
  - "07-01-D02: The TextDocuments.onDidOpen handler is NEVER called in the E2E tests, confirmed via debug logging."
  - "07-01-D03: LanguageClient IPC transport may have an incompatibility with vscode-languageserver TextDocuments class."

patterns-established:
  - "Document lifecycle handlers only in diagnostics.ts (confirmed via grep)"
  - "LanguageClient not sending didOpen notifications (confirmed via debug logging)"
  - "Completion tests pass (2 of 7) because they don't rely on document cache"

# Metrics
duration: 90min
completed: 2026-01-21
---

# Phase 07 Plan 01: Remove Duplicate Document Lifecycle Handlers - INCOMPLETE

## Executive Summary

**Status:** BLOCKED - Root cause differs from plan assumption

The plan assumed duplicate handlers in server.ts (lines 583-608) were causing E2E test failures. Investigation revealed:

1. **Duplicate handlers already removed** - No `documents.onDidOpen` exists in server.ts
2. **Handlers only in diagnostics.ts** - Confirmed via grep: only diagnostics.ts has lifecycle handlers
3. **Actual issue: LanguageClient not sending notifications** - The `didOpen` handler is NEVER called

The 5 failing E2E tests (symbols, hover, go-to-definition) all rely on the document cache being populated when a document opens. Since `didOpen` notifications are not being sent, the cache remains empty, and these features return null.

## Investigation Findings

### Finding 1: No Duplicate Handlers in server.ts

```bash
$ grep -n "documents.onDidOpen" packages/pike-lsp-server/src/server.ts
# No matches
```

The duplicate handlers mentioned in v2-MILESTONE-AUDIT.md (lines 583-608) do not exist in the current codebase. They were likely removed in a previous attempt to fix this issue.

### Finding 2: Handlers Only in diagnostics.ts

```bash
$ grep -n "documents.onDidOpen" packages/pike-lsp-server/src/features/diagnostics.ts
548:    documents.onDidOpen((event) => {
```

The lifecycle handlers exist only in `features/diagnostics.ts` (lines 548-601), which is the correct location per the Phase 4 refactoring.

### Finding 3: onDidOpen Handler Never Called

Added debug logging to track when the handler is called:

```typescript
documents.onDidOpen((event) => {
    console.log(`[DIAGNOSTICS] Document opened: ${event.document.uri}`);
    // ...
});
```

**Result:** No log output in test runs. The handler is NEVER invoked.

### Finding 4: LanguageClient Not Sending Notifications

Added broader notification logging:

```typescript
connection.onNotification((method) => {
    if (method.includes('did') || method.includes('textDocument')) {
        console.log(`[NOTIF] Got: ${method}`);
    }
});
```

**Result:** NO document-related notifications received.

This confirms the `vscode-languageclient` LanguageClient is not sending `textDocument/didOpen` (or other document lifecycle) notifications to the server.

### Finding 5: Server Creates 5 Instances During Test

Debug log showed 5 server module loads during a single test run:

```
[SERVER] Server module loaded
[INIT] onInitialize called
[INIT] onInitialized called
[INIT] Open documents count: 0
... (repeated 5 times)
```

Each instance shows 0 open documents at `onInitialized`. The test opens the document after activation, but the notification never reaches any server instance.

## Root Cause Analysis

The v2-MILESTONE-AUDIT.md identified GAP-01 as "duplicate document lifecycle handlers" causing race conditions. However:

1. **Duplicate handlers were already removed** - The code is already in the correct state
2. **The actual issue is deeper** - LanguageClient document sync is broken

### Possible Causes

1. **IPC Transport Incompatibility**: The LanguageClient uses `TransportKind.ipc` while the server uses `vscode-languageserver` `Connection` with `TextDocuments`. These may not be compatible for document synchronization.

2. **LanguageClient Configuration**: The `clientOptions.synchronize` only has `fileEvents`, missing document sync settings.

3. **Version Mismatch**: `vscode-languageclient` and `vscode-languageserver` are both 9.0.1, but there may be an incompatibility in how they handle document notifications.

4. **Test Environment Issue**: The test may be opening documents in a way that doesn't trigger proper synchronization.

## Why Completion Works

Completion tests (2 of 7 passing) don't rely on the document cache. They call the bridge directly:

```typescript
// editing.ts - completion bypasses document cache
const result = await bridge.getCompletionContext(code, line, character);
```

This confirms the bridge and LSP server are working - only document synchronization is broken.

## Deviations from Plan

### [Rule 4 - Architectural Change Required]

**Found during:** Task 1 investigation

**Issue:** Plan assumed duplicate handlers were the cause. Investigation revealed the actual issue is LanguageClient document synchronization not working.

**Impact:** The fix in the plan (removing lines 579-608) is not applicable as those lines don't contain duplicate handlers. The actual fix requires:
1. Understanding why LanguageClient isn't sending notifications
2. Potentially changing the LanguageClient configuration or transport
3. OR implementing a workaround to populate document cache on-demand

**Alternatives:**
- A: Investigate LanguageClient vs vscode-languageserver IPC compatibility
- B: Use stdio transport instead of IPC
- C: Implement on-demand cache population in feature handlers
- D: File bug with vscode-languageclient project

**Recommendation:** Return to user/decision checkpoint to choose approach.

## Next Steps

1. **Decision needed:** How to fix LanguageClient document sync issue?
2. **Verify:** LanguageClient configuration for document synchronization
3. **Test:** Alternative transport mechanisms (stdio vs IPC)
4. **Workaround:** Implement on-demand cache population if upstream fix is not feasible

## Files Modified (During Investigation)

All debug code has been reverted. The codebase is in the same state as before this plan started.

## Testing Status

**E2E Tests:** 5 of 7 failing (same as before)
- PASSING: Completion tests (don't use document cache)
- FAILING: Symbols, hover, go-to-definition (all use document cache)

**Smoke Tests:** 4 of 4 passing
**Bridge Tests:** 27 of 31 passing (4 unrelated failures)

## Conclusion

Plan 07-01 cannot be completed as written because the assumed fix (removing duplicate handlers) is not applicable. The actual issue is a deeper problem with the LanguageClient not sending document lifecycle notifications to the LSP server.

This requires either:
1. An architectural decision on how to fix the LanguageClient integration
2. Or a workaround to bypass the broken document synchronization
