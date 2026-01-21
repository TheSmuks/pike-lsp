# Phase 09: Implement Pike Version Detection - Research

**Researched:** 2026-01-21
**Domain:** Subprocess Introspection / Health Monitoring
**Confidence:** HIGH

## Summary

Phase 09 focuses on completing the Pike version detection feature within the `BridgeManager`. Currently, the system reports "Unknown" for the Pike version because the implementation in `bridge-manager.ts` returns `null`. The research confirms that Pike provides several internal constants and functions (`__REAL_VERSION__`, `__REAL_BUILD__`, `version()`) that can be exposed via a new JSON-RPC method in the `analyzer.pike` script. This avoids spawning unnecessary subprocesses and provides the exact version of the interpreter currently running the LSP logic.

**Primary recommendation:** Add a `get_version` method to the `analyzer.pike` dispatch table that returns a structured version object, which the `BridgeManager` fetches once during initialization and caches for health reporting.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Pike JSON-RPC | Native | Communication | Existing transport between TS and Pike |
| `vscode-languageserver` | 9.0.1 | Health Reporting | Standard LSP health/command interface |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@pike-lsp/core` | 0.1.0 | Logging | Standardized logging across packages |

## Architecture Patterns

### Recommended Project Structure
```
packages/pike-lsp-server/src/
├── services/
│   └── bridge-manager.ts    # Implementation site for caching and reporting
pike-scripts/
├── analyzer.pike            # Add get_version to dispatch table
└── LSP.pmod/
    └── Compat.pmod          # Use existing version helpers
```

### Pattern 1: Startup Introspection
**What:** Query version information immediately after the bridge enters the `started` state.
**When to use:** For static metadata that doesn't change during the process lifecycle.
**Example:**
```typescript
// bridge-manager.ts
async start() {
    await this.bridge.start();
    try {
        const info = await this.bridge.getVersionInfo();
        this.cachedVersion = info.version;
    } catch (e) {
        this.logger.warn("Version detection failed", e);
        this.cachedVersion = "Unknown";
    }
}
```

### Anti-Patterns to Avoid
- **Frequent Polling:** Do not query version on every health check request; Pike version is immutable for the duration of the process.
- **Regex Fragility:** Avoid complex regex on the `version()` string if structured constants like `__REAL_VERSION__` are available.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version Comparison | Custom string split | `semver` (if needed) | Handles prereleases and complex ranges |
| Path Resolution | Manual `which` calls | `this.options.pikePath` | The bridge already knows which path it used to spawn |

**Key insight:** Use the `LSP.Compat` module already present in the codebase to ensure consistent version reporting across different Pike interpreter versions.

## Common Pitfalls

### Pitfall 1: Binary Path Ambiguity
**What goes wrong:** The reported path is just "pike" instead of the absolute path.
**Why it happens:** Subprocesses are often spawned using the PATH environment variable.
**How to avoid:** Use `which` or `fs.realpathSync` on the `pikePath` in the BridgeManager before/during startup to resolve to an absolute path for the health check.

### Pitfall 2: Older Analyzer Versions
**What goes wrong:** Calling `get_version` on a Pike subprocess running an old `analyzer.pike` (e.g. during a version transition) returns a "Method not found" error.
**How to avoid:** Ensure the `BridgeManager` handles RPC error code `-32601` (Method not found) gracefully by falling back to "Unknown".

## Code Examples

### Pike: Version Implementation
```pike
// analyzer.pike
"get_version": lambda(mapping params, object ctx) {
    return ([
        "version": sprintf("%g.%d", __REAL_VERSION__, __REAL_BUILD__),
        "real_version": __REAL_VERSION__,
        "build": __REAL_BUILD__,
        "display": version()
    ]);
},
```

### TypeScript: Version Normalization
```typescript
// Proposed normalization logic
function normalizeVersion(raw: string): string {
    return raw.replace(/^v/, '').trim();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pike --version` | RPC `get_version` | Phase 09 | No extra process spawn; accurately reflects *running* instance |

## Open Questions

1. **Which `pike`?**
   - What we know: `this.options.pikePath` is used to start the process.
   - What's unclear: If multiple Pike versions are in PATH, whether the internal Pike `master()->_pike_file_name` reliably returns the absolute path on all OSs.
   - Recommendation: Use `this.options.pikePath` from the TypeScript side as the primary source, but verify if it's "pike" or an absolute path.

## Sources

### Primary (HIGH confidence)
- `pike-scripts/LSP.pmod/Compat.pmod` - Existing version logic.
- `packages/pike-lsp-server/src/services/bridge-manager.ts` - Implementation site.
- `packages/pike-bridge/src/bridge.ts` - Existing (but unused for health) `getVersion` method.

### Secondary (MEDIUM confidence)
- `v2-MILESTONE-AUDIT.md` - Technical debt identification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Core infrastructure is already in place.
- Architecture: HIGH - Follows established BridgeManager service.
- Pitfalls: HIGH - Documented integration issues from previous phases.

**Research date:** 2026-01-21
**Valid until:** 2026-02-21

## RESEARCH COMPLETE

**Phase:** 09 - Implement Pike Version Detection
**Confidence:** HIGH

### Key Findings

- **Pike Internal Constants**: Use `__REAL_VERSION__` and `__REAL_BUILD__` for reliable, structured version data.
- **RPC Integration**: Adding `get_version` to `analyzer.pike` is the most efficient retrieval method.
- **Path Resolution**: The `PikeBridge` already stores the `pikePath`; this should be resolved to an absolute path for health checks.
- **Graceful Fallback**: Version detection must handle RPC errors if the analyzer is outdated.

### File Created

`.planning/phases/09-implement-pike-version-detection/09-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Uses existing JSON-RPC and LSP patterns. |
| Architecture | HIGH | Fits cleanly into current BridgeManager service. |
| Pitfalls | HIGH | Lessons learned from Phase 4 and Phase 7 applied. |

### Open Questions

- None. Implementation path is clear.

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
