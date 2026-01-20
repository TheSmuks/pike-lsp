# Phase 3: Intelligence Module - Research

**Researched:** 2026-01-19
**Domain:** Pike introspection, symbol resolution, stdlib caching
**Confidence:** HIGH

## Summary

Phase 3 extracts four LSP request handlers from `analyzer.pike` into a new `Intelligence.pike` class. These handlers form the "brain" of the LSP server—providing code introspection, symbol resolution, stdlib queries, and inheritance traversal.

The current implementation is tightly coupled to analyzer.pike's global state (module-level caches, debug mode flag). Extraction requires careful handling of dependencies on:
- `Cache.pmod` (LRU caching infrastructure)
- `module.pmod` (utilities: constants, error handling, JSON helpers, debug logging)
- `Compat.pmod` (`trim_whites()` for string operations)
- `Tools.AutoDoc` (Pike's native documentation parser)

**Primary recommendation:** Extract handlers incrementally following Parser.pike's stateless class pattern, with each handler wrapped in catch blocks returning JSON-RPC errors. Use Cache.pmod for all caching operations instead of direct cache manipulation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tools.AutoDoc | Pike 8.0+ | Documentation parsing | Native Pike module for extracting structured docs from `//!` comments |
| Program.defined() | Pike 7.6+ | Get program source path | Standard API for getting program file location |
| Program.inherit_list() | Pike 7.6+ | Get inheritance hierarchy | Standard API for walking class inheritance |
| master()->resolv() | Pike 7.6+ | Resolve module paths | Native module resolution |

### Supporting (from Phase 1)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| LSP.Cache | v0.1 (Phase 1) | LRU caching for programs/stdlib | All cache operations (get/put/evict) |
| LSP.Compat | v0.1 (Phase 1) | Version compatibility | `trim_whites()` for string cleanup |
| LSP | v0.1 (Phase 1) | Shared utilities | Error handling, JSON encode/decode, debug logging |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LSP.Cache | Direct mapping access | Lose LRU eviction, statistics tracking, graceful degradation |
| Tools.AutoDoc.DocParser | Manual regex parsing | Lose structured markup handling, break on edge cases |

**Installation:**
```bash
# No new packages—all infrastructure exists from Phase 1
# Intelligence.pike will be added to pike-scripts/LSP.pmod/
```

## Architecture Patterns

### Recommended Project Structure
```
pike-scripts/LSP.pmod/
├── module.pmod           # Shared utilities (EXISTING)
├── Compat.pmod           # Version compatibility (EXISTING)
├── Cache.pmod            # LRU caching (EXISTING)
├── Parser.pike           # Stateless parser (EXISTING)
└── Intelligence.pike     # NEW: Introspection/resolution handlers
    ├── create()                          # Constructor (no-op, stateless)
    ├── handle_introspect()               # INT-01
    ├── handle_resolve()                  # INT-02
    ├── handle_resolve_stdlib()           # INT-03
    ├── handle_get_inherited()            # INT-04
    ├── introspect_program()              # Helper
    ├── parse_stdlib_documentation()      # Helper
    ├── parse_autodoc()                   # Helper
    ├── merge_documentation()             # Helper
    ├── get_module_path()                 # Helper
    ├── extract_symbol_name()             # Helper
    └── process_inline_markup()           # Helper
```

### Pattern 1: Stateless Handler Class
**What:** Handler class follows Parser.pike pattern—instantiable but stateless, all dependencies passed via method calls or imported from LSP.* modules.

**When to use:** All LSP request handlers that need to be testable in isolation.

**Example:**
```pike
// Source: Parser.pike pattern (lines 9-14)
class Parser {
    //! Create a new Parser instance
    void create() {
        // No state to initialize
    }

    //! Parse request handler
    mapping parse_request(mapping params) {
        // Stateless operation
    }
}
```

### Pattern 2: Cache-Through Handler
**What:** Handlers use LSP.Cache for all caching operations instead of direct mapping access. Cache provides LRU eviction, statistics, graceful degradation.

**When to use:** Any handler storing computed results (programs, stdlib data).

**Example:**
```pike
// Source: Cache.pmod pattern (lines 193-202)
mixed get(string cache_name, string key) {
    switch (cache_name) {
        case "program_cache":
            return get_program(key);
        case "stdlib_cache":
            return get_stdlib(key);
        default:
            return 0;
    }
}

void put(string cache_name, string key, mixed value) {
    switch (cache_name) {
        case "program_cache":
            put_program(key, value);
            break;
        case "stdlib_cache":
            put_stdlib(key, value);
            break;
    }
}
```

### Pattern 3: JSON-RPC Error Wrapping
**What:** Each handler wraps core logic in catch block, returning `LSP.LSPError` on exception.

**When to use:** All handlers that can fail with runtime errors.

**Example:**
```pike
// Source: Parser.pmode module.pmod (lines 34-56)
class LSPError {
    mixed error_code;
    string error_message;

    void create(mixed code, string message) {
        error_code = code;
        error_message = message;
    }

    mapping to_response() {
        return ([
            "error": ([
                "code": error_code,
                "message": error_message
            ])
        ]);
    }
}
```

### Anti-Patterns to Avoid
- **Module-level cache access:** Don't directly manipulate `program_cache`, `stdlib_cache` mappings—use LSP.Cache
- **Global debug flag:** Don't store debug mode in instance variable—use `LSP.get_debug_mode()`
- **Inheritance-based extraction:** Don't try to inherit handlers from analyzer.pike—extract and refactor

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU cache eviction | Manual time-based tracking | LSP.Cache (evict_lru_programs/stdlib) | Handles counter-based tracking, edge cases |
| Documentation parsing | Regex for `//!` comments | Tools.AutoDoc.DocParser | Handles nested markup, block structure |
| Module resolution | Manual path walking | master()->resolv() | Handles joinnodes, dirnodes, inherit paths |
| Program introspection | Object indexing/indices() | Program.inherit_list(), _typeof() | Handles complex types, function signatures |
| String trimming | String.trim_whites() | LSP.Compat.trim_whites() | Pike 8.x doesn't trim newlines |

**Key insight:** The current analyzer.pike has homegrown LRU eviction and doc parsing that should be replaced with standard infrastructure during extraction.

## Common Pitfalls

### Pitfall 1: Module Path Resolution Complexity
**What goes wrong:** Pike's module resolution returns complex wrapper objects (joinnodes, dirnodes) that confuse path extraction.

**Why it happens:** `master()->resolv()` returns different types depending on how the module was loaded.

**How to avoid:** Use `get_module_path()` helper which handles all resolution types.

**Warning signs:** Getting `"Object()"` strings instead of actual file paths.

```pike
// Source: analyzer.pike lines 174-220 (pattern to preserve)
protected string get_module_path(mixed resolved) {
    if (!resolved) return "";

    if (objectp(resolved)) {
        program obj_prog = object_program(resolved);

        // Handle joinnodes (merged module paths)
        if (obj_prog->is_resolv_joinnode) {
            array joined = ({});
            catch { joined = resolved->joined_modules || ({}); };
            foreach(joined, mixed m) {
                string path = get_module_path(m);
                if (sizeof(path)) return path;
            }
        }

        // Handle dirnodes (.pmod directories)
        if (obj_prog->is_resolv_dirnode) {
            string dirname = "";
            catch { dirname = resolved->dirname || ""; };
            if (sizeof(dirname)) {
                string module_file = combine_path(dirname, "module.pmod");
                if (file_stat(module_file)) return module_file;
                return dirname;
            }
        }

        // Regular object
        catch {
            string path = Program.defined(obj_prog);
            if (path && sizeof(path)) return path;
        };
    }

    if (programp(resolved)) {
        catch {
            string path = Program.defined(resolved);
            if (path && sizeof(path)) return path;
        };
    }

    return "";
}
```

### Pitfall 2: Source Path Line Number Suffix
**What goes wrong:** `Program.defined()` returns paths like `"path/file.pike:42"` with line numbers.

**Why it happens:** Pike tracks source location for debugging.

**How to avoid:** Clean path suffix before file operations.

**Warning signs:** `Stdio.read_file()` fails silently.

```pike
// Pattern from analyzer.pike lines 1263-1276
string clean_path = source_path;
if (has_value(clean_path, ":")) {
    array parts = clean_path / ":";
    // Check if last part is a number (line number)
    if (sizeof(parts) > 1 && sizeof(parts[-1]) > 0) {
        int is_line_num = 1;
        foreach(parts[-1] / "", string c) {
            if (c < "0" || c > "9") { is_line_num = 0; break; }
        }
        if (is_line_num) {
            clean_path = parts[..sizeof(parts)-2] * ":";
        }
    }
}
```

### Pitfall 3: AutoDoc Token Type Constants
**What goes wrong:** `Tools.AutoDoc.DocParser.splitDocBlock()` returns tokens with numeric types, not named constants.

**Why it happens:** Pike's AutoDoc API uses integers for token types (undocumented).

**How to avoid:** Use the type number constants from analyzer.pike comments.

**Warning signs:** `tok->type` returns unexpected values.

```pike
// Token type constants from analyzer.pike lines 457-458
// 1 = METAKEYWORD, 3 = DELIMITERKEYWORD, 4 = BEGINGROUP,
// 6 = ENDGROUP, 7 = ENDCONTAINER, 8 = TEXTTOKEN, 9 = EOF

if (tok_type == 8) {
    // TEXTTOKEN
} else if (tok_type == 3) {
    // DELIMITERKEYWORD
}
```

### Pitfall 4: Empty Cache Returns Zero, Not Undefined
**What goes wrong:** `LSP.Cache.get()` returns `0` (zero) on miss, not UNDEFINED.

**Why it happens:** Cache uses `0` as sentinel value for "not found".

**How to avoid:** Explicitly check cache result before use.

**Warning signs:** "Not a program" errors when code assumes cache hit.

```pike
// Pattern from analyzer.pike lines 1221-1224
if (stdlib_cache[module_path]) {
    cache_access_time[module_path] = time();
    return ([ "result": stdlib_cache[module_path] ]);
}

// With LSP.Cache:
mapping cached = LSP.Cache.get("stdlib_cache", module_path);
if (cached) {
    return ([ "result": cached ]);
}
```

## Code Examples

Verified patterns from current implementation:

### Handler 1: handle_introspect (lines 1156-1210)
```pike
protected mapping handle_introspect(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    array diagnostics = ({});
    program compiled_prog;

    // Capture compilation errors
    void compile_error_handler(string file, int line, string msg) {
        diagnostics += ({
            ([
                "message": msg,
                "severity": "error",
                "position": ([ "file": file, "line": line ])
            ])
        });
    };

    mixed old_error_handler = master()->get_inhibit_compile_errors();
    master()->set_inhibit_compile_errors(compile_error_handler);

    // Attempt compilation
    mixed compile_err = catch {
        compiled_prog = compile_string(code, filename);
    };

    master()->set_inhibit_compile_errors(old_error_handler);

    // If compilation failed, return diagnostics
    if (compile_err || !compiled_prog) {
        return ([
            "result": ([
                "success": 0,
                "diagnostics": diagnostics,
                "symbols": ({}),
                "functions": ({}),
                "variables": ({}),
                "classes": ({}),
                "inherits": ({})
            ])
        ]);
    }

    // Cache the compiled program
    program_cache[filename] = compiled_prog;
    cache_access_time[filename] = time();
    evict_lru_programs();

    // Extract type information
    mapping result = introspect_program(compiled_prog);
    result->success = 1;
    result->diagnostics = diagnostics;

    return ([ "result": result ]);
}
```

### Handler 2: handle_resolve (lines 226-333)
```pike
protected mapping handle_resolve(mapping params) {
    string module_path = params->module || "";
    string current_file = params->currentFile || "";

    if (sizeof(module_path) == 0) {
        return ([ "result": ([ "path": 0, "exists": 0 ]) ]);
    }

    // Handle local modules (starting with .)
    if (has_prefix(module_path, ".")) {
        string local_name = module_path[1..];
        string current_dir = dirname(current_file);

        // Try .pike file first
        string pike_file = combine_path(current_dir, local_name + ".pike");
        if (file_stat(pike_file)) {
            return ([
                "result": ([ "path": pike_file, "exists": 1 ])
            ]);
        }

        // Try .pmod file
        string pmod_file = combine_path(current_dir, local_name + ".pmod");
        if (file_stat(pmod_file) && !file_stat(pmod_file)->isdir) {
            return ([
                "result": ([ "path": pmod_file, "exists": 1 ])
            ]);
        }

        // Try .pmod directory with module.pmod
        string pmod_dir = combine_path(current_dir, local_name + ".pmod");
        if (file_stat(pmod_dir) && file_stat(pmod_dir)->isdir) {
            string module_file = combine_path(pmod_dir, "module.pmod");
            if (file_stat(module_file)) {
                return ([
                    "result": ([ "path": module_file, "exists": 1 ])
                ]);
            }
            return ([
                "result": ([ "path": pmod_dir, "exists": 1 ])
            ]);
        }

        return ([ "result": ([ "path": 0, "exists": 0 ]) ]);
    }

    // For non-local modules, use Pike's native resolution
    mixed err = catch {
        mixed resolved = master()->resolv(module_path);
        if (resolved) {
            string source_path = get_module_path(resolved);
            return ([
                "result": ([
                    "path": sizeof(source_path) ? source_path : 0,
                    "exists": sizeof(source_path) ? 1 : 0
                ])
            ]);
        }
    };

    return ([ "result": ([ "path": 0, "exists": 0 ]) ]);
}
```

### Handler 3: handle_resolve_stdlib (lines 1213-1327)
```pike
protected mapping handle_resolve_stdlib(mapping params) {
    string module_path = params->module || "";

    if (sizeof(module_path) == 0) {
        return ([ "result": ([ "found": 0, "error": "No module path" ]) ]);
    }

    // Check cache
    if (stdlib_cache[module_path]) {
        cache_access_time[module_path] = time();
        return ([ "result": stdlib_cache[module_path] ]);
    }

    // Resolve using master()->resolv()
    mixed resolved;
    mixed resolve_err = catch {
        resolved = master()->resolv(module_path);
    };

    if (resolve_err || !resolved) {
        return ([
            "result": ([
                "found": 0,
                "error": resolve_err ? describe_error(resolve_err) : "Module not found"
            ])
        ]);
    }

    // Get program for introspection
    program prog;
    if (objectp(resolved)) {
        prog = object_program(resolved);
    } else if (programp(resolved)) {
        prog = resolved;
    } else {
        return ([ "result": ([ "found": 0, "error": "Not a program" ]) ]);
    }

    // Use native module path resolution
    string source_path = get_module_path(resolved);

    // Introspect
    mapping introspection = introspect_program(prog);

    // Parse source file to get all exported symbols
    if (sizeof(source_path) > 0) {
        string code;
        mixed read_err = catch {
            // Clean up path - remove line number suffix
            string clean_path = source_path;
            if (has_value(clean_path, ":")) {
                array parts = clean_path / ":";
                if (sizeof(parts) > 1 && sizeof(parts[-1]) > 0) {
                    int is_line_num = 1;
                    foreach(parts[-1] / "", string c) {
                        if (c < "0" || c > "9") { is_line_num = 0; break; }
                    }
                    if (is_line_num) {
                        clean_path = parts[..sizeof(parts)-2] * ":";
                    }
                }
            }
            code = Stdio.read_file(clean_path);
        };

        if (code && sizeof(code) > 0) {
            // Parse the file to get all symbols
            mapping parse_params = ([ "code": code, "filename": source_path ]);
            mapping parse_response = handle_parse(parse_params);

            if (parse_response && parse_response->result &&
                parse_response->result->symbols &&
                sizeof(parse_response->result->symbols) > 0) {
                array parsed_symbols = parse_response->result->symbols;

                // Merge parsed symbols into introspection
                if (!introspection->symbols) {
                    introspection->symbols = ({});
                }

                multiset(string) introspected_names =
                    (multiset)(map(introspection->symbols, lambda(mapping s) { return s->name; }));

                foreach(parsed_symbols, mapping sym) {
                    string name = sym->name;
                    if (name && !introspected_names[name]) {
                        introspection->symbols += ({ sym });
                        introspected_names[name] = 1;
                    }
                }
            }

            // Parse documentation and merge it
            mapping docs = parse_stdlib_documentation(source_path);
            if (docs && sizeof(docs) > 0) {
                introspection = merge_documentation(introspection, docs);
            }
        }
    }

    mapping result = ([ "found": 1, "path": source_path, "module": module_path ]) + introspection;

    // Cache with LRU
    if (sizeof(stdlib_cache) >= max_stdlib_modules) {
        evict_lru_stdlib();
    }
    stdlib_cache[module_path] = result;
    cache_access_time[module_path] = time();

    return ([ "result": result ]);
}
```

### Handler 4: handle_get_inherited (lines 1497-1536)
```pike
protected mapping handle_get_inherited(mapping params) {
    string class_name = params->class || "";

    if (sizeof(class_name) == 0) {
        return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
    }

    // Resolve class
    mixed resolved;
    catch { resolved = master()->resolv(class_name); };

    if (!resolved) {
        return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
    }

    program prog = objectp(resolved) ? object_program(resolved) : resolved;
    if (!prog) {
        return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
    }

    // Get inheritance list
    array inherits = ({});
    catch { inherits = Program.inherit_list(prog) || ({}); };

    array all_members = ({});

    // Introspect each parent
    foreach (inherits, program parent_prog) {
        mapping parent_info = introspect_program(parent_prog);
        all_members += parent_info->symbols || ({});
    }

    return ([
        "result": ([
            "found": 1,
            "members": all_members,
            "inherit_count": sizeof(inherits)
        ])
    ]);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct cache mapping access | LSP.Cache module | Phase 1 (foundation) | Centralized LRU, statistics, graceful degradation |
| String.trim_whites() | LSP.Compat.trim_whites() | Phase 1 (foundation) | Pike 8.x compatibility (trim newlines) |
| Scattered error handling | LSP.LSPError class | Phase 1 (foundation) | Consistent JSON-RPC error responses |

**Recommended changes during extraction:**
- Replace `program_cache`, `stdlib_cache`, `cache_access_time` with LSP.Cache calls
- Replace `String.trim_whites()` with `LSP.Compat.trim_whites()`
- Replace `debug()` conditional with `LSP.debug()`
- Remove `evict_lru_programs()`, `evict_lru_stdlib()` (handled by Cache.pmod)
- Add JSON-RPC error wrapping using LSP.LSPError

**Deprecated/outdated:**
- Module-level `debug_mode` flag: Should use `LSP.get_debug_mode()`
- Manual `program_cache`, `stdlib_cache` mappings: Use LSP.Cache
- `debug()` function defined in each file: Use `LSP.debug()`

## Open Questions

1. **handle_parse dependency in handle_resolve_stdlib**
   - What we know: `handle_resolve_stdlib` calls `handle_parse` (line 1283)
   - What's unclear: Should Intelligence use Parser class directly or keep calling through handler?
   - Recommendation: Use `LSP.Parser()->Parser()->parse_request()` directly (stateless, cleaner)

2. **introspect_program placement**
   - What we know: Called by `handle_introspect`, `handle_resolve_stdlib`, `handle_get_inherited`
   - What's unclear: Keep as protected helper or move to a separate Introspection utility?
   - Recommendation: Keep as protected method in Intelligence.pike (shared only by handlers)

3. **Current file context for resolve handler**
   - What we know: `handle_resolve` takes `currentFile` param for local module resolution
   - What's unclear: How does LSP server know current file path?
   - Recommendation: Assume LSP server passes it (out of scope for this phase)

## Sources

### Primary (HIGH confidence)
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/analyzer.pike` - Lines 1156-1536 (handler implementations)
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/module.pmod` - LSP utilities
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Compat.pmod` - Version compatibility
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Cache.pmod` - LRU caching infrastructure
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Parser.pike` - Stateless class pattern reference

### Secondary (MEDIUM confidence)
- `/home/smuks/OpenCode/pike-lsp/.planning/phases/03-intelligence-module**---extract-introspection-and-resolution-handlers/03-CONTEXT.md` - Phase context decisions

### Tertiary (LOW confidence)
- None (all findings verified from source code)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified from existing code
- Architecture: HIGH - Parser.pike provides proven pattern for extraction
- Pitfalls: HIGH - All patterns identified from working implementation

**Research date:** 2026-01-19
**Valid until:** 30 days (stable domain - Pike introspection APIs don't change frequently)
