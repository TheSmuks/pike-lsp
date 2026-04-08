# KB-1248: Non-Migrated Query Paths Requiring Parse-Under-Edit Resilience

**KB-ID:** KB-1248  
**Related Issue:** #1248 - Implement parse-under-edit resilience for non-migrated query paths  
**Created:** 2026-04-08  
**Status:** Complete

## Summary

This document tracks the parse-under-edit resilience migration for all query paths. All HIGH and MEDIUM risk paths have been migrated. Only Code Lens (LOW risk) remains unmodified.

## Background

The Query Engine v2 migration has successfully moved the following paths to the resilient query pipeline:

| Feature | Path | Migration Status |
|---------|------|------------------|
| Diagnostics | `packages/pike-lsp-server/src/features/diagnostics/index.ts` | ✅ Migrated (Phase 3) |
| Definition | `packages/pike-lsp-server/src/features/navigation/definition.ts` | ✅ Migrated (Phase 4) |
| References | `packages/pike-lsp-server/src/features/navigation/references.ts` | ✅ Migrated (Phase 4) |
| Completion | `packages/pike-lsp-server/src/features/editing/completion.ts` | ✅ Migrated (Phase 5) |
| Hover | `packages/pike-lsp-server/src/features/navigation/hover.ts` | ✅ Migrated (PR #1257) |
| Signature Help | `packages/pike-lsp-server/src/features/editing/signature-help.ts` | ✅ Migrated (PR #1257) |
| Implementation | `packages/pike-lsp-server/src/features/navigation/implementation.ts` | ✅ Migrated (PR #1258) |
| Code Actions | `packages/pike-lsp-server/src/features/advanced/code-actions.ts` | ✅ Migrated (PR #1258) |
| Semantic Tokens | `packages/pike-lsp-server/src/features/advanced/semantic-tokens.ts` | ✅ Migrated (PR #1258) |

## Remaining Unmodified Path

| Feature | File | Risk Level | Reason |
|---------|------|------------|--------|
| Code Lens | `packages/pike-lsp-server/src/features/advanced/code-lens.ts` | LOW | Uses cached symbol data only, minimal text parsing |

## Migration Pattern Applied

Each migrated path follows this pattern:

1. **RequestScheduler** for cancellation and request supersession
2. **Per-URI/per-symbol error isolation** — one failure doesn't cascade
3. **Cancellation token checks** at entry, before heavy processing, and in loops
4. **Graceful fallbacks** — empty arrays/tokens instead of hard failures
5. **Parse-error classification** — debug-level logging for parse-under-edit, error-level for unexpected failures

### Resilience Tests

Each migrated path has a corresponding test file in `src/scenarios/`:

| Feature | Test File | Tests |
|---------|-----------|-------|
| Implementation | `implementation-parse-resilience.test.ts` | 6 |
| Code Actions | `code-actions-parse-resilience.test.ts` | 6 |
| Semantic Tokens | `semantic-tokens-parse-resilience.test.ts` | 6 |
| Hover | `hover-parse-resilience.test.ts` | 5 |
| Signature Help | `signature-help-parse-resilience.test.ts` | 5 |

All tests use `FaultInjectableMockBridge` to simulate parse failures, rapid edits, and cancellation.

## Acceptance Checklist

| Issue #1248 Subtask | Status |
|---------------------|--------|
| All non-migrated query paths identified and listed | ✅ |
| Parse-under-edit resilience implemented for each HIGH/MEDIUM path | ✅ |
| Resilience tests added for each path (28 total) | ✅ |
| TypeScript strict compilation passes | ✅ |
| p95 parse hard-fail rate remains 0 | ✅ (verified via tests) |
