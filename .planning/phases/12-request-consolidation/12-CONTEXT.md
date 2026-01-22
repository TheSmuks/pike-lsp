# Phase 12: Request Consolidation - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

## Phase Boundary

Reduce Pike IPC calls during document validation by combining parse tree, symbols, and diagnostics into a single unified `analyze` method. The goal is to go from 3+ calls per validation to exactly 1 call. Backward compatibility must be maintained for existing JSON-RPC methods.

## Implementation Decisions

### API Contract
- **Unified method name:** Claude's discretion (likely `analyze` or `analyze_document`)
- **Request filtering:** Caller provides an array of requested result types (e.g., `["parse", "symbols", "diagnostics"]`)
- **Response structure:** Results organized in sections matching the request types
- **Schema normalization:** This is an opportunity to normalize inconsistencies across existing schemas while consolidating
- **Return only what's requested:** If caller asks for `["diagnostics"]`, only diagnostics are returned

### Backward Compatibility
- **Wrapper delegation:** Existing methods (`introspect`, `parse`, `analyzeUninitialized`) become thin wrappers that call `analyze` internally with their specific result type
- **Exact response format:** Wrappers must return the exact same response structure as the original methods — no breaking changes for existing clients
- **Deprecation:** Mark old methods as deprecated in this phase — add deprecation warnings in logs/comments but keep them fully functional

### Error Handling
- **Partial success:** Return successful results and separately report failures — do not fail the entire request
- **`failures` map:** Top-level `failures` object keyed by component name (e.g., `{"symbols": {"message": "...", "kind": "ResolutionError"}}`)
- **Inverse structure:** A requested result type appears in either `result` (success) or `failures` (failure), never both
- **String error kinds:** Use descriptive strings like `ParseError`, `ResolutionError`, `InternalError`, etc.
- **O(1) client lookup:** TypeScript client can check `response.failures?.symbols` directly without iterating

### Validation Pipeline
- **Big-bang rewrite:** Single replacement of validation.ts to call `analyze` once with all result types
- **Single call per document change:** Call `analyze` once with all requested types, cache the response, distribute to LSP features
- **Adjustable timing:** Current debouncing/delay behavior can be adjusted if it makes sense with the new consolidated approach
- **Cache for features:** LSP features (symbols, hover, completion) read from cached response rather than making separate calls

## Specific Ideas

- User emphasized O(1) lookup pattern for TypeScript client: `if (response.failures?.symbols)` — this should guide the schema design
- Keep `result` object pure — never mix error objects with successful data to avoid type narrowing in business logic
- The `failures` map is the exact inverse of valid results — for every key in `include`, response has entry in either `result` or `failures`

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 12-request-consolidation*
*Context gathered: 2026-01-22*
