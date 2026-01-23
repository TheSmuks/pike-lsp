# Phase 14: TypeScript-Side Caching - Research

**Researched:** 2026-01-23
**Domain:** TypeScript LSP server request deduplication
**Confidence:** HIGH

## Summary

This phase focuses on implementing pending request deduping at the TypeScript LSP server level to prevent concurrent Pike calls during document change events. The research confirms that **PikeBridge already has inflight request deduping** at the IPC level, but LSP handlers make multiple redundant `analyze()` calls for the same document version during `didChange` events.

**Key finding:** The problem is NOT at the IPC layer (PikeBridge dedupes already), but at the LSP feature handler layer where `didChange` triggers multiple operations (validateDocument, semanticTokens, documentSymbols) that each call `bridge.analyze()` with identical parameters.

**Primary recommendation:** Implement a document-level `RequestDeduper` class in the LSP server that dedupes `analyze()` calls by `uri:version` key, wrapping `BridgeManager.analyze()` calls in feature handlers.

## Standard Stack

### Core
| Component | Location | Purpose |
|-----------|----------|---------|
| PikeBridge | packages/pike-bridge/src/bridge.ts | JSON-RPC communication with Pike subprocess |
| BridgeManager | packages/pike-lsp-server/src/services/bridge-manager.ts | Wrapper with health monitoring |
| DocumentCache | packages/pike-lsp-server/src/services/document-cache.ts | Caches parsed symbols and diagnostics |
| TypeDatabase | packages/pike-lsp-server/src/type-database.ts | LRU cache for compiled program info |

### Key Types
| Type | Source | Purpose |
|------|--------|---------|
| `AnalyzeResponse` | @pike-lsp/pike-bridge | Response structure with `_perf` metadata |
| `AnalysisOperation` | @pike-lsp/pike-bridge | Union: 'parse' \| 'introspect' \| 'diagnostics' \| 'tokenize' |
| `DocumentCacheEntry` | pike-lsp-server/core/types.ts | Cached document with version, symbols, diagnostics |

### Existing Deduping (PikeBridge)
**PikeBridge already has inflight deduping:**
```typescript
// From bridge.ts lines 86-87, 269-308
private inflightRequests = new Map<string, Promise<unknown>>();

private getRequestKey(method: string, params: Record<string, unknown>): string {
    return `${method}:${JSON.stringify(params)}`;
}
```

This dedupes **exact IPC calls** (same method + params), but doesn't prevent:
1. Multiple LSP handlers calling `analyze()` simultaneously after `didChange`
2. JSON stringification overhead for every request key
3. The `documentVersion` parameter being passed but not used for caching

## Architecture Patterns

### Current Request Flow (Thundering Herd)

```
didChange event
    |
    v
validateDocumentDebounced (diagnostics.ts:284)
    |
    +-- validateDocument() calls bridge.analyze(code, ['parse','introspect','diagnostics'], filename, version)
    |
    +-- documentSymbols handler (symbols.ts:117) - reads from documentCache
    |
    +-- semanticTokens handler (advanced.ts:175) - reads from documentCache
```

**Problem:** `validateDocument()` is the **only** Pike caller after `didChange`, but semanticTokens and documentSymbols handlers are triggered **concurrently** by VSCode. If they race before `validateDocument` completes and populates `documentCache`, we don't get duplicate Pike calls (because only validateDocument calls Pike).

**Actual problem:** Looking at `advanced.ts` lines 175-184, semanticTokens **only reads from cache** - it doesn't call Pike. Similarly, `symbols.ts` lines 117-127 only reads from cache.

**Conclusion:** The "thundering herd" may be a misunderstanding. Let me verify...

After deeper review:
- `validateDocument()` in `diagnostics.ts` line 338 calls `bridge.analyze()`
- This is the **only** place Pike `analyze()` is called for document changes
- The 500ms debounce (`globalSettings.diagnosticDelay`) already prevents rapid-fire calls
- PikeBridge's existing inflight deduping handles any race conditions

**Revised recommendation:** The phase scope needs clarification. If the goal is preventing duplicate calls across **different features**, the existing architecture already prevents this (only validateDocument calls Pike). If the goal is preventing duplicates **within** rapid sequential edits, the existing debounce + PikeBridge deduping handles this.

### Implementation Pattern (If Still Needed)

```typescript
// Create: packages/pike-lsp-server/src/services/request-deduper.ts

export class RequestDeduper<T> {
    private pending = new Map<string, Promise<T>>();

    /**
     * Execute a function with deduping by key.
     * If a request with the same key is in-flight, reuse its promise.
     */
    async dedupe(key: string, fn: () => Promise<T>): Promise<T> {
        const existing = this.pending.get(key);
        if (existing) {
            return existing;
        }

        const promise = fn().finally(() => {
            this.pending.delete(key);
        });

        this.pending.set(key, promise);
        return promise;
    }

    /** Clear all pending requests (e.g., on document close) */
    clear(): void {
        this.pending.clear();
    }
}

// Usage in diagnostics.ts:
const analyzeDeduper = new RequestDeduper<AnalyzeResponse>();

async function validateDocument(document: TextDocument): Promise<void> {
    const key = `${document.uri}:${document.version}`;
    const analyzeResult = await analyzeDedupe(key, () =>
        bridge.analyze(text, ['parse', 'introspect', 'diagnostics'], filename, version)
    );
    // ... rest of validation
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inflight request deduping | Custom Map tracking | PikeBridge's existing `inflightRequests` | Already implemented at IPC layer |
| Promise cleanup | Manual finally handlers | `promise.finally()` pattern | Standard Promise API |
| Cache key generation | Custom key builders | Template literals | Simpler: `` `${uri}:${version}` `` |
| LSP version tracking | Separate version tracking | `document.version` from LSP protocol | Already provided by VSCode |

## Common Pitfalls

### Pitfall 1: Duplicate Deduping Layers
**What goes wrong:** Adding TypeScript deduping when PikeBridge already dedupes inflight requests
**Root cause:** Not reviewing existing PikeBridge implementation
**How to avoid:** Check `packages/pike-bridge/src/bridge.ts` lines 269-308 before implementing
**Warning signs:** Seeing `inflightRequests` pattern in multiple places

### Pitfall 2: Wrong Cache Key Scope
**What goes wrong:** Using URI-only key causes stale data for new document versions
**Root cause:** LSP increments version on every edit for content-change tracking
**How to avoid:** Always use `` `${uri}:${version}` `` for document-level deduping
**Warning signs:** Getting old validation results for recent edits

### Pitfall 3: Not Cleaning Up on Document Close
**What goes wrong:** Pending promises for closed documents consume memory
**Root cause:** Forgetting to clear dedupe cache in `onDidClose` handler
**How to avoid:** Call `deduper.clear(uri)` in document close handler
**Warning signs:** Memory growing with file open/close cycles

### Pitfall 4: Deduping Across Different Operations
**What goes wrong:** Deduping `analyze()` calls with different `include` arrays
**Root cause:** Using URI-only key, not considering operation differences
**How to avoid:** Include operation types in key: `` `${uri}:${version}:${include.join(',')}` ``
**Warning signs:** Missing semantic tokens when introspection fails

## Code Examples

### Existing PikeBridge Deduping (HIGH confidence - source read)
```typescript
// Source: packages/pike-bridge/src/bridge.ts:269-312
private async sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
    // Check for inflight request with same method and params
    const requestKey = this.getRequestKey(method, params);
    const existing = this.inflightRequests.get(requestKey);

    if (existing) {
        // Reuse the existing inflight request
        return existing as Promise<T>;
    }

    // Create new request and track it as inflight
    const promise = new Promise<T>((resolve, reject) => {
        // ... timeout and request setup
    });

    // Track as inflight
    this.inflightRequests.set(requestKey, promise);

    // Remove from inflight when done (success or failure)
    promise.finally(() => {
        this.inflightRequests.delete(requestKey);
    });

    return promise;
}
```

### Current Analyze Call Pattern (HIGH confidence - source read)
```typescript
// Source: packages/pike-lsp-server/src/features/diagnostics.ts:336-338
const analyzeResult = await bridge.analyze(
    text,
    ['parse', 'introspect', 'diagnostics'],
    filename,
    version  // LSP document version passed to Pike
);
```

### DocumentCache Access Pattern (HIGH confidence - source read)
```typescript
// Source: packages/pike-lsp-server/src/features/symbols.ts:117-127
connection.onDocumentSymbol((params): DocumentSymbol[] | null => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);

    if (!cached || !cached.symbols) {
        return null;
    }

    return cached.symbols
        .filter(s => s && s.name)
        .map(convertSymbol);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate `introspect()`, `parse()`, `analyzeUninitialized()` calls | Unified `analyze()` with `include` array | Phase 13 | Single Pike compilation, distributed results |
| No deduping | PikeBridge `inflightRequests` Map | Before Phase 14 | Exact IPC calls deduped |
| File stat-based cache keys | LSP `documentVersion` for cache keys | Phase 13 | No stat overhead for open documents |

**Deprecated/outdated:**
- Calling `introspect()`, `parse()`, `analyzeUninitialized()` separately → Use `analyze()` with `include` array
- File stat for cache invalidation on open docs → Use `documentVersion` parameter

## Open Questions

### Question 1: Is TypeScript-side deduping actually needed?
**What we know:**
- PikeBridge already has inflight request deduping by method+params
- Only `validateDocument()` calls `bridge.analyze()` after `didChange`
- Other LSP handlers (documentSymbols, semanticTokens) only read from `documentCache`

**What's unclear:**
- Are there scenarios where multiple `analyze()` calls happen with same params?
- Does the 500ms debounce already prevent the thundering herd?

**Recommendation:** Add logging to verify if duplicate analyze calls actually occur before implementing deduping.

### Question 2: Should deduping be at BridgeManager level or feature handler level?
**What we know:**
- BridgeManager wraps PikeBridge with health monitoring
- Feature handlers access bridge via `services.bridge`

**What's unclear:**
- Is adding deduping to BridgeManager a cleaner abstraction?
- Or should each feature handler manage its own deduping?

**Recommendation:** If implemented, put deduping in BridgeManager for centralized control.

## Sources

### Primary (HIGH confidence)
- `packages/pike-bridge/src/bridge.ts` - Full source read, lines 1-883
  - PikeBridge class with `inflightRequests` deduping (lines 86-87, 269-312)
  - `analyze()` method signature (lines 537-549)
  - Request timeout configuration (line 37: 30000ms default)
- `packages/pike-bridge/src/types.ts` - Full source read, lines 1-575
  - `AnalyzeResponse`, `AnalysisOperation` types
  - Performance metadata structure
- `packages/pike-lsp-server/src/features/diagnostics.ts` - Full source read, lines 1-623
  - `validateDocument()` calling `bridge.analyze()` (line 338)
  - Debounce mechanism (lines 284-300)
- `packages/pike-lsp-server/src/features/symbols.ts` - Full source read, lines 1-206
  - Document symbols reading from cache (lines 117-127)
- `packages/pike-lsp-server/src/features/advanced.ts` - Full source read, lines 1-996
  - Semantic tokens reading from cache (lines 175-184)
- `packages/pike-lsp-server/src/services/bridge-manager.ts` - Full source read, lines 1-285
  - BridgeManager wrapper around PikeBridge
- `packages/pike-lsp-server/src/services/document-cache.ts` - Full source read, lines 1-86
  - DocumentCache implementation
- `packages/pike-lsp-server/src/server.ts` - Full source read, lines 1-620
  - Main LSP server wiring

### Secondary (MEDIUM confidence)
- `packages/pike-lsp-server/src/constants/index.ts` - Constants configuration
- `packages/pike-bridge/src/constants.ts` - Bridge timeout constants

### Tertiary (LOW confidence)
- None (all findings from primary source code)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Direct source code verification
- Architecture: HIGH - Full trace through request flow
- Pitfalls: HIGH - Based on common async/await patterns and existing code review

**Research date:** 2026-01-23
**Valid until:** 30 days (stable codebase, but verify before planning if changes made)
