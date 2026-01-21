# Phase 05: Pike Reorganization - Research

**Researched:** 2026-01-21
**Domain:** Pike .pmod module system and large file refactoring
**Confidence:** HIGH

## Summary

This research covers how to safely split large Pike files (Intelligence.pike: 1,660 lines, Analysis.pike: 1,191 lines) using Pike's `.pmod` directory idiom while maintaining backward compatibility and testability.

**Key findings:**
1. Pike .pmod directories with module.pmod allow merging functions from multiple files
2. Classes in a .pmod directory can access siblings via `.ClassName` syntax and module.pmod helpers directly
3. The current codebase already has a module-load-tests.pike pattern for verification
4. Refactoring should use "create new, then migrate" approach for safety

**Primary recommendation:** Use the .pmod directory pattern (not flat .pmod files) with module.pmod for shared helpers. Create new files first, verify they load via master()->resolv(), then migrate handlers incrementally.

## Standard Stack

### Core (Existing)
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Pike | 8.0.1116 | Target runtime | Project requirement (CLAUDE.md) |
| master()->resolv() | Built-in | Module resolution | Pike's native module loader |
| LSP.Compat.trim_whites() | Custom | String operations | Pike 8.0 compatibility (String.trim() missing) |
| LSP.module.make_error() | Custom | Error responses | From Phase 01, used by all handlers |

### Pike .pmod Module System (HIGH confidence)
**Source:** [Pike Manual Chapter 30](https://pike.lysator.liu.se/docs/man/chapter_30.html) - official documentation

```
LSP.pmod/                    # Module directory
  module.pmod                # Shared helpers (merged into module)
  Intelligence.pmod/         # NEW: Sub-module directory
    module.pmod              # Shared helpers for Intelligence
    Introspection.pike       # Symbol extraction class
    Resolution.pike          # Name resolution class
    TypeAnalysis.pike        # Type inference class
```

**How .pmod directories work:**
- Directory named `Name.pmod` creates a module namespace
- Files inside (`.pike`) are merged into the module
- `module.pmod` (if exists) contents are also merged
- Functions in module.pmod are directly accessible to all classes in the .pmod

### Testing Infrastructure
| Component | Purpose | Location |
|-----------|---------|----------|
| module-load-tests.pike | Verify master()->resolv() loads modules | test/tests/module-load-tests.pike |
| intelligence-tests.pike | Introspection handler tests | test/tests/intelligence-tests.pike |
| analysis-tests.pike | Analysis handler tests | test/tests/analysis-tests.pike |

## Architecture Patterns

### Current File Structure

```
pike-scripts/LSP.pmod/
  module.pmod              # Top-level exports (LSPError, json_encode/decode, debug, make_error)
  Compat.pmod              # Version compatibility (trim_whites, pike_version)
  Cache.pmod               # LRU caching (get, put, clear, get_stats)
  Parser.pike              # Parser class (tokenize, parse, compile)
  Intelligence.pike        # 1,660 lines - Intelligence class
  Analysis.pike            # 1,191 lines - Analysis class
```

### Target Structure (Per CONTEXT.md)

```
LSP.pmod/
  Intelligence.pmod/       # NEW: Directory for split Intelligence
    module.pmod            # Shared helpers (type traversal, inheritance utils)
    Introspection.pike     # class Introspection
    Resolution.pike        # class Resolution (includes StdlibResolver)
    TypeAnalysis.pike      # class TypeAnalysis

  Analysis.pmod/           # NEW: Directory for split Analysis
    module.pmod            # Shared helpers (scope tracking, position utils)
    Diagnostics.pike       # class Diagnostics
    Completions.pike       # class Completions
    Variables.pike         # class Variables (includes Occurrences)
```

### Pattern 1: .pmod Directory with module.pmod

**What:** A `.pmod` directory containing multiple `.pike` files plus an optional `module.pmod` for shared helpers.

**When to use:** When splitting a large module into multiple classes that need shared utilities.

**How siblings access each other:**
- From `Introspection.pike` call `.`Resolution` to access sibling `Resolution` class
- From any class, call functions in `module.pmod` directly (no prefix needed)

**Example:**
```pike
// LSP.pmod/Intelligence.pmod/module.pmod
//! Shared helpers for all Intelligence classes

//! Check if type is callable (available to all classes)
int is_callable(mixed type_info) {
  return functionp(type_info) || programp(type_info);
}

//! Extract autodoc comments (shared utility)
mapping(int:string) extract_autodoc_comments(string code) {
  // ... implementation
}
```

```pike
// LSP.pmod/Intelligence.pmod/Introspection.pike
//! Extracts symbols from Pike code
class Introspection {
  private object context;

  void create(object ctx) {
    context = ctx;
  }

  //! Can call is_callable() from module.pmod directly
  //! Can call .Resolution for sibling class access
  mapping introspect(string code, string filename) {
    mixed err = catch {
      program p = compile_string(code, filename);
      return extract_symbols(p);  // Private method in this class
    };

    if (err) {
      return LSP.module.make_error("COMPILE", describe_error(err));
    }
  }

  private mapping extract_symbols(program p) {
    // ...
  }
}
```

### Pattern 2: Class with create(object ctx) Constructor

**What:** All handler classes receive a context object in their constructor.

**When to use:** Every class in the new .pmod structure.

**Example:**
```pike
class Introspection {
  private object context;  // Will hold LSP.module reference or similar

  void create(object ctx) {
    context = ctx;
  }
}
```

### Pattern 3: Error Handling with make_error()

**What:** All handlers wrap their work in catch blocks and return make_error() on failure.

**When to use:** Every public handler method (handle_*).

**Example:**
```pike
mapping handle_introspect(mapping params) {
  mixed err = catch {
    string code = params->code || "";
    // ... do work
    return (["result": result]);
  };

  if (err) {
    return LSP.module.make_error("COMPILE", describe_error(err));
  }
}
```

### Pattern 4: Module Loading Verification

**What:** Use master()->resolv() to test that modules load correctly.

**When to use:** In integration tests after creating .pmod structure.

**Example from existing tests:**
```pike
// test/tests/module-load-tests.pike
void test_module_loading() {
  array(string) modules = ({
    "LSP.Intelligence",  // After reorg: loads Intelligence.pmod
    "LSP.Analysis"       // After reorg: loads Analysis.pmod
  });

  foreach (modules, string module_name) {
    mixed module = master()->resolv(module_name);
    if (!module) {
      error("Module %s not found\n", module_name);
    }
  }
}
```

### Anti-Patterns to Avoid

1. **Breaking backward compatibility during transition**
   - Don't delete original files until new structure is verified
   - Keep old Intelligence.pike as fallback during migration

2. **Creating circular dependencies between siblings**
   - Introspection.pike can call .Resolution
   - Resolution.pike should NOT call .Introspection (creates cycle)

3. **Splitting related logic across too many files**
   - StdlibResolver stays in Resolution.pike (not separate)
   - Occurrences stays in Variables.pike (not separate)
   - Keep grep-ability: related concepts in same file

4. **Forgetting to update imports in analyzer.pike**
   - After reorg: `master()->resolv("LSP.Intelligence")` returns the merged module
   - Handler access pattern remains same: `ctx->intelligence->handle_introspect()`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Module loading verification | Custom test code | Existing module-load-tests.pike pattern | Already handles master()->resolv() verification |
| Error wrapping | try/catch in each handler | make_error() from LSP.module | Consistent error format across all LSP handlers |
| String trimming | Custom trim logic | LSP.Compat.trim_whites() | Pike 8.0 compatibility |
| Shared helpers in each file | Duplicated utilities | module.pmod in .pmod directory | Helpers merged into module namespace, accessible to all classes |

**Key insight:** Pike's .pmod system already provides the "shared utilities" pattern via module.pmod. Don't reinvent dependency injection.

## Common Pitfalls

### Pitfall 1: Breaking master()->resolv() During Transition

**What goes wrong:** Creating new .pmod directory but old code still references `LSP.Intelligence` as a class, not a module.

**Why it happens:** Current code instantiates with `IntelligenceClass()` where `IntelligenceClass = master()->resolv("LSP.Intelligence")`. After splitting into a .pmod directory, resolv returns a module, not a class.

**How to avoid:**
1. Keep the main `Intelligence` class in `Intelligence.pmod/Introspection.pike` (rename to maintain backward compat)
2. OR export a factory from module.pmod that creates instances
3. Update analyzer.pline Context initialization after verifying new structure

**Verification:**
```pike
// Test that module loads
mixed module = master()->resolv("LSP.Intelligence");
if (!module) error("Module failed to load");

// Test that class is accessible
mixed cls = module->Introspection;  // or module->Intelligence
if (!programp(cls)) error("Class not found in module");
```

### Pitfall 2: Circular Dependencies Between Siblings

**What goes wrong:** Introspection.pike imports Resolution.pike, Resolution.pike imports Introspection.pike.

**Why it happens:** Trying to share too much code between classes.

**How to avoid:**
- Put shared utilities in module.pmod (no dependencies on sibling classes)
- One-way dependencies only: Introspection -> Resolution is OK
- If two-way dependency exists, merge into one class

### Pitfall 3: Forgetting to Move Helper Functions

**What goes wrong:** Protected helper functions like `introspect_program()` are left in old file but called from new classes.

**Why it happens:** Large files have internal helper functions that are called by handlers.

**How to avoid:**
- Move all helpers used by a class to that class's file
- OR move shared helpers to module.pmod
- Audit all function calls in split files

**Detection:** Search for calls to moved functions:
```bash
# After split, grep for old function names
grep -r "introspect_program" pike-scripts/LSP.pmod/Intelligence.pmod/
```

### Pitfall 4: Line Number Changes in Error Messages

**What goes wrong:** After splitting files, error line numbers don't match source.

**Why it happens:** Moving code changes line numbers, affecting debugging.

**How to avoid:**
- Not much can be done - this is expected
- Update tests to use robust matching (not exact line numbers)
- Document that line numbers changed in migration

### Pitfall 5: Forgetting to Update Imports

**What goes wrong:** Other files still `#include` or reference the old single-file structure.

**Why it happens:** Pike doesn't have explicit imports - relies on module path

**How to avoid:**
- Check all files that reference LSP.Intelligence or LSP.Analysis
- analyzer.pike uses `master()->resolv("LSP.Intelligence")` - verify this still works
- test suites also use resolv() - verify they pass

## Code Examples

### Creating a .pmod Directory Structure

```pike
// Step 1: Create the directory
mkdir -p pike-scripts/LSP.pmod/Intelligence.pmod

// Step 2: Create module.pmod with shared helpers
// File: pike-scripts/LSP.pmod/Intelligence.pmod/module.pmod

//! Shared helpers for Intelligence.pmod classes

//! Traverse type hierarchy (utility for all classes)
array(program) get_inheritance_chain(program p) {
  array(program) chain = ({ p });
  foreach (Program.inherits(p), program parent) {
    chain += get_inheritance_chain(parent);
  }
  return chain;
}

//! Extract autodoc comments from source code
mapping(int:string) extract_autodoc_comments(string code) {
  mapping(int:string) result = ([]);
  array(string) lines = code / "\n";
  array(string) current_doc = ({});
  int doc_start_line = 0;

  for (int i = 0; i < sizeof(lines); i++) {
    string line = LSP.Compat.trim_whites(lines[i]);

    if (has_prefix(line, "//!")) {
      if (sizeof(current_doc) == 0) {
        doc_start_line = i + 1;
      }
      string doc_text = "";
      if (sizeof(line) > 3) {
        doc_text = line[3..];
        if (sizeof(doc_text) > 0 && doc_text[0] == ' ') {
          doc_text = doc_text[1..];
        }
      }
      current_doc += ({ doc_text });
    } else if (sizeof(current_doc) > 0) {
      result[i + 1] = current_doc * "\n";
      current_doc = ({});
    }
  }

  return result;
}

//! Check if type is callable
int(0..1) is_callable(mixed type_info) {
  return functionp(type_info) || programp(type_info);
}
```

### Creating the Introspection Class

```pike
// File: pike-scripts/LSP.pmod/Intelligence.pmod/Introspection.pike

//! Introspection class - Symbol extraction from Pike code
class Introspection {
  private object context;

  void create(object ctx) {
    context = ctx;
  }

  //! Introspect Pike code by compiling and extracting symbols
  //! @param params Mapping with "code" and "filename" keys
  //! @returns Mapping with "result" containing symbols
  mapping handle_introspect(mapping params) {
    mixed err = catch {
      string code = params->code || "";
      string filename = params->filename || "input.pike";

      // Can call helpers from module.pmod directly
      mapping(int:string) docs = extract_autodoc_comments(code);

      program p = compile_string(code, filename);
      mapping result = introspect_program(p);

      // Can use .Resolution to access sibling class
      // object resolver = .Resolution(this);

      result->success = 1;
      return (["result": result]);
    };

    if (err) {
      return LSP.module.make_error("COMPILE", describe_error(err));
    }
  }

  //! Introspect a compiled program
  protected mapping introspect_program(program prog) {
    // ... implementation
    return (["symbols": ({}), "functions": ({})]);
  }
}
```

### Creating the Resolution Class

```pike
// File: pike-scripts/LSP.pmod/Intelligence.pmod/Resolution.pike

//! Resolution class - Module name resolution and go-to-definition
class Resolution {
  private object context;

  void create(object ctx) {
    context = ctx;
  }

  //! Resolve module path to file system location
  mapping handle_resolve(mapping params) {
    mixed err = catch {
      string module_path = params->module || "";
      mixed resolved = master()->resolv(module_path);

      if (resolved) {
        string source_path = get_module_path(resolved);
        return (["result": (["path": source_path, "exists": 1])]);
      }

      return (["result": (["path": 0, "exists": 0])]);
    };

    if (err) {
      return LSP.module.make_error("RESOLVE", describe_error(err));
    }
  }

  //! Get source file path for resolved module
  protected string get_module_path(mixed resolved) {
    // ... implementation
    return "";
  }

  //! StdlibResolver - resolve and extract stdlib module symbols
  mapping handle_resolve_stdlib(mapping params) {
    mixed err = catch {
      string module_path = params->module || "";

      // Check cache first
      mapping cached = LSP.Cache.get("stdlib_cache", module_path);
      if (cached) {
        return (["result": cached]);
      }

      mixed resolved = master()->resolv(module_path);
      // ... implementation

      return (["result": (["found": 1])]);
    };

    if (err) {
      return LSP.module.make_error("RESOLVE", describe_error(err));
    }
  }
}
```

### Integration Test Pattern

```pike
// File: test/tests/intelligence-reorg-tests.pike

//! Tests for Intelligence.pmod reorganization
//! Verifies that splitting into multiple files still works correctly

void test_intelligence_module_loading() {
  // Should load as a module, not fail
  mixed module = master()->resolv("LSP.Intelligence");
  if (!module) {
    error("LSP.Intelligence module not found\n");
  }

  // Check that classes are accessible
  if (!module->Introspection) {
    error("Introspection class not found in module\n");
  }
  if (!module->Resolution) {
    error("Resolution class not found in module\n");
  }
  if (!module->TypeAnalysis) {
    error("TypeAnalysis class not found in module\n");
  }
}

void test_introspection_handler() {
  mixed module = master()->resolv("LSP.Intelligence");
  program IntrospectionClass = module->Introspection;

  // Create instance (no context needed for test)
  object introspection = IntrospectionClass(0);

  mapping params = ([
    "code": "int x;",
    "filename": "test.pike"
  ]);

  mapping result = introspection->handle_introspect(params);

  if (!result->result) {
    error("handle_introspect returned error: %O\n", result);
  }
}

void test_module_pmod_helpers() {
  // module.pmod functions should be accessible via the module
  mixed module = master()->resolv("LSP.Intelligence");

  // Call extract_autodoc_comments from module.pmod
  string code = "//! Test doc\nint x;";
  mapping docs = module->extract_autodoc_comments(code);

  if (!docs || sizeof(docs) == 0) {
    error("extract_autodoc_comments from module.pmod not working\n");
  }
}
```

## State of the Art

### Current File Structure (Before Refactor)

| File | Lines | Main Class | Handlers | Key Helpers |
|------|-------|------------|----------|-------------|
| Intelligence.pike | 1,660 | Intelligence | handle_introspect, handle_resolve, handle_resolve_stdlib, handle_get_inherited | introspect_program, safe_instantiate, get_module_path, read_source_file, parse_stdlib_documentation, parse_autodoc |
| Analysis.pike | 1,191 | Analysis | handle_find_occurrences, handle_analyze_uninitialized, handle_get_completion_context | analyze_scope, analyze_function_body, token navigation helpers |

### Target Structure (After Refactor)

| Module | File | Handlers | Lines (est) |
|--------|------|----------|-------------|
| Intelligence.pmod | module.pmod | Shared helpers only | ~100 |
| Intelligence.pmod | Introspection.pike | handle_introspect | ~400 |
| Intelligence.pmod | Resolution.pike | handle_resolve, handle_resolve_stdlib | ~500 |
| Intelligence.pmod | TypeAnalysis.pike | handle_get_inherited | ~300 |
| Analysis.pmod | module.pmod | Shared helpers only | ~150 |
| Analysis.pmod | Diagnostics.pike | handle_analyze_uninitialized | ~400 |
| Analysis.pmod | Completions.pike | handle_get_completion_context | ~200 |
| Analysis.pmod | Variables.pike | handle_find_occurrences | ~350 |

### Migration Strategy

**Old Approach (risky):** Delete original files, create new structure, hope tests pass.

**Current Approach (safe):**
1. Create new .pmod directories alongside existing files
2. Verify modules load via master()->resolv()
3. Migrate one handler at a time
4. Keep old files as fallback until all tests pass
5. Delete old files after verification

## Open Questions

### Q1: How to handle the Intelligence class in the new structure?

**What we know:**
- Current code has `class Intelligence` with `handle_*` methods
- After split, we'll have multiple classes (Introspection, Resolution, TypeAnalysis)
- analyzer.pike creates `IntelligenceClass()` instance

**What's unclear:**
- Should we keep an `Intelligence` class that delegates to the new classes?
- Or should we update analyzer.pike's Context to handle multiple classes?

**Recommendation:**
- Keep a delegating `Intelligence` class in the new structure for backward compatibility
- This class forwards calls to the appropriate specialized class
- Allows gradual migration without breaking analyzer.pike

### Q2: Should stateless classes still use create(object ctx)?

**What we know:**
- Current classes are stateless (all data passed via params)
- CONTEXT.md mentions `create(object ctx)` pattern

**What's unclear:**
- What context object is needed if classes are stateless?

**Recommendation:**
- Use the pattern for consistency, even if context is currently unused
- Context may be useful later for shared configuration (debug mode, cache settings)
- If context is truly unused, can pass `0` or `this` object

### Q3: How to verify the .pmod structure works before committing?

**What we know:**
- module-load-tests.pike exists and uses master()->resolv()
- This pattern can verify the new structure

**Recommendation:**
- Add tests specifically for the new .pmod structure
- Run tests after each file is created
- Don't proceed to next file until verification passes

## Sources

### Primary (HIGH confidence)
- [Pike Manual Chapter 30 - Writing Pike Modules](https://pike.lysator.liu.se/docs/man/chapter_30.html) - Official documentation on .pmod directories, module.pmod merging, and module resolution
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Intelligence.pike` - Current 1,660-line source file
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Analysis.pike` - Current 1,191-line source file
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/module.pmod` - Existing top-level module pattern (LSPError, make_error, etc.)
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Cache.pmod` - Example of module with private state
- `/home/smuks/OpenCode/pike-lsp/test/tests/module-load-tests.pike` - Existing verification pattern

### Secondary (MEDIUM confidence)
- `/home/smuks/OpenCode/pike-lsp/test/tests/intelligence-tests.pike` - Existing Intelligence handler tests
- `/home/smuks/OpenCode/pike-lsp/test/tests/analysis-tests.pike` - Existing Analysis handler tests
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/analyzer.pike` - Shows how modules are loaded and used

### Tertiary (LOW confidence)
- None - all findings are from source code or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on official Pike documentation and existing codebase
- Architecture patterns: HIGH - .pmod mechanism is well-documented and used in current codebase
- Pitfalls: MEDIUM - Some extrapolation based on general refactoring risks; specific to Pike .pmod splitting
- Code examples: HIGH - Based on patterns from existing code and official Pike manual

**Research date:** 2026-01-21
**Valid until:** 30 days (Pike module system is stable)
**Pike version tested:** 8.0.1116
