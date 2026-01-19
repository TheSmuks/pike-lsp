# Phase 2: Parser Module - Context

**Gathered:** 2026-01-19
**Status:** Ready for planning

## Phase Boundary

Extract parsing, tokenization, compilation, and batch parsing handlers from the monolithic `analyzer.pike` into a `Parser.pike` class that uses shared infrastructure (module.pmod, Compat.pmod, Cache.pmod). The parser is a stateless transformation component — source code in, structured results out. The protocol layer owns caching, error formatting, and LSP communication.

This phase does NOT add new capabilities. It refactors existing functionality into a modular structure.

## Implementation Decisions

### Class Structure

**Single-file design:** All four handlers (`parse_request`, `tokenize_request`, `compile_request`, `batch_parse_request`) in one `Parser.pike` file.

- **Rationale:** Parser operations are tightly coupled (tokenization feeds parsing, parsing feeds compilation, batch parsing reuses single-file parsing). Splitting creates artificial boundaries and forces shared state to leak between files.
- **Internal organization:** Public API section (entry points), Lexer internals (token recognition, position tracking), Parser internals (grammar rules, AST construction), Shared helpers (error formatting, node factories).
- **Extraction threshold:** If Parser.pike exceeds 500 lines, extract lexer into separate `Lexer.pike`. Lexer has clean boundary (source in, token stream out).
- **File location:** `pike-scripts/LSP.pmod/Parser.pike` — inside LSP module namespace.

**Constructor:** `Parser()` — no arguments.

- Parser is a pure function. Source text in, structured result out. No state, no side effects.
- Originally considered `Parser(Context ctx)` for logging, but decided: parse errors are expected output, not operational issues. Parser accumulates errors in result structure; caller decides whether to log.
- Maximum testability: no mocks needed, no global state to reset.

**Internal methods:** Use `protected` keyword for helpers.

- Follows Pike stdlib convention (e.g., `System.Inotify` uses `protected mapping(int:object) watches`).
- Example: `protected array(mapping) _tokenize(string source, int|void options)`
- Internal helper naming: underscore prefix after visibility (`_tokenize`, `_build_ast`, `_format_error`).

**Public API naming:** Verb-noun pattern.

- `parse_request(mapping params)` — returns symbols + diagnostics
- `tokenize_request(mapping params)` — returns token stream
- `compile_request(mapping params)` — returns compilation result
- `batch_parse_request(mapping params)` — returns multiple parse results
- Explicit about handling requests, follows good Pike conventions.

**Dependencies:**

| Dependency | Source | Purpose |
|------------|--------|---------|
| Source text | Method parameter | Input to parse |
| Compat helpers | `LSP.trim_whites()` | String operations |
| Logging | None | Parser has no logging (pure function) |
| Cache | None | Handler owns cache, not Parser |

### Test Coverage

**Hybrid approach:** Unit tests for internal logic, integration tests for real Pike code validation.

- **Ratio:** 3:1 unit to integration (favor unit tests — fast, focused, pinpoint failures).
- **Unit test focus:** Individual constructs in isolation — tokens (string literals with escapes, nested comments), expressions (operator precedence, array/mapping literals), declarations (class inheritance, function signatures), recovery (missing semicolons, unclosed braces).
- **Integration test focus:** Real Pike code — stdlib samples (known-good complex code), malformed files (error handling under realistic conditions), cross-file (inheritance, imports, batch parsing).

**Test organization:** Separate files by type.

- `test/tests/parser-unit-tests.pike` — fast, many cases, run frequently during development
- `test/tests/parser-integration-tests.pike` — slower, requires real Pike compiler, run before commits
- Matches existing convention (`foundation-tests.pike` already exists).
- Growth path: if unit tests exceed 50 test functions, split by concern (tokenize, AST, errors) — flat files, clear names, no nested directories until truly necessary.

**Test fixtures:** Hybrid inline + shared directory.

- **Inline:** Simple cases under 10 lines or single-use — string literals with escapes, one-liner edge cases, malformed code with inline explanations.
- **Fixture directory:** `test/fixtures/parser/` for complex/reusable — class-inheritance.pike, stdlib-sample.pike, large-file.pike.
- **Guideline:** Inline if under 10 lines. Fixture file if over 10 lines or reused across multiple tests.

**Error verification:** Presence check with location verification.

- Check three things per error: error occurred at expected line, error has expected code/type, message contains key term.
- Do NOT verify: exact message text (brittle), column number (often imprecise), error order (implementation-dependent), total count (cascading errors inflate unpredictably).
- Test helper pattern: `assert_error_at_line(errors, 5, "Expected")` — readable assertions, flexible on wording, strict on location.
- For recovery tests: verify parser continued after error, subsequent valid constructs still parsed, AST contains placeholder nodes for invalid sections.

### Error Handling

**Return pattern:** Result + errors mapping (never throw on malformed input).

- Parsing errors are not exceptional — users type broken code constantly. Parser must always return something useful.
- **Return structure:** `([ "ast": <partial or complete>, "tokens": <stream>, "symbols": <extracted>, "errors": <array>, "incomplete": <bool> ])`
- `ast`: Partial or complete AST (null only if completely unparseable)
- `errors`: List of errors with line, column, code, message (see structure below)
- `incomplete`: Boolean flag for truncated/mid-typing input

**Individual error structure:** Mapping struct.

```pike
([
    "line": 5,              // 1-indexed line number
    "column": 10,           // 1-indexed column number
    "end_line": 5,          // End position for range
    "end_column": 11,       // End position for range
    "code": "missing_semicolon",  // Machine-readable code
    "severity": 1,          // 1=error, 2=warning, 3=info, 4=hint
    "message": "Expected ';' after statement"
])
```

- Parser should NOT depend on LSP types. Mappings are Pike-idiomatic for structured data. Protocol layer converts to LSP Diagnostic format.
- **Conversion to LSP:** Protocol layer or handler converts parser fields to LSP Diagnostic fields (line/column → range.start, end_line/end_column → range.end, severity → severity, message → message, constant source = "pike-lsp").

**Logging:** No logging in Parser.

- Parse errors are expected output, not operational issues. Errors exist in result structure; caller already has them.
- Logging and returning are redundant.
- What caller might log (if anything): debug mode summary like "Parsed foo.pike: 3 errors, 45 symbols extracted"
- Parser uses Context for: nothing. Pure function, no side effects.

**Error recovery:** Panic mode synchronization + placeholder nodes.

- **Synchronization points:** Resume at `;` (next statement), `}` (end of block), `{` (start of new block), `class` keyword (new class), `function` keyword or type (new function), EOF (stop).
- **Combined strategy:** Error detected → record error with location → panic mode skip tokens until sync point → insert placeholder node for skipped region → resume parsing from sync point.
- **Placeholder nodes matter:** Without them, AST has holes. With placeholders like `(incomplete)`, handlers know context for completions.
- **Cascading error limit:** Stop adding errors after threshold (10 per file). First errors are usually real; later errors are often noise from recovery.
- **Goal:** Always return structurally complete AST. Every open brace has close. Every class has boundaries. Handlers traverse without null checks everywhere.

### Cache Integration

**Parser has no cache.** This is critical.

- Parser is stateless pure function. Cache decisions belong to the caller (handlers or protocol layer).
- Handler owns cache interaction: receive request → check cache (key = URI + version match) → miss → call Parser.parse(source) → store result in cache → return to client.
- Parser never knows caching exists. Parser created without dependencies. Caller checks cache before calling. Caller stores result after. Parser stays pure.

**Cache key strategy (handler responsibility):** URI as key, value stores version.

```
cache key = URI (e.g., "file:///path/foo.pike")
cache value = ([ "version": 12, "program": <compiled>, "symbols": <symbol table> ])
```

- **Why not content hash:** Hash computation expensive on every lookup. LSP already tracks versions — redundant work.
- **Why not URI only:** Requires explicit invalidation. Version check is self-validating.
- **Lookup behavior:** `entry = cache.get(uri)`; if entry exists and `entry.version == current_version` → hit, else → miss.
- **Benefits:** Fast lookup (string key, no hash), self-validating (stale version never returned), undo-friendly (same version on undo hits cache), LSP-native (uses protocol's own versioning).

**Cache timing:** Request-time check, not background.

- Request arrives → handler extracts URI + version → check cache (version match?) → miss → parse and cache → hit → use cached.
- No background threads, no race conditions. Request-time parse is usually fast enough.

**Cache lifetime:** Session lifetime.

- Cache persists for LSP server session, discarded on shutdown. LRU handles memory pressure. Version keys handle staleness automatically.
- **No explicit invalidation needed:** Version mismatch after save/edits causes fresh parse automatically.
- **No disk persistence:** Compiled programs may not serialize cleanly. Versioning issues when Pike/LSP version changes. Corruption risk. Complexity (directory management, cleanup, permissions).
- **didClose handling:** Default: retain cached entry (expect file reopen soon). Evict if cache size exceeded (LRU handles naturally).

**Observability:** Debug mode logging (not in response payloads).

- Cache stats belong to Cache module (already implemented: size, hits, misses, evictions, hit_rate).
- Do NOT include cache stats in completion/hover responses. Use separate diagnostic channels: debug logs (stderr/file), custom LSP notification, status bar via window/showMessage.
- Stats are operational telemetry. Keep separate from feature responses.

### Claude's Discretion

- Exact panic mode synchronization heuristics (how many tokens to skip, what constitutes a sync point edge case)
- Placeholder node representation in AST (exact structure, marker values)
- Error code taxonomy (what codes to define, categorization scheme)
- Exact spacing and organization within Parser.pike file (section ordering, comment density)

## Specific Ideas

- "Parser should feel like a compiler component — pure, stateless, predictable. Input → output. No hidden state, no side effects."
- Test helper pattern: `assert_error_at_line(errors, 5, "Expected")` for readable, flexible error assertions
- "Error recovery is about providing useful completions in broken files, not about perfect error messages."
- Cache versioning leverages LSP's own document versions — no reinventing the wheel

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 02-parser-module*
*Context gathered: 2026-01-19*
