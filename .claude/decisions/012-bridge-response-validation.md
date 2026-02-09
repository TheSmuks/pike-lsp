# ADR-012: Runtime Response Validation at Bridge Boundary

**Status:** proposed
**Area:** ipc
**Date:** 2026-02-09
**Supersedes:** (none)

## Context

Pike's type system silently returns `0` for undefined object properties instead of throwing. TypeScript types are erased at runtime. The JSON-RPC bridge boundary between them has no runtime type checking.

This created a class of bugs where Pike returns wrong types (e.g., `master()->include_path` returns `0` instead of an array), the `0` gets serialized as JSON, TypeScript deserializes it, and the code proceeds with corrupted data because the TypeScript type annotation says it's an `array`.

The `master()->include_path` vs `master()->pike_include_path` bug (PR #23) shipped because:
1. Pike returned `0` instead of `string[]` — no Pike-side error
2. TypeScript trusted the `as T` cast on `sendRequest<T>` — no TS-side error
3. Tests checked "returns data" but not "returns correct type of data"

## Decision

Add optional runtime response validation to `PikeBridge.sendRequest()`. Each bridge method can attach a validator function that asserts the response shape before returning to callers.

**Design principles:**
- **Opt-in per method** — gradual adoption, no big-bang rewrite
- **Fail loud** — throw `BridgeResponseError` with method name, field name, expected type, and actual value
- **Validators are simple assertion functions** — no schema library dependency
- **Critical methods validated first** — start with methods that query Pike master() properties

**Implementation:**
```typescript
// sendRequest gains optional validator parameter
private async sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
    validate?: (raw: unknown, method: string) => T
): Promise<T>

// Each method adds its validator inline
async getPikePaths(): Promise<PikePathsResult> {
    return this.sendRequest('get_pike_paths', {}, (raw, method) => {
        const r = raw as Record<string, unknown>;
        assertObject(r, 'response', method);
        assertArray(r.include_paths, 'include_paths', method);
        assertArray(r.module_paths, 'module_paths', method);
        return r as PikePathsResult;
    });
}
```

**Priority order for validation:**
1. `getPikePaths` — queries master() properties (the bug that prompted this)
2. `resolveInclude` — returns path/exists from Pike filesystem checks
3. `resolveImport` — returns path/exists from Pike module resolution
4. `resolveModule` — returns path/exists
5. Other methods — add validators as bugs are discovered or code is touched

## Alternatives Rejected

- **Zod/io-ts schema validation** — Adds a dependency for a focused use case. Pike responses have simple shapes; assertion functions are sufficient.
- **Pike-side type assertions only** — Catches at the source but requires modifying every Pike handler. Bridge-side is a single chokepoint with less code churn.
- **Full response schema registry** — Over-engineered for the current project size. The opt-in validator parameter is simpler and achieves the same goal.

## Consequences

- New bridge methods SHOULD include a validator (code review should flag missing ones)
- Existing methods without validators continue to work unchanged (backward compatible)
- Runtime validation adds negligible overhead (a few typeof checks per response)
- `BridgeResponseError` gives clear diagnostics: "getPikePaths: field 'include_paths' expected array, got number (0)"

## Challenge Conditions

Revisit this decision if:
- The number of bridge methods exceeds 50 and per-method validators become tedious (consider a schema registry)
- A schema validation library is added for other purposes (consolidate)
- Pike adds runtime type checking that makes bridge-side validation redundant
