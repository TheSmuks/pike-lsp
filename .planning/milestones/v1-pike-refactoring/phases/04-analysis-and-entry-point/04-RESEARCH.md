# Phase 04: Analysis & Entry Point - Research

**Researched:** 2026-01-19
**Domain:** Analysis handlers, router architecture, JSON-RPC dispatch
**Confidence:** HIGH

## Summary

Phase 04 extracts three analysis handlers (`handle_find_occurrences`, `handle_analyze_uninitialized`, `handle_get_completion_context`) from the monolithic `analyzer.pike` (lines 1233-2424) into a new `Analysis.pike` class, then refactors `analyzer.pike` into a lightweight JSON-RPC router that delegates to `Parser.pike`, `Intelligence.pike`, and `Analysis.pike`. The three handlers share tokenization logic via `Parser.Pike.split/tokenize()` and helper functions for scope analysis and position calculation.

The router design follows a dispatch table pattern per CONTEXT.md decisions: explicit method-to-handler mapping with single `dispatch()` function for routing and error normalization. Module instantiation uses the singleton pattern with a `Context` class as service container. Backward compatibility is maintained via compatible enhancements - additive changes allowed, breaking changes prohibited.

**Primary recommendation:** Extract analysis handlers into `Analysis.pike` following the same stateless pattern as `Parser.pike` and `Intelligence.pike`. Move helper functions based on actual usage (analysis-domain helpers to `Analysis.pike`, general utilities noted for future `Util.pmod` extraction). Implement dispatch table router with `Context` for dependency injection. Maintain backward compatibility by preserving the JSON-RPC request/response contract.

## Standard Stack

### Core (from Previous Phases)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `LSP.module.pmod` | Phase 1 | Constants (`MAX_*`), JSON helpers, debug logging, `LSPError` class | Central infrastructure from Phase 1 |
| `LSP.Cache.pmod` | Phase 1 | LRU caching (`put_program/get_program`, `put_stdlib/get_stdlib`) | Used by Intelligence, Analysis will follow same pattern |
| `LSP.Compat.pmod` | Phase 1 | `trim_whites()` for cross-version string operations | Replace all `String.trim_whites()` occurrences |
| `LSP.Parser.pike` | Phase 2 | Stateless parsing/tokenization (`parse_request`, `tokenize_request`) | Analysis uses `Parser.Pike` for tokenization |
| `LSP.Intelligence.pike` | Phase 3 | Introspection/resolution handlers | Pattern template for Analysis extraction |

### Pike Stdlib (existing usage)
| Module | Purpose | Why Used |
|--------|---------|----------|
| `Parser.Pike` | Tokenize Pike source (`split`, `tokenize`) | Used by all three analysis handlers |
| `master()->resolv()` | Runtime module resolution | Dynamic class loading pattern |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `Standards.JSON` | JSON encode/decode for JSON-RPC responses | In router's main() loop |
| `describe_error()` | Format error messages for JSON-RPC errors | In catch blocks |

**Installation:**
No new packages needed - all dependencies are from previous phases or Pike stdlib.

## Architecture Patterns

### Recommended Project Structure
```
pike-scripts/
├── analyzer.pike           # REFACTOR: Router/entry point (dispatch table)
└── LSP.pmod/
    ├── module.pmod          # Constants, JSON helpers, debug, LSPError (Phase 1)
    ├── Compat.pmod          # Version compatibility (Phase 1)
    ├── Cache.pmod           # LRU caching (Phase 1)
    ├── Parser.pike          # Parsing handlers (Phase 2)
    ├── Intelligence.pike    # Introspection handlers (Phase 3)
    └── Analysis.pike        # NEW: Analysis handlers (this phase)
```

### Pattern 1: Stateless Analysis Class (follows Parser/Intelligence pattern)
**What:** `Analysis.pike` is stateless - all methods are pure functions receiving `params` and returning results.

**When to use:** For all three analysis handlers (`find_occurrences`, `analyze_uninitialized`, `get_completion_context`).

**Example:**
```pike
// Source: Based on CONTEXT.md and existing analyzer.pike pattern
//! Analysis.pike - Stateless analysis class for Pike LSP
class Analysis {
    //! Create a new Analysis instance
    void create() {
        // No state to initialize (stateless pattern per Intelligence.pike)
    }

    //! Find all identifier occurrences using tokenization
    //! @param params Mapping with "code" key
    //! @returns Mapping with "result" containing "occurrences" array
    mapping handle_find_occurrences(mapping params) {
        mixed err = catch {
            return find_occurrences_impl(params);
        };

        // Return LSPError on exception (per Intelligence pattern)
        return LSP.LSPError(-32000, describe_error(err))->to_response();
    }

    protected mapping find_occurrences_impl(mapping params) {
        // ... implementation using Parser.Pike ...
    }
}
```

### Pattern 2: Dispatch Table Router
**What:** Router uses constant mapping of method names to handler functions, with single `dispatch()` function.

**When to use:** For the refactored `analyzer.pike` entry point.

**Example:**
```pike
// Source: Based on CONTEXT.md router design decision
constant HANDLERS = ([
    "parse": lambda(mapping params) {
        program ParserClass = master()->resolv("LSP.Parser")->Parser;
        return ParserClass()->parse_request(params);
    },
    "tokenize": lambda(mapping params) {
        program ParserClass = master()->resolv("LSP.Parser")->Parser;
        return ParserClass()->tokenize_request(params);
    },
    "introspect": lambda(mapping params) {
        return intelligence_instance->handle_introspect(params);
    },
    "resolve": lambda(mapping params) {
        return intelligence_instance->handle_resolve(params);
    },
    "resolve_stdlib": lambda(mapping params) {
        return intelligence_instance->handle_resolve_stdlib(params);
    },
    "get_inherited": lambda(mapping params) {
        return intelligence_instance->handle_get_inherited(params);
    },
    "find_occurrences": lambda(mapping params) {
        return analysis_instance->handle_find_occurrences(params);
    },
    "analyze_uninitialized": lambda(mapping params) {
        return analysis_instance->handle_analyze_uninitialized(params);
    },
    "get_completion_context": lambda(mapping params) {
        return analysis_instance->handle_get_completion_context(params);
    },
    "batch_parse": lambda(mapping params) {
        program ParserClass = master()->resolv("LSP.Parser")->Parser;
        return ParserClass()->batch_parse_request(params);
    },
    "set_debug": lambda(mapping params) {
        // Direct handler in router
        return handle_set_debug(params);
    },
]);

protected mapping dispatch(string method, mapping params, Context ctx) {
    // Get handler from dispatch table
    function handler = HANDLERS[method];

    if (!handler) {
        return ([
            "error": ([
                "code": -32601,
                "message": "Method not found: " + method
            ])
        ]);
    }

    // Call handler with error normalization
    mixed err = catch {
        return handler(params, ctx);
    };

    return ([
        "error": ([
            "code": -32000,
            "message": describe_error(err)
        ])
    ]);
}
```

### Pattern 3: Context as Service Container
**What:** `Context` class holds all shared resources (caches, logger, module instances), passed to handlers.

**When to use:** For dependency injection in the router (per CONTEXT.md).

**Example:**
```pike
// Source: Based on CONTEXT.md Module Instantiation decision
class Context {
    LSP.Cache program_cache;
    LSP.Cache stdlib_cache;
    LSP.Parser parser;
    LSP.Intelligence intelligence;
    LSP.Analysis analysis;
    int debug_mode;
    mapping client_capabilities;

    void create() {
        // Initialize caches
        program_cache = LSP.Cache();
        stdlib_cache = LSP.Cache();

        // Initialize module instances (singleton pattern)
        program ParserClass = master()->resolv("LSP.Parser")->Parser;
        parser = ParserClass();

        program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence;
        intelligence = IntelligenceClass();

        program AnalysisClass = master()->resolv("LSP.Analysis")->Analysis;
        analysis = AnalysisClass();

        debug_mode = 0;
        client_capabilities = ([]);
    }
}
```

### Pattern 4: Helper Extraction Decision Tree
**What:** Per CONTEXT.md, helpers extracted based on actual need during implementation.

**When to use:** When deciding where to place each helper function.

```
Helper Function Placement Decision:
┌─────────────────────────────────────────────────────────────┐
│ Is the helper Analysis-domain logic?                        │
│ (scope analysis, variable tracking, completion context)    │
├─────────────┬──────────────────────────────────────────┬─────┤
│ YES         │ NO                                        │     │
▼             │                                            │     │
Move to       │ Is it used by multiple modules?            │     │
Analysis.pike │ (Parser, Intelligence, Analysis)           │     │
as protected  ├─────────────┬──────────────────────────┬─────┤
│             │ YES         │ NO                        │     │
│             │             │                            │     │
│             │             ▼                            │     │
│             │ Leave in router,                         │     │
│             │ note for Util.pmod                       │     │
│             │             ▼                            │     │
│             │             Only Analysis uses today?     │     │
│             │             ├────┬─────────────────────┬─────┤
│             │             │YES│NO                    │     │
│             │             │   │                      │     │
│             │             │   │ Move to Analysis      │     │
│             │             ▼   │ Leave in router, note │     │
│             │          General utility?                │     │
│             │          Leave in router, note for Util  │     │
└─────────────┴──────────────────────────────────────────┴─────┘
```

### Anti-Patterns to Avoid
- **Storing state in Analysis:** Analysis should be stateless like Parser and Intelligence.
- **Direct cache access in modules:** Use Context for cache access, not direct LSP.Cache calls.
- **Breaking JSON-RPC contract:** Response structure must remain compatible.
- **Extracting all helpers upfront:** Follow CONTEXT.md guidance - extract based on actual need.
- **Multiple instantiation patterns:** Use singleton for modules, not per-request instantiation.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pike tokenization | Custom lexer | `Parser.Pike.split()` + `Parser.Pike.tokenize()` | Native tokenizer handles all Pike syntax edge cases |
| String trimming | Manual char loop | `LSP.Compat.trim_whites()` | Cross-version compatible, handles newlines |
| LRU caching | Manual timestamp tracking | `LSP.Cache.put()/get()` | Proven LRU algorithm, statistics tracking |
| Error responses | Manual error mapping | `LSP.LSPError(-32000, msg)->to_response()` | Consistent JSON-RPC error format |
| Module loading | Hard-coded imports | `master()->resolv("LSP.Module")->Class` | Dynamic resolution, follows existing pattern |

**Key insight:** The three analysis handlers already use `Parser.Pike` for tokenization. The extraction is about code organization, not reimplementing tokenization.

## Common Pitfalls

### Pitfall 1: Over-Extracting Helpers Prematurely
**What goes wrong:** Extracting "general" utilities that only Analysis uses creates unnecessary abstraction and makes code harder to navigate.

**Why it happens:** Anticipating future needs instead of following actual usage patterns.

**How to avoid:** Follow CONTEXT.md decision: extract based on actual need during implementation. Note candidates for Util.pmod in PLAN.md, don't create prematurely.

**Warning signs:** Creating Util.pmod with functions only used by one module.

### Pitfall 2: Breaking Backward Compatibility
**What goes wrong:** Changing response structure breaks existing VSCode extension.

**Why it happens:** Restructuring code without preserving the JSON-RPC contract.

**How to avoid:** Response format tests per CONTEXT.md. Verify required fields preserved. Additive changes only.

**Warning signs:** Removing or renaming required response fields.

### Pitfall 3: Router State Leaks
**What goes wrong:** Router accumulates state across requests, causing bugs in long-running server.

**Why it happens:** Treating Context as mutable global state instead of immutable service container.

**How to avoid:** Context should be created once at startup. Handlers receive Context but don't mutate it (except cache contents).

**Warning signs:** Handler modifies Context fields other than cache contents.

### Pitfall 4: Inconsistent Error Response Format
**What goes wrong:** Some errors have `code/message`, others have different structure, confusing clients.

**Why it happens:** Mix of LSP.LSPError usage and manual error mapping construction.

**How to avoid:** Always use `LSP.LSPError(code, message)->to_response()` for handler errors.

**Warning signs:** Manual error mapping construction in multiple places.

### Pitfall 5: Tokenization Without Error Handling
**What goes wrong:** Malformed Pike code causes tokenization to throw, crashing the analysis.

**Why it happens:** Not wrapping `Parser.Pike.split/tokenize` in catch blocks.

**How to avoid:** All three handlers should wrap tokenization in catch blocks, return empty/partial results on error.

**Warning signs:** Analysis crashes on edge case syntax (incomplete code, mid-typing).

## Code Examples

Verified patterns from existing analyzer.pike to preserve:

### Find Occurrences Handler
```pike
// Source: pike-scripts/analyzer.pike:1235-1300
protected mapping handle_find_occurrences(mapping params) {
  string code = params->code || "";
  array occurrences = ({});
  array(string) keywords = ({ "if", "else", "elif", "for", ... });

  mixed err = catch {
    array(string) split_tokens = Parser.Pike.split(code);
    array pike_tokens = Parser.Pike.tokenize(split_tokens);

    foreach (pike_tokens, mixed t) {
      string text = t->text;
      int line = t->line;

      // Filter identifiers (not keywords)
      if (sizeof(text) > 0 && (text[0] >= 'a' && text[0] <= 'z' || ...)) {
        if (!has_value(keywords, text)) {
          occurrences += ({
            ([
              "text": text,
              "line": line,
              "character": get_char_position(code, line, text)
            ])
          });
        }
      }
    }
  };

  if (err) {
    return ([
      "error": ([
        "code": -32000,
        "message": describe_error(err)
      ])
    ]);
  }

  return ([
    "result": ([
      "occurrences": occurrences
    ])
  ]);
}
```

### Uninitialized Variable Analysis Entry
```pike
// Source: pike-scripts/analyzer.pike:1545-1566
protected mapping handle_analyze_uninitialized(mapping params) {
  string code = params->code || "";
  string filename = params->filename || "input.pike";
  array(mapping) diagnostics = ({});

  mixed err = catch {
    diagnostics = analyze_uninitialized_impl(code, filename);
  };

  if (err) {
    debug("analyze_uninitialized error: %s\n", describe_error(err));
    diagnostics = ({});  // Return empty on error
  }

  return ([
    "result": ([
      "diagnostics": diagnostics
    ])
  ]);
}
```

### Completion Context Handler
```pike
// Source: pike-scripts/analyzer.pike:2305-2424
protected mapping handle_get_completion_context(mapping params) {
  string code = params->code || "";
  int target_line = params->line || 1;
  int target_char = params->character || 0;

  mapping result = ([
    "context": "none",
    "objectName": "",
    "prefix": "",
    "operator": ""
  ]);

  mixed err = catch {
    array(string) split_tokens = Parser.Pike.split(code);
    array pike_tokens = Parser.Pike.tokenize(split_tokens);

    // Find tokens around cursor position...
    // Scan backwards for access operators (->, ., ::)...

  };

  if (err) {
    debug("get_completion_context error: %s\n", describe_error(err));
  }

  return ([
    "result": result
  ]);
}
```

### String.trim_whites Migration
```pike
// OLD (analyzer.pike - multiple occurrences)
string trimmed = String.trim_whites(src_line);

// NEW (Analysis.pike)
string trimmed = LSP.Compat.trim_whites(src_line);
```

## State of the Art

| Old Approach (analyzer.pike) | New Approach (Phase 04) | Migration |
|------------------------------|------------------------|-----------|
| Handler functions at top-level | `Analysis.pike` class methods | Extract to class |
| `String.trim_whites()` native | `LSP.Compat.trim_whites()` | Replace all occurrences |
| Global cache mappings | Context with Cache instances | Access via Context |
| Direct `master()->resolv()` in handlers | Handler instances in Context | Singleton initialization |
| Switch statement dispatch | Dispatch table constant | `HANDLERS` mapping |
| Manual error response construction | `LSP.LSPError->to_response()` | Wrap errors consistently |
| No shared state container | Context service container | Pass Context to handlers |

**Existing patterns to preserve:**
- `Parser.Pike.split/tokenize()` usage (all three handlers)
- Helper function organization (protected methods with underscore prefix)
- Catch block error wrapping
- Debug logging with `LSP.debug()` (or local `debug()` function)

## Open Questions

1. **Helper placement for `get_char_position`**: Used by occurrences and completion handlers. Should it:
   - Move to Analysis.pike as protected method (both Analysis handlers use it)?
   - Stay in router as general utility (future modules might need it)?
   - **Recommendation:** Move to Analysis.pike for this phase. It's Analysis-specific logic (converting token line to character position).

2. **Helper placement for uninitialized analysis helpers**: `analyze_scope`, `analyze_function_body`, `extract_function_params`, `try_parse_declaration`, `is_type_keyword`, `is_identifier`, etc. These are only used by uninitialized analysis. Should they:
   - All be protected methods in Analysis.pike?
   - Some be extracted to separate scope analysis module?
   - **Recommendation:** Keep as protected methods in Analysis.pike. They're tightly coupled to uninitialized analysis. Extract to separate module only if Analysis.pike exceeds 500 lines.

3. **Constants for uninitialized states**: `STATE_UNINITIALIZED`, `STATE_MAYBE_INIT`, `STATE_INITIALIZED`, `STATE_UNKNOWN`, `NEEDS_INIT_TYPES` multiset. Should they:
   - Live in Analysis.pike as class constants?
   - Move to module.pmod as shared constants?
   - **Recommendation:** Analysis.pike class constants. They're specific to uninitialized analysis algorithm.

4. **Router's main() loop**: Should it remain in analyzer.pike or be extracted to Protocol.pmod?
   - **Recommendation:** Keep in analyzer.pike for this phase. Protocol.pmod extraction is separate work.

## Sources

### Primary (HIGH confidence)
- **pike-scripts/analyzer.pike** - Full file read:
  - `handle_find_occurrences()` (lines 1235-1300)
  - `get_char_position()` helper (lines 1303-1311)
  - `handle_analyze_uninitialized()` (lines 1545-1566)
  - `analyze_uninitialized_impl()` (lines 1569-1591)
  - `analyze_scope()` (lines 1600-1709)
  - `analyze_function_body()` (lines 1712-1960)
  - Helper functions: `is_type_keyword`, `is_identifier`, `is_assignment_operator`, `try_parse_declaration`, `is_function_definition`, `is_lambda_definition`, `extract_function_params`, `find_next_token`, etc.
  - `handle_get_completion_context()` (lines 2305-2424)
  - `handle_request()` switch statement (lines 46-83)
  - Existing handler delegation patterns (lines 86-191)
- **pike-scripts/LSP.pmod/Parser.pike** - Stateless class pattern reference
- **pike-scripts/LSP.pmod/Intelligence.pike** - Stateless class pattern reference
- **pike-scripts/LSP.pmod/module.pmod** - Constants, LSPError class
- **pike-scripts/LSP.pmod/Compat.pmod** - trim_whites() polyfill
- **pike-scripts/LSP.pmod/Cache.pmod** - LRU caching interface
- **.planning/phases/04-analysis-and-entry-point/04-CONTEXT.md** - Design decisions and constraints
- **.planning/phases/01-foundation/01-CONTEXT.md** - Foundation architecture patterns
- **.planning/phases/02-parser-module/02-CONTEXT.md** - Parser design patterns
- **.planning/phases/03-intelligence-module---extract-introspection-and-resolution-handlers/03-CONTEXT.md** - Intelligence design patterns

### Secondary (MEDIUM confidence)
- **test/tests/parser-tests.pike** - Testing patterns for handler extraction
- **test/tests/intelligence-tests.pike** - Testing patterns for handler extraction

### Tertiary (LOW confidence)
- None - all findings from direct code inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - based on existing Phase 1-3 deliverables and verified stdlib usage
- Architecture: HIGH - from CONTEXT.md design decisions and existing Parser/Intelligence patterns
- Pitfalls: HIGH - identified from code inspection and CONTEXT.md guidance
- Helper extraction: HIGH - specific line numbers and usage patterns verified

**Research date:** 2026-01-19
**Valid until:** 30 days (existing patterns are stable; extraction is straightforward refactoring following established Parser/Intelligence patterns)

## Wave Breakdown for Parallel Execution

Based on dependencies and parallel execution opportunities:

### Wave 1: Analysis.pike Extraction (CAN RUN IN PARALLEL)
- `04-01-PLAN.md`: Extract `handle_find_occurrences` with `get_char_position` helper
- `04-02-PLAN.md`: Extract `handle_get_completion_context` helper
- `04-03-PLAN.md`: Extract `handle_analyze_uninitialized` with scope analysis helpers

**Dependencies:** Phase 1 (module.pmod, Cache.pmod, Compat.pmod), Phase 2 (Parser.pike)
**Parallelizable:** Yes - all three extractions are independent

### Wave 2: Router Refactoring (DEPENDS ON WAVE 1)
- `04-04-PLAN.md`: Create dispatch table router with Context class
- `04-05-PLAN.md`: Remove old handler functions from analyzer.pike
- `04-06-PLAN.md`: Add integration tests for full JSON-RPC cycle

**Dependencies:** Wave 1 complete (Analysis.pike exists)
**Sequential:** Router refactoring depends on Analysis.pike being available
