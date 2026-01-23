# Phase 15: Cross-File Caching - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify that Phase 13's compilation cache correctly handles cross-file scenarios:

1. **Import caching**: When file A imports file B, both should be cached after compilation
2. **Dependency invalidation**: Modifying file B should invalidate file A's cache entry
3. **Cache reuse**: Recompiling file A should reuse file B's cached compilation

This is a **verification phase**, not new feature development. Phase 13 built the infrastructure; Phase 15 confirms it works end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Verification approach
- Add cross-file test fixtures to existing benchmark suite (from Phase 10-13)
- Create `test/fixture-cache/main.pike` that inherits `lib/utils.pike`
- Add two verification functions to benchmark code:
  - `verify_import_caching()` — Confirms imported files are cached and reused
  - `verify_dependency_invalidation()` — Confirms modifying dependency invalidates dependents

### Expected behavior
```pike
// After compiling main.pike (which inherits utils.pike):
// - Both main.pike AND lib/utils.pike should be in cache
// - Recompiling main.pike should reuse utils.pike from cache

// After invalidating lib/utils.pike:
// - Both lib/utils.pike AND main.pike should be removed from cache
// (transitive invalidation: dependents are also invalidated)
```

### Timebox constraint
- If verification passes (2 hours expected): Mark Phase 15 complete
- If verification fails:
  - **< 2 hours to fix**: Fix in Phase 15 (likely small wiring issue)
  - **> 2 hours to fix**: Document gap, defer to new phase

### Out of scope (deferred)
- Cross-file symbol index (find-references, go-to-definition, call hierarchy) — substantial feature requiring new data structure; defer to Phase 18 if needed
- Workspace symbol search (Cmd+T) — not a current requirement
- Persistence across LSP restarts — different feature

### Claude's Discretion
- Exact location of verification code in benchmark suite
- Test fixture file structure and naming
- Output format of verification results (console logging vs structured output)

</decisions>

<specifics>
## Specific Ideas

- "You already have benchmark infrastructure from Phase 13. Extend it."
- Test fixture should use real `inherit` relationship, not just `#include`
- Expected output format:
  ```
  Import caching verification:
    main.pike cached:  ✓
    utils.pike cached: ✓
    utils.pike reused: ✓

  Dependency invalidation verification:
    utils.pike invalidated: ✓
    main.pike invalidated:  ✓
  ```

</specifics>

<deferred>
## Deferred Ideas

- Cross-file symbol index for find-references, go-to-definition, call hierarchy — new Phase 18 if users request it
- Workspace symbol search — not currently a requirement
- Persistent cache across LSP restarts — different feature

</deferred>

---

*Phase: 15-cross-file-caching*
*Context gathered: 2026-01-23*
