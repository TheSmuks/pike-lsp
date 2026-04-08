# KB-1248: Non-Migrated Query Paths Requiring Parse-Under-Edit Resilience

**KB-ID:** KB-1248  
**Related Issue:** #1248 - Implement parse-under-edit resilience for non-migrated query paths  
**Created:** 2026-04-08  
**Status:** In Progress

## Summary

This document identifies all query paths that have NOT been migrated to the Query Engine v2 pattern and therefore lack parse-under-edit resilience. These paths may hard-fail when users type rapidly and the parser receives incomplete/broken intermediate text states.

## Background

The Query Engine v2 migration has successfully moved the following paths to the resilient query pipeline:

| Feature | Path | Migration Status |
|---------|------|------------------|
| Diagnostics | `packages/pike-lsp-server/src/features/diagnostics/index.ts` | ✅ Migrated (Phase 3) |
| Definition | `packages/pike-lsp-server/src/features/navigation/definition.ts` | ✅ Migrated (Phase 4) |
| References | `packages/pike-lsp-server/src/features/navigation/references.ts` | ✅ Migrated (Phase 4) |
| Completion | `packages/pike-lsp-server/src/features/editing/completion.ts` | ✅ Migrated (Phase 5) |

Migrated paths use the `queryNavigationLocations()` helper from `packages/pike-lsp-server/src/features/navigation/query-engine.ts`, which:
- Uses snapshot-based execution
- Supports cancellation tokens
- Handles malformed intermediate text gracefully
- Returns `undefined` rather than throwing on parse failures

## Non-Migrated Paths Identified

The following paths are NOT using the query-engine pattern and need parse-under-edit resilience:

### Navigation Features

| Feature | File | Current Pattern | Risk Level |
|---------|------|-----------------|------------|
| Hover | `packages/pike-lsp-server/src/features/navigation/hover.ts` | Direct symbol lookup via `documentCache.get(uri)` + `getWordRangeAtPosition()` + bridge calls | HIGH - bridge calls during edit may fail |
| Implementation | `packages/pike-lsp-server/src/features/navigation/implementation.ts` | Direct symbol lookup via `documentCache.get(uri)` + introspection calls | MEDIUM - workspace introspection may fail |

### Editing Features

| Feature | File | Current Pattern | Risk Level |
|---------|------|-----------------|------------|
| Signature Help | `packages/pike-lsp-server/src/features/editing/signature-help.ts` | Direct document access + `resolveCallContextAtOffset()` + bridge calls | HIGH - text parsing during edit may fail |
| Code Actions | `packages/pike-lsp-server/src/features/advanced/code-actions.ts` | Direct document text access + regex parsing | MEDIUM - line-based parsing may fail on broken text |

### Advanced Features

| Feature | File | Current Pattern | Risk Level |
|---------|------|-----------------|------------|
| Code Lens | `packages/pike-lsp-server/src/features/advanced/code-lens.ts` | Cached symbol access only | LOW - uses cached data, but no edit resilience |
| Semantic Tokens | `packages/pike-lsp-server/src/features/advanced/semantic-tokens.ts` | Direct document text + regex tokenization | MEDIUM - tokenization may fail on broken text |

## Risk Analysis

### HIGH Risk (Immediate Action Required)

1. **Hover** (`hover.ts`)
   - Calls `services.bridge.bridge.getTypeAtPosition()` directly during hover
   - No cancellation or snapshot isolation
   - If text is malformed during rapid edits, bridge calls may throw

2. **Signature Help** (`signature-help.ts`)
   - Uses `document.getText()` and `resolveCallContextAtOffset()` which parses text
   - No resilience against broken intermediate syntax
   - Call context resolution may fail on incomplete expressions

### MEDIUM Risk (Should Address)

3. **Code Actions** (`code-actions.ts`)
   - Uses `document.getText().split('\n')` and regex parsing
   - Line-based parsing assumes well-formed text
   - Import statement detection may fail on broken syntax

4. **Semantic Tokens** (`semantic-tokens.ts`)
   - Tokenizes entire document text with regex
   - No protection against malformed input
   - However, errors are caught and empty tokens returned

5. **Implementation** (`implementation.ts`)
   - Uses introspection service calls
   - Less direct exposure to parse failures
   - Mainly uses cached symbol data

### LOW Risk (Can Defer)

6. **Code Lens** (`code-lens.ts`)
   - Primarily uses cached symbol data from `documentCache`
   - Minimal direct text parsing
   - Low probability of parse-under-edit failures

## Migration Strategy

For each non-migrated path, the migration involves:

1. **Wrap bridge/service calls** with try-catch and return graceful fallbacks
2. **Add cancellation token support** where applicable
3. **Use snapshot-based data** instead of live document access when possible
4. **Add resilience tests** to verify no hard-fail on malformed edits

### Pattern Reference

See `packages/pike-bridge/src/query-engine-parse-under-edit.test.ts` for the test pattern that migrated paths use:

```typescript
// Malformed edit sequence that should not cause hard failures
const texts = [
  'int stable = 1;\n',           // Valid
  'int stable = ;\n',            // Broken: missing value
  'class C {\n  int x\n',        // Broken: incomplete class
  'class C {\n  int x = 1;\n...', // Broken: unclosed block
  'int repaired = 2;\n',         // Valid again
];
```

## Acceptance Checklist Mapping

| Issue #1248 Subtask | Affected Files |
|---------------------|----------------|
| All non-migrated query paths identified and listed | ✅ This document |
| Parse-under-edit resilience implemented for each path | Hover, Signature Help, Code Actions, Semantic Tokens, Implementation |
| Resilience tests added for each path | Each path needs corresponding test |
| Program Dashboard updated | Update tracker after migration |
| p95 parse hard-fail rate remains 0 | Verified via perf gates |
| Stress tests with rapid edits pass | Add to stress test suite |

## Next Steps

1. **Coder**: Implement resilience wrappers for HIGH risk paths (Hover, Signature Help)
2. **Coder**: Add resilience tests following the pattern in `query-engine-parse-under-edit.test.ts`
3. **Tester**: Verify stress tests pass with rapid edit simulation
4. **Architect**: Review migration approach for MEDIUM risk paths
