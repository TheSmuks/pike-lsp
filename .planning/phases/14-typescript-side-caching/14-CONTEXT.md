# Phase 14: TypeScript-Side Caching - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

## Phase Boundary

Implement pending request deduping on the TypeScript side to prevent thundering herd of concurrent Pike calls during document change events (didChange triggers validateDocument + semanticTokens + outline simultaneously). This is NOT a full result caching layer — Pike-side compilation cache (Phase 13) is the source of truth for compiled data. TS-side deduping only prevents duplicate in-flight requests.

## Implementation Decisions

### Scope
- **Rapid request deduping only** — NOT full IPC result caching, NOT regex fallback avoidance
- Rationale: Pike cache hits are ~313μs + ~200-400μs IPC overhead = ~0.5-0.7ms total, ~100x below "feels instant" threshold
- Two caches (Pike + TS) would create dual invalidation bugs for minimal gain
- Revisit full TS-side caching only if profiling shows IPC as actual bottleneck

### Cache key strategy
- **URI + LSP version** — `${uri}:${version}`
- LSP version increments on every edit, already provided by protocol
- URI-only would cause race: old version request returns for new version
- Content hash is redundant — LSP version already represents content change

### Promise cleanup
- **On resolve/reject** via `.finally(() => pending.delete(key))`
- Pike request timeout (5s default) handles hung promises
- No separate TTL on dedupe cache — request layer handles timeouts, cache layer tracks pending

### Error handling
- **Allow retry** — inherent in `.finally()` cleanup
- Concurrent waiters for failed request all get rejection (unavoidable, same Promise)
- Future callers get fresh attempt (cache cleared after rejection)
- Syntax errors are successful responses with diagnostics, not rejections

### Operations to dedupe
- **Document ops only** — compile/analyze operations
- Rationale: didChange triggers validateDocument + semanticTokens + outline simultaneously
- Position-specific ops (hover, completion, go-to-definition) rarely have concurrent duplicates
- Start minimal, expand if logs show duplicate documentSymbol or similar requests

### Claude's Discretion
- Exact timeout value for Pike requests (5s suggested)
- Whether to expand deduping to other operations (evidence-based decision)
- Map implementation details (Map<string, Promise<>> vs custom class)

## Specific Ideas

Reference implementation pattern:

```typescript
const pendingCompile = new Map<string, Promise<CompilationResult>>();

function dedupeKey(uri: string, version: number): string {
    return `${uri}:${version}`;
}

async function compile(doc: TextDocumentIdentifier): Promise<CompilationResult> {
    const key = dedupeKey(doc.uri, doc.version);

    let promise = pendingCompile.get(key);
    if (!promise) {
        promise = pikeProcess.request('compile', doc, 5000);
        pendingCompile.set(key, promise);
        promise.finally(() => pendingCompile.delete(key));
    }

    return promise;
}
```

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 14-typescript-side-caching*
*Context gathered: 2026-01-23*
