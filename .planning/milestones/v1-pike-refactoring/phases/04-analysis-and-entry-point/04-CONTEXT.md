# Phase 4: Analysis & Entry Point - Context

**Gathered:** 2026-01-19
**Status:** Ready for planning

## Phase Boundary

Extract analysis handlers (find_occurrences, analyze_uninitialized, get_completion_context) into Analysis.pike class and refactor analyzer.pike as a lightweight JSON-RPC routing entry point. The router delegates to Parser.pike, Intelligence.pike, and Analysis.pike instances.

This phase completes the modularization by extracting the final handler module and establishing the routing layer.

---

## Implementation Decisions

### Helper Extraction Scope

**Decision:** Extract based on actual need, not anticipated need. Module-specific helpers move to their module. Genuinely shared utilities are noted for Util.pmod extraction (deferred to Phase 4 planning/implementation).

**Extraction rule for each helper:**
- **Analysis-domain logic** → Move to Analysis.pike
- **General utility, only Analysis uses today** → Leave in router, note for Util.pmod
- **Used by multiple modules** → Leave in router, note for Util.pmod

**Tracking:** Util.pmod candidates are listed in PLAN.md during planning (not code comments, not implicit).

**Examples:**
| Helper | Nature | Placement |
|--------|--------|-----------|
| `find_symbol_at_position()` | Analysis logic | Analysis.pike |
| `build_completion_item()` | Analysis logic | Analysis.pike |
| `offset_to_line()` | General utility | Router (note for Util.pmod) |
| `format_uri()` | General utility | Router (note for Util.pmod) |

**Rationale:** Extract based on actual need during implementation. Router temporarily holds general utilities. Phase 4 planning reviews all helpers and organizes properly based on actual usage patterns.

### Router Design Pattern

**Decision:** Dispatch table with explicit method → handler mapping. Router normalizes errors to JSON-RPC format. Single `dispatch()` function handles routing and error normalization.

**Dispatch table structure:**
```pike
constant HANDLERS = ([
    "initialize": handle_initialize,
    "shutdown": handle_shutdown,
    "textDocument/completion": Analysis.handle_completion,
    "textDocument/hover": Analysis.handle_hover,
    "textDocument/definition": Analysis.handle_definition,
    // ... etc
]);
```

**Responsibility split:**
- **main()**: JSON-RPC I/O loop, message framing, lifecycle
- **dispatch()**: Method routing, error normalization, handler invocation

**Module return contract:**
- Modules return `result` or `error` field in mapping
- Router wraps in JSON-RPC envelope (`{"jsonrpc": "2.0", "id": ..., "result"/"error": ...}`)
- Router catches unexpected exceptions and returns Internal Error

**Rationale:** Dispatch table is O(1) lookup, shows all methods at once, easy to extend. Single dispatch() function is testable without I/O and keeps main() focused on lifecycle.

### Module Instantiation

**Decision:** Singleton pattern — create modules once at startup, store in Context as service container. Explicit initialization order documented in PLAN.md.

**Initialization order:**
1. Logging (no dependencies)
2. Caches (program_cache, symbol_cache, stdlib_cache)
3. Parser (stateless, no LSP dependencies)
4. Intelligence (may use Parser)
5. Analysis (uses Parser, may use Intelligence)
6. Context assembled with all components

**Context structure:**
```pike
class Context {
    .Logging log;
    .Cache program_cache;
    .Cache symbol_cache;
    .Parser parser;
    .Analysis analysis;
    mapping client_capabilities;
}
```

**Dispatch signature:**
```pike
mapping dispatch(string method, mapping params, Context ctx)
```

**Handler access pattern:**
```pike
mapping handle_completion(mapping params, Context ctx) {
    mixed result = ctx->parser->parse(source);
    mixed cached = ctx->program_cache->get(uri);
    ctx->log->debug("Completion requested");
    // ...
}
```

**Rationale:** Modules are stateless by design. Singleton is safe and efficient. Context as service container provides clean dependency injection via single parameter.

### Backward Compatibility

**Decision:** Compatible enhancements allowed. Can improve error messages and add optional fields, but must preserve required LSP fields and structure.

**Compatibility rules:**
| Change type | Allowed |
|-------------|---------|
| Add optional field | Yes |
| Improve error message text | Yes |
| Add detail to error data | Yes |
| Remove required field | No |
| Change field type | No |
| Rename field | No |
| Change nesting structure | No |

**Error message standardization:**
- **Format:** `[Action] failed: [reason]` or `[Thing] not found: [identifier]`
- **Examples:**
  - "Parse failed: unexpected token at line 5"
  - "Symbol not found: 'foobar'"
  - "Completion failed: file not indexed"

**Response format tests:**
- Add `response-format-tests.pike` with one test per handler
- Tests verify required fields present, correct types, valid structure
- Tests allow optional fields (non-breaking additions)
- Catches breaking changes, allows enhancements

**Internal changes:** Minimize changes during extraction. Only what's necessary for Analysis extraction. No internal refactoring during this phase — cleanup can be separate dedicated phase.

**Rationale:** LSP clients are resilient to additive changes. Consistent errors improve debugging and UX. Format tests enforce compatibility. Separate extraction from refactoring to keep review focused.

### Claude's Discretion

- Exact dispatch table implementation details
- Response format test implementation approach
- Which specific helpers to note for Util.pmod vs keeping in router
- Cache size defaults for Analysis-specific needs
- Request-specific context patterns if needed

---

## Specific Ideas

- Dispatch table should reference module methods directly: `"textDocument/completion": Analysis.handle_completion`
- Error messages should be single sentences, clear to developers reading VSCode output
- Response format tests should be schema-style, not traditional snapshots (verify structure, not exact match)
- Note Util.pmod candidates in PLAN.md as implementation proceeds, extract in dedicated cleanup

---

## Deferred Ideas

- **Util.pmod creation** — Full utility module extraction deferred until after seeing actual usage patterns
- **Internal refactoring** — Code cleanup, variable naming, algorithm improvements deferred to separate cleanup phase
- **Request-scoped context** — RequestContext wrapper not needed for v1, can add later if request-specific state needed

---

*Phase: 04-analysis-and-entry-point*
*Context gathered: 2026-01-19*
