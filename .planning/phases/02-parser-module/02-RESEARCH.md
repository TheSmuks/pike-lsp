# Phase 02: Parser Module - Research

**Researched:** 2026-01-19
**Domain:** Pike parsing, tokenization, compilation, batch processing
**Confidence:** HIGH

## Summary

Phase 02 extracts four tightly-coupled parsing handlers from the monolithic `analyzer.pike` (lines 85-542, 2007-2064) into a modular `Parser.pike` class. The handlers share significant state and helper functions - extracting them together preserves cohesion while enabling reuse. The new `Parser.pike` will use shared infrastructure from Phase 1 (`Cache.pmod` for compiled program caching, `Compat.trim_whites()` for string operations, `module.pmod` for constants and utilities) and wrap all handlers in catch blocks for JSON-RPC error responses.

The current implementation uses direct global cache access (`program_cache`, `stdlib_cache` mappings) and native `String.trim_whites()`. These must migrate to `LSP.Cache.put_program()/get_program()` and `LSP.Compat.trim_whites()`. The context document specifies that the Parser itself should be stateless - caching is a handler concern, not a parser concern.

**Primary recommendation:** Extract `handle_parse`, `handle_tokenize`, `handle_compile`, and `handle_batch_parse` as public methods of `Parser.pike`, move shared helpers (`extract_autodoc_comments`, `symbol_to_json`, `parse_autodoc`, `get_symbol_kind`, `type_to_json`) as protected methods, and update all string operations to use `LSP.Compat.trim_whites()`.

## Standard Stack

### Core (from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `LSP.module.pmod` | Phase 1 | Constants (`MAX_TOP_LEVEL_ITERATIONS`, `MAX_BLOCK_ITERATIONS`), JSON helpers, debug logging | Central infrastructure from Phase 1 |
| `LSP.Cache.pmod` | Phase 1 | LRU caching for compiled programs (`put_program`, `get_program`, `clear_programs`) | Replaces direct `program_cache` mapping access |
| `LSP.Compat.pmod` | Phase 1 | Version-compatible `trim_whites()` function | Replaces `String.trim_whites()` (Pike 8.x doesn't trim newlines) |

### Pike Stdlib (existing usage)
| Module | Purpose | Why Used |
|--------|---------|----------|
| `Tools.AutoDoc.PikeParser` | Parse Pike declarations and extract symbols | Native Pike parser, already in use |
| `Parser.Pike` | Tokenize Pike source code (`split`, `tokenize`) | Native Pike tokenizer, already in use |
| `compile_string()` | Compile code and capture diagnostics | Native compilation with error capture |
| `master()->set_inhibit_compile_errors()` | Capture compilation errors/warnings | Pike's standard error capture mechanism |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `Standards.JSON` | JSON encode/decode for error responses | When returning JSON-RPC errors from catch blocks |
| `Stdio.exist()` | File existence checks | For future file-based operations |

### Not Used in This Phase
| Module | Purpose | Deferred to Phase |
|--------|---------|-------------------|
| `LSP.Logging.pmod` | Structured logging | Not yet implemented (use `LSP.debug()` from module.pmod) |
| `LSP.Protocol.pmod` | JSON-RPC protocol helpers | Not yet implemented (return raw mappings) |

**Installation:**
No new packages needed - all dependencies are either Phase 1 deliverables or Pike stdlib.

```bash
# LSP.pmod modules from Phase 1
# Already in place at pike-scripts/LSP.pmod/
```

## Architecture Patterns

### Recommended Project Structure
```
pike-scripts/LSP.pmod/
├── module.pmod          # Constants, JSON helpers, debug (Phase 1)
├── Compat.pmod          # Version compatibility (Phase 1)
├── Cache.pmod           # LRU caching (Phase 1)
├── Parser.pike          # NEW: Parsing handlers (this phase)
└── ...
```

### Pattern 1: Stateless Parser Class with Pure Functions
**What:** Parser is a pure function - source code in, structured result out. No internal state, no side effects.

**When to use:** For all parsing operations. Parser methods should not modify any internal state.

**Example:**
```pike
// Source: Based on CONTEXT.md decisions
class Parser {
    //! Parse Pike source and extract symbols
    //! @param params Mapping with "code", "filename", "line" keys
    //! @returns Mapping with "result" containing "symbols" and "diagnostics"
    mapping parse_request(mapping params) {
        string code = params->code || "";
        string filename = params->filename || "input.pike";

        // ... parsing logic ...

        return ([
            "result": ([
                "symbols": symbols,
                "diagnostics": diagnostics
            ])
        ]);
    }

    // Protected helper - underscore prefix after visibility
    protected array(mapping) _extract_symbols(string code, string filename) {
        // ... implementation ...
    }
}
```

### Pattern 2: Handler Wraps Parser with Caching
**What:** Handler (not Parser) owns cache interaction. Parser is stateless and doesn't know about caching.

**When to use:** For all cached parsing operations. Handler checks cache first, calls Parser on miss.

**Example:**
```pike
// Handler code (not in Parser.pike)
mapping handle_parse_with_cache(mapping params) {
    string uri = params->uri;
    int version = params->version;

    // Check cache first (handler responsibility)
    mixed cached = LSP.Cache.get("program_cache", uri);
    if (cached && cached->version == version) {
        return cached->result;  // Cache hit
    }

    // Cache miss - parse
    Parser parser = Parser();
    mapping result = parser->parse_request(params);

    // Store in cache
    LSP.Cache.put("program_cache", uri, ([
        "version": version,
        "result": result
    ]));

    return result;
}
```

### Pattern 3: JSON-RPC Error Response from Catch Block
**What:** Wrap handlers in catch blocks that return JSON-RPC error mappings instead of crashing.

**When to use:** For all handler entry points exposed to JSON-RPC.

**Example:**
```pike
// In handler wrapper
mapping handle_parse_request(mapping params) {
    Parser parser = Parser();

    mixed err = catch {
        return parser->parse_request(params);
    };

    // Return JSON-RPC error on exception
    return ([
        "error": ([
            "code": -32000,
            "message": describe_error(err)
        ])
    ]);
}
```

### Pattern 4: Protected Helper Naming Convention
**What:** Internal helpers use `protected` visibility with underscore prefix after visibility.

**When to use:** For all internal methods not part of public API.

**Example:**
```pike
// Public API
mapping parse_request(mapping params) { ... }

// Internal helpers
protected array(mapping) _tokenize(string source) { ... }
protected mapping _build_ast(string source) { ... }
protected mapping _format_error(mixed err) { ... }
```

### Anti-Patterns to Avoid
- **Storing cache in Parser:** Parser should be stateless. Cache lives in handler or separate layer.
- **Direct `String.trim_whites()` usage:** Use `LSP.Compat.trim_whites()` for cross-version compatibility.
- **Throwing from handlers on parse errors:** Parse errors are expected output, return in result structure.
- **Global state in Parser:** No module-level variables in Parser.pike. All state passed as parameters.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pike parsing | Custom tokenizer/parser | `Tools.AutoDoc.PikeParser` + `Parser.Pike` | Pike's native parser handles edge cases, preprocessor directives, and all Pike syntax correctly |
| String trimming whitespace | Manual char-by-char loop | `LSP.Compat.trim_whites()` | Handles spaces, tabs, newlines, carriage returns; cross-version compatible |
| LRU cache eviction | Manual timestamp tracking | `LSP.Cache.put_program()/get_program()` | Thread-safe, proven LRU algorithm, statistics tracking |
| JSON encoding/decoding | Manual string concatenation | `LSP.json_encode()/json_decode()` | Handles all Pike data types, Unicode, escapes |
| Compilation error capture | try/catch around compile | `master()->set_inhibit_compile_errors()` | Pike's standard mechanism captures file/line/message correctly |

**Key insight:** The current `analyzer.pike` already uses the right stdlib tools (`Tools.AutoDoc.PikeParser`, `Parser.Pike`, `master()->set_inhibit_compile_errors()`). The extraction is about organization, not reimplementation.

## Common Pitfalls

### Pitfall 1: Using `String.trim_whites()` Instead of `LSP.Compat.trim_whites()`
**What goes wrong:** Pike 8.x's native `String.trim_whites()` doesn't trim newlines (`\n`), only spaces and tabs. This breaks preprocessing logic that expects newlines to be removed.

**Why it happens:** Pike 8.x changed the behavior. The polyfill in `Compat.pmod` provides consistent behavior across versions.

**How to avoid:** Search/replace all `String.trim_whites(` with `LSP.Compat.trim_whites(` in extracted code.

**Warning signs:** Preprocessed code has unexpected leading/trailing newlines; tests fail on Pike 8.x.

### Pitfall 2: Putting Cache Logic Inside Parser
**What goes wrong:** Parser becomes stateful, harder to test, and violates the "pure function" design from CONTEXT.md.

**Why it happens:** It's tempting to move cache checks directly into `Parser.pike` since the current code has direct access.

**How to avoid:** Keep Parser stateless. Cache interaction stays in handler layer (outside Parser.pike).

**Warning signs:** Parser constructor takes a cache parameter; Parser methods access external mutable state.

### Pitfall 3: Forgetting to Update Import Paths After Extraction
**What goes wrong:** Code references `Tools.AutoDoc.PikeParser` but import path changes after extraction.

**Why it happens:** Moving code from script top-level to class method changes scope.

**How to avoid:** Verify all Pike stdlib imports still work at class scope. Most don't need explicit imports.

**Warning signs:** Compiler errors about undefined symbols or missing classes.

### Pitfall 4: Inconsistent Error Response Format
**What goes wrong:** Some handlers return `(["result": ...])`, others return `(["error": ...])`, caller can't distinguish.

**Why it happens:** catch blocks added inconsistently.

**How to avoid:** Always wrap handler entry points in catch with consistent error format.

**Warning signs:** Client code has to check both `result` and `error` keys on every response.

### Pitfall 5: Losing Line Number Information During Preprocessing
**What goes wrong:** Preprocessor removes preprocessor directives but doesn't preserve line numbers, making diagnostics point to wrong locations.

**Why it happens:** Replacing directives with `""` instead of `"\n"` collapses lines.

**How to avoid:** Replace skipped directives with blank lines (`"\n"`) to preserve line numbering (already done correctly in current code).

**Warning signs:** Diagnostic line numbers don't match source file lines.

## Code Examples

Verified patterns from existing analyzer.pike:

### Extracting Symbols with PikeParser
```pike
// Source: pike-scripts/analyzer.pike:131-141
mixed err = catch {
    object parser = Tools.AutoDoc.PikeParser(preprocessed, filename, line);

    int iter = 0;
    while (parser->peekToken() != "" && iter++ < MAX_TOP_LEVEL_ITERATIONS) {
        string current_token = parser->peekToken();

        // Try to parse a declaration
        mixed decl;
        mixed parse_err = catch {
            decl = parser->parseDecl();
        };

        // ... handle declaration ...
    }
};
```

### Tokenizing with Parser.Pike
```pike
// Source: pike-scripts/analyzer.pike:458-469
array(string) split_tokens = Parser.Pike.split(code);
array pike_tokens = Parser.Pike.tokenize(split_tokens);

foreach (pike_tokens, mixed t) {
    tokens += ({
        ([
            "text": t->text,
            "line": t->line,
            "file": t->file
        ])
    });
}
```

### Compilation with Error Capture
```pike
// Source: pike-scripts/analyzer.pike:495-541
array diagnostics = ({});

void capture_error(string file, int line, string msg) {
    diagnostics += ({
        ([
            "message": msg,
            "severity": "error",
            "position": ([
                "file": file,
                "line": line
            ])
        ])
    });
}

mixed old_error = master()->get_inhibit_compile_errors();
master()->set_inhibit_compile_errors(capture_error);

mixed err = catch {
    compile_string(code, filename);
};

master()->set_inhibit_compile_errors(old_error);
```

### Batch Parse Reusing Single Parse
```pike
// Source: pike-scripts/analyzer.pike:2007-2056
array results = ({});

foreach (files, mapping file_info) {
    string code = file_info->code || "";
    string filename = file_info->filename || "unknown.pike";

    mixed parse_err;
    mapping parse_result;

    parse_err = catch {
        parse_result = handle_parse(([
            "code": code,
            "filename": filename,
            "line": 1
        ]));
    };

    if (parse_err) {
        // On error, return result with error diagnostic
        results += ({ error_result(filename, parse_err) });
    } else {
        results += ({ success_result(filename, parse_result) });
    }
}
```

### String Trimming Migration
```pike
// OLD (analyzer.pike - 21 occurrences)
string trimmed = String.trim_whites(src_line);

// NEW (Parser.pike)
string trimmed = LSP.Compat.trim_whites(src_line);
```

## State of the Art

| Old Approach (analyzer.pike) | New Approach (Parser.pike) | Migration |
|------------------------------|---------------------------|-----------|
| Global `program_cache` mapping | `LSP.Cache.put_program()/get_program()` | Move cache ownership to handler |
| Global `debug_mode` variable | `LSP.get_debug_mode()/set_debug_mode()` | Use module.pmod functions |
| `String.trim_whites()` native | `LSP.Compat.trim_whites()` | Replace all 21 occurrences |
| Handlers as top-level functions | Parser class methods | Extract to `class Parser { ... }` |
| Uncaught errors crash server | Catch blocks return JSON-RPC errors | Wrap all handlers |

**Existing patterns to preserve:**
- `Tools.AutoDoc.PikeParser` usage (lines 131-386)
- `Parser.Pike.tokenize()` usage (lines 458-469)
- `master()->set_inhibit_compile_errors()` pattern (lines 523-541)
- Preprocessing with line preservation (lines 97-129)
- Autodoc comment extraction (lines 417-450)

## Open Questions

1. **Helper function placement:** Some helpers like `extract_autodoc_comments`, `symbol_to_json`, `parse_autodoc`, `get_symbol_kind`, `type_to_json` are used by other handlers (resolve, introspect, etc.). Should they:
   - Stay in Parser.pike as protected methods (only Parser uses them)?
   - Move to a shared Symbols.pike module (other handlers need them too)?
   - **Recommendation:** Keep in Parser.pike for this phase, extract to shared module in Phase 3 if needed.

2. **Constants migration:** `MAX_TOP_LEVEL_ITERATIONS` and `MAX_BLOCK_ITERATIONS` are duplicated between `module.pmod` and `analyzer.pike`. Should they:
   - Be removed from analyzer.pike and only live in module.pmod?
   - Be accessed as `LSP.MAX_TOP_LEVEL_ITERATIONS` from Parser?
   - **Recommendation:** Yes, use `LSP.MAX_*` constants from module.pmod, remove duplicates.

3. **Handler instantiation:** Should Parser be instantiated once per request or once globally?
   - Per request: `Parser parser = Parser(); parser->parse_request(params);`
   - Global singleton: `LSP.Parser->parse_request(params);`
   - **Recommendation:** Per request is cleaner (stateless anyway), avoids global state issues.

## Sources

### Primary (HIGH confidence)
- **pike-scripts/analyzer.pike** - Full file read (lines 1-3222):
  - `handle_parse()` function (lines 85-413)
  - `handle_tokenize()` function (lines 452-486)
  - `handle_compile()` function (lines 488-542)
  - `handle_batch_parse()` function (lines 2007-2064)
  - Helper functions: `extract_autodoc_comments()`, `symbol_to_json()`, `parse_autodoc()`, `get_symbol_kind()`, `type_to_json()`
- **pike-scripts/LSP.pmod/module.pmod** - Constants and utility functions
- **pike-scripts/LSP.pmod/Compat.pmod** - `trim_whites()` polyfill
- **pike-scripts/LSP.pmod/Cache.pmod** - LRU caching interface
- **.planning/phases/02-parser-module/02-CONTEXT.md** - Design decisions and constraints
- **test/tests/foundation-tests.pike** - Testing patterns from Phase 1
- **test/tests/e2e-foundation-tests.pike** - E2E testing patterns

### Secondary (MEDIUM confidence)
- **.planning/phases/01-foundation/01-CONTEXT.md** - Phase 1 architecture decisions
- **Grep results** - 21 occurrences of `String.trim_whites()` requiring migration

### Tertiary (LOW confidence)
- None - all findings from direct code inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - based on existing Phase 1 deliverables and stdlib usage
- Architecture: HIGH - from CONTEXT.md design decisions and existing code patterns
- Pitfalls: HIGH - identified from code inspection and CONTEXT.md guidance
- Migration path: HIGH - exact line numbers and function locations verified

**Research date:** 2026-01-19
**Valid until:** 30 days (Phase 1 foundation is stable; Parser extraction is straightforward refactoring)
