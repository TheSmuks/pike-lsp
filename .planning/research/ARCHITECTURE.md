# Architecture Patterns

**Domain:** Pike LSP Module Refactoring
**Researched:** 2025-01-19
**Overall confidence:** HIGH

## Executive Summary

Pike's module system uses `.pmod` directories with optional `module.pmod` files for shared definitions. The LSP analyzer refactoring should follow Pike stdlib conventions: stateless helper functions in `module.pmod`, handler classes in individual `.pike` files, and centralized state management in a dedicated `Cache.pmod` submodule.

## Recommended Architecture

```
LSP.pmod/
├── module.pmod              # Shared utilities, constants, compatibility layer
├── Parser.pike              # Parse, tokenize, compile handlers
├── Intelligence.pike        # Introspect, resolve, stdlib handlers
├── Analysis.pike            # Occurrences, uninitialized, completion handlers
├── Cache.pmod/              # State management submodule
│   └── module.pmod          # LRU cache implementation
└── Compat.pmod/             # Version compatibility submodule
    └── module.pmod          # Feature detection and polyfills
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `LSP.module` | Shared utilities, constants, error handling, JSON helpers | All modules (via inheritance/import) |
| `LSP.Parser` | Source parsing, tokenization, compilation diagnostics | Cache (for compiled programs) |
| `LSP.Intelligence` | Type introspection, module resolution, stdlib queries | Cache (for stdlib data) |
| `LSP.Analysis` | Find occurrences, uninitialized detection, completion context | Parser (for tokenization), Cache |
| `LSP.Cache` | LRU cache management, access time tracking | All modules (read/write) |
| `LSP.Compat` | Version detection, feature polyfills | All modules (via module.pmod) |

### Data Flow

```
                    ┌─────────────────┐
                    │ analyzer.pike   │
                    │ (entry point)   │
                    └────────┬────────┘
                             │ JSON-RPC request
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────┐ ┌──────────────┐ ┌─────────────┐
    │   Parser    │ │Intelligence  │ │  Analysis   │
    │   .pike     │ │    .pike     │ │   .pike     │
    └──────┬──────┘ └──────┬───────┘ └──────┬──────┘
           │                │                 │
           └────────────────┼─────────────────┘
                           ▼
                    ┌─────────────┐
                    │   Cache     │
                    │   .pmod     │
                    └─────────────┘
```

**Key data flows:**
1. **Request → Handler:** Main `analyzer.pike` routes JSON-RPC methods to appropriate handler
2. **Handler → Shared Utils:** All handlers use `LSP.module` functions for common operations
3. **Handler → Cache:** Read/write access to shared caches (program cache, stdlib cache)
4. **Cache → Compat:** Cache module uses Compat for version-specific behavior

## Patterns to Follow

### Pattern 1: Module Directory with module.pmod

**What:** Pike's standard pattern for multi-file modules

**When:** Organizing related functionality into a namespace

**Example structure:**
```pike
// LSP.pmod/module.pmod
//! Shared utilities for LSP module

// Constants accessible to all module users
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;

// Helper functions
protected string describe_error(mixed err) {
  if (arrayp(err)) {
    return err[0] || "Unknown error";
  }
  return sprintf("%O", err);
}

// Type that modules can inherit from
class SharedHandler {
  protected mapping create_error_response(int code, string message) {
    return ([
      "error": ([
        "code": code,
        "message": message
      ])
    ]);
  }
}
```

**Why:** From Pike manual: *"If a file called `module.pmod` is placed in the directory, the function and program definitions within it will be merged with the programs found in the directory."* This allows sharing constants and functions across all module files.

### Pattern 2: Submodule for Encapsulation

**What:** Nested `.pmod` directory for isolating complex state

**When:** When a component has its own complex state management

**Example:**
```pike
// LSP.pmod/Cache.pmod/module.pmod
//! Cache management for LSP analyzer

private:
mapping(string:program) program_cache = ([]);
mapping(string:int) cache_access_time = ([]);
int max_cached_programs = 30;

public:
void cache_program(string filename, program prog) {
  program_cache[filename] = prog;
  cache_access_time[filename] = time();
  evict_lru_if_needed();
}

program get_cached_program(string filename) {
  if (program_cache[filename]) {
    cache_access_time[filename] = time();
    return program_cache[filename];
  }
  return 0;
}

protected void evict_lru_if_needed() {
  // LRU eviction logic
}
```

**Access pattern:**
```pike
// In Parser.pike
LSP.Cache.cache_program(filename, compiled_prog);
program cached = LSP.Cache.get_cached_program(filename);
```

**Why:** Encapsulation prevents direct access to cache internals. The `private:` section (Pike convention via naming) keeps implementation details hidden.

### Pattern 3: Handler Class with Protected Methods

**What:** Class-based handler with public entry points and protected helpers

**When:** Implementing a complex handler with multiple helper functions

**Example:**
```pike
// LSP.pmod/Parser.pike
//! Source parsing and tokenization handler

inherit LSP.module;  // Access to shared utilities

class ParseHandler {
  protected mapping parse_symbol(object symbol, string|void docs) {
    // Helper to convert symbol to JSON
    // Uses inherited describe_error()
  }

  public mapping handle_parse(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    mixed err = catch {
      // Parse logic
    };

    if (err) {
      return create_error_response(-32000, describe_error(err));
    }
    return create_success_response(result);
  }
}

// Export singleton instance
ParseHandler parse_handler = ParseHandler();
```

**Why:** Separation of public API from implementation. Protected methods won't be exposed to module users.

### Pattern 4: Catch-Based Error Isolation

**What:** Wrap each handler in `catch` to prevent failures from propagating

**When:** Any handler that processes user input

**Example:**
```pike
public mapping handle_request(mapping request) {
  string method = request->method;

  mapping handler_result;
  mixed err = catch {
    switch (method) {
      case "parse":
        handler_result = LSP.Parser.parse_handler->handle_parse(request->params);
        break;
      case "introspect":
        handler_result = LSP.Intelligence.introspect_handler->handle_introspect(request->params);
        break;
      // ... other cases
      default:
        return (["error": (["code": -32601, "message": "Method not found"])]);
    }
  };

  if (err) {
    // Error in handler - return error response, don't crash
    return (["error": (["code": -32000, "message": describe_error(err)])]);
  }

  return handler_result;
}
```

**Why:** User code might be malformed or have unexpected patterns. Catching errors prevents the entire LSP server from crashing.

### Pattern 5: Feature Detection with `#if constant()`

**What:** Compile-time feature detection

**When:** Providing version compatibility

**Example:**
```pike
// LSP.pmod/Compat.pmod/module.pmod

// Feature: String.trim_whites (Pike 8.0+)
#if constant(String.trim_whites)
#define HAS_TRIM_WHITES 1
#else
string trim_whites(string s) {
  // Polyfill for Pike 7.x
  return replace(s, "\t", " ") / " " * "";
}
constant HAS_TRIM_WHITES = 0;
#endif

// Feature: Program.inherit_list availability
#if constant(Program.inherit_list)
constant HAS_INHERIT_LIST = 1;
#else
constant HAS_INHERIT_LIST = 0;
#endif
```

**Why:** Pike's preprocessor evaluates `constant()` at compile time. This enables graceful degradation on older versions.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Global Mutable State in module.pmod

**What:** Storing mutable cache state directly in `module.pmod`

**Why bad:** From Pike manual: *"variables defined on a module-wide bases are shared among all clones of programs in the module."* This causes race conditions and unintended sharing.

**Instead:** Use a dedicated submodule (like `Cache.pmod`) with controlled access methods.

### Anti-Pattern 2: Direct Cross-Handler Imports

**What:** Parser.pike directly calling functions in Intelligence.pike

**Why bad:** Creates tight coupling, makes testing difficult, circular dependencies risk.

**Instead:** Use shared utilities in `LSP.module` for common functions. Keep handlers independent.

### Anti-Pattern 3: Mixing UI/Protocol with Business Logic

**What:** Handler functions that do JSON encoding directly

**Why bad:** Makes handlers hard to test, ties business logic to protocol format.

**Instead:** Handlers return Pike mappings; main entry point handles JSON encoding.

### Anti-Pattern 4: Shared Cache Keys Without Namespacing

**What:** Multiple modules using same cache key namespace

**Why bad:** Key collisions, data corruption

**Instead:** Prefix keys with module name (e.g., "parser:filename", "intel:module")

### Anti-Pattern 5: Undocumented Cache Invalidation

**What:** No clear strategy for when to invalidate caches

**Why bad:** Stale data returned to users, hard-to-debug issues

**Instead:** Use LRU eviction (already implemented) plus explicit invalidation methods.

## Shared State Management

### Cache Ownership

| Cache | Owner | Access Pattern | Notes |
|-------|-------|----------------|-------|
| `program_cache` | Cache.pmod | Read: Parser, Intelligence; Write: Parser | LRU eviction in Cache.pmod |
| `stdlib_cache` | Cache.pmod | Read: Intelligence; Write: Intelligence | LRU eviction in Cache.pmod |
| `cache_access_time` | Cache.pmod | Read/Write: Cache.pmod only | Internal LRU tracking |
| `debug_mode` | LSP.module | Read: all; Write: main entry point | Global flag, no locking needed |

### Cache Access Pattern

```pike
// Recommended: Access through Cache module methods
program cached = LSP.Cache.get_program(filename);
if (!cached) {
  program prog = compile_string(code, filename);
  LSP.Cache.put_program(filename, prog);
}

// Avoid: Direct cache access (encapsulation violation)
program prog = LSP.Cache.program_cache[filename];  // DON'T DO THIS
```

### Thread Safety Considerations

**Current state:** The original analyzer.pike is single-threaded (JSON-RPC over stdin/stdout). No concurrency issues exist.

**Future consideration:** If the LSP server becomes multi-threaded:
- Cache access would need mutex protection
- Consider Pike's `Thread.Mutex` for critical sections
- Or use thread-local caches per request

## Error Isolation Between Modules

### Handler Level

Each handler method should:
1. Wrap core logic in `catch`
2. Return error response on failure
3. Never propagate exceptions to caller

```pike
public mapping handle_parse(mapping params) {
  mixed err = catch {
    // Core logic here
    return (["result": result]);
  };

  // Always return a valid response
  return (["error": (["code": -32000, "message": describe_error(err)])]);
}
```

### Module Level

Each module should:
1. Not depend on other handler modules (avoid circular dependencies)
2. Use only shared utilities from `LSP.module`
3. Handle missing dependencies gracefully (check for null returns)

### Main Entry Point Level

The main `analyzer.pike` should:
1. Route to handlers based on method name
2. Wrap entire handler call in `catch`
3. Return generic error if handler completely fails

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| Handler dispatch | Single process, linear | May need worker pool | Distributed LSP servers |
| Cache size | Current 30/50 limits fine | May need tuning | Consider external cache (Redis) |
| Memory | Minimal concern | Monitor program cache size | Per-request isolation needed |
| I/O | Stdin/stdout fine | May need async I/O | Definitely async I/O |

### Build/Compilation Order Implications

**No explicit linking:** Pike modules are loaded at runtime, not compile-time. The `.pmod` directory is discovered when `LSP` is first referenced.

**Initialization order:**
1. `LSP.module` loaded first (definitions and constants)
2. Submodules (`.pike` files) loaded on-demand
3. Sub-submodules (`Cache.pmod`, `Compat.pmod`) loaded when referenced

**No circular dependency risk:** Because modules are resolved at runtime, circular imports don't cause compilation errors (unlike C). However, they can cause runtime initialization issues.

**Best practice:** Keep dependencies acyclic. If Parser needs Cache, that's fine. If Cache needed Parser, that would be problematic.

## Testing Individual Modules

### Unit Testing Pattern

```pike
// test/LSP/Parser.pike
//! Tests for LSP.Parser module

int main() {
  // Create handler instance directly
  object parser = LSP.Parser.parse_handler;

  // Test parse with known code
  mapping result = parser->handle_parse(([
    "code": "int x = 5;",
    "filename": "test.pike"
  ]));

  // Assert on result
  if (result->result->symbols && sizeof(result->result->symbols) > 0) {
    write("PASS: parse returned symbols\n");
    return 0;
  } else {
    write("FAIL: parse returned no symbols\n");
    return 1;
  }
}
```

### Isolation Strategy

1. **Mock Cache:** In tests, clear cache before each test or use test-specific cache keys
2. **Version Testing:** Use Compat module to simulate different Pike versions
3. **Error Injection:** Test handler behavior with malformed input

## Module Initialization Order

**Pike's module loading:**
1. When `LSP` is first referenced, Pike loads `LSP.pmod/module.pmod`
2. Other `.pike` files in `LSP.pmod/` are loaded on first use
3. Submodules like `LSP.Cache` are loaded when first referenced

**Implications for this project:**
- `LSP.module` should NOT reference other LSP modules (avoid circular init)
- Handler modules can reference `LSP.module` and `LSP.Cache`
- `LSP.Cache` should be self-contained (can reference `LSP.Compat`)
- `LSP.Compat` must have zero dependencies (pure feature detection)

## Sources

- [Pike Manual - Chapter 30: Writing Pike Modules](https://pike.lysator.liu.se/docs/man/chapter_30.html) - HIGH confidence, official documentation on `.pmod` structure
- [Pike Manual - Chapter 7: Error Handling](https://pike.lysator.liu.se/docs/man/chapter_7.html) - HIGH confidence, catch/throw reference
- [Pike Manual - Chapter 9: Module Loading](https://pike.lysator.liu.se/docs/man/chapter_9.html) - HIGH confidence, load_module and module resolution
- [Pike Beginner's Tutorial](https://pike.lysator.liu.se/docs/tut/) - MEDIUM confidence, general module patterns
- Source code analysis of `analyzer.pike` (3,221 lines) - HIGH confidence, actual current implementation
