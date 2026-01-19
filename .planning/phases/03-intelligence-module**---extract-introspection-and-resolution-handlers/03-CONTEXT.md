# Phase 3: Intelligence Module - Context

**Gathered:** 2026-01-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract introspection, resolution, and stdlib query handlers into Intelligence.pike class. This phase handles the "brain" of the LSP server — symbol lookups, documentation retrieval, and inheritance traversal. The four handlers to extract are:

- `handle_introspect` — Introspect Pike code structure
- `handle_resolve` — Resolve symbols/definitions
- `handle_resolve_stdlib` — Query stdlib symbols
- `handle_get_inherited` — Get inheritance hierarchy

This is infrastructure code that the LSP server calls internally — not something users see directly.

</domain>

<decisions>
## Implementation Decisions

### Stdlib Caching Strategy

**Cache structure:** Flat by module name
- Cache key = fully qualified module name (`"Array"`, `"Parser.Pike"`, `"Protocols.HTTP"`)
- Cache value = all symbols in that module
- Lookup is O(1) — module is the natural LSP access pattern

**Symbol entry structure:**
```
Symbol {
  name: string
  kind: enum (class, function, constant, variable, module)
  signature: string (human-readable)
  doc: string (documentation text)
  children: array (for classes: member symbols)
}
```

**Reverse index for unqualified lookups:**
- Key: symbol name (`"sort"`)
- Value: array of modules containing that symbol (`["Array", "String"]`)
- Two-step lookup: reverse index finds modules, then module entry provides details

**Cache format:** Normalized JSON structure
- One-time normalization cost at index time
- All subsequent lookups return ready-to-use data
- Normalized schema (per symbol entry):
  - `name`, `kind`, `signature`, `parameters` (array), `returns`, `doc`, `deprecated`, `since`
- Parameter entry: `name`, `type`, `optional`

**Cache invalidation:** Never during session
- Stdlib is part of Pike installation — doesn't change while LSP runs
- Cache once, use for entire session
- Separate from user code cache: stdlib is read-only, user code version-based

**Cache loading:** Load on-demand
- LSP starts immediately, no blocking stdlib indexing
- First completion for a module triggers that module's load (~10-50ms)
- Subsequent accesses are instant
- Optional future optimization: background pre-warm after initialization

### AutoDoc Parsing Depth

**Visibility strategy:** Context-dependent
- **Stdlib / workspace files:** Public API only (cached, session/version lifetime)
- **Current file:** Full extraction including private/protected (not cached, parse on request)
- Parser handles current file with scope awareness — which block contains cursor

**Parameter details:** Full details
- Names, types, default values, and @param documentation
- Enables rich completion and hover information

**Inline markup:** Convert to Markdown
- Transform `@i{}`, `@b{}`, `@tt{}`, `@code{}` to markdown equivalents (`*`, `**`, `` ` ``, code blocks)

**Deprecation metadata:** Extract and flag
- Parse `@deprecated`, add `deprecated=true` field to symbol metadata
- Allows completion UI to de-emphasize or strike through deprecated items

### Resolution Failure Handling

**Symbol not found:** Return empty result
- LSP specification defines "not found" as valid result, not error
- Editors handle empty results gracefully (null or [])
- JSON-RPC errors are for protocol failures, not missing data
- Debug log: `No definition found for symbol: X`

**Partial matches:** Exact only — no fuzzy suggestions for resolution
- Definition/reference lookups return locations — LSP has no standard for suggestions
- Fuzzy matching belongs in diagnostics and completion, not resolution
- Diagnostics pipeline handles "did you mean" for unknown symbols

**Ambiguous symbols:** Return all
- LSP specification supports multiple locations — clients handle this natively
- VS Code shows peek view, Neovim uses quickfix list, Sublime shows panel
- User disambiguates — no information lost

**Stdlib fallback:** Always fallback
- Search order: Current file → Workspace files → Stdlib cache
- User expects `write()` to resolve without `Stdio.` prefix
- Multiple sources may return matches — return all combined

### Inheritance Traversal

**Depth limit:** Unlimited with cycle protection
- Real Pike inheritance chains are shallow (typically 1-3, rare 5-7 levels)
- Cycle detection is the safety mechanism, not artificial depth limits
- Limits cause silent incompleteness

**Circular detection:** Detect and stop
- Track visited set during traversal
- Before visiting class: if in visited → cycle detected, stop branch
- Report as LSP Diagnostic (not fatal — continue other branches)

**Multiple inheritance:** Declaration order
- Follow inherit clauses in order they appear in source
- Matches Pike's own resolution semantics
- Traversal: depth-first, left-to-right following declaration order

**Symbol shadowing:** Show overrides
- Child version shown in completion
- Schema additions:
  - `overrides`: parent class name if symbol shadows parent
  - `inherited_from`: origin class if symbol is inherited without override
- Completion display: `method() (from Parent)` or `method() (overrides Parent)`
- Hover shows: "Overrides: ParentClass.method"

### Claude's Discretion

- Exact progress reporting mechanism for background indexing (if implemented)
- Normalization implementation details for AutoDoc parsing
- Specific diagnostics format for circular inheritance detection

</decisions>

<specifics>
## Specific Ideas

**Two-cache architecture:**
- Stdlib cache: flat by module, on-demand loading, never invalidated during session
- User code cache: version-based, changes constantly

**Context awareness is critical:**
- Current file completion: Parser extracts everything, filters by scope
- External reference completion: Cache lookup, public API only

**Search order matters:**
- Current file scope first (local definitions shadow external)
- Workspace files second (project code more relevant)
- Stdlib last (fallback for built-in symbols)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-intelligence-module*
*Context gathered: 2026-01-19*
