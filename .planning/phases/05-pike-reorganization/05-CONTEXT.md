# Phase 5: Pike Reorganization - Context

## Goal

Split large Pike files using `.pmod` idiom, but keep it to 3-4 files max per module. Avoid micro-modules that hurt grep-ability.

## Philosophy

**Balanced Granularity:** Don't create 8 micro-modules. Keep related logic together (StdlibResolver with Resolution, Occurrences with Variables). Split the 1,660-line Intelligence.pike into ~400-500 line files - that's still manageable.

## Requirements Mapped

- PIK-01: Create `Intelligence.pmod/module.pmod` with shared helpers (type traversal, inheritance utils)
- PIK-02: Create `Intelligence.pmod/Introspection.pike` (symbol extraction, docstrings)
- PIK-03: Create `Intelligence.pmod/Resolution.pike` (name resolution, go-to-definition, StdlibResolver)
- PIK-04: Create `Intelligence.pmod/TypeAnalysis.pike` (type inference, inheritance chains)
- PIK-05: Create `Analysis.pmod/module.pmod` with shared helpers (scope tracking, position utils)
- PIK-06: Create `Analysis.pmod/Diagnostics.pike` (error/warning generation)
- PIK-07: Create `Analysis.pmod/Completions.pike` (completion context, suggestions)
- PIK-08: Create `Analysis.pmod/Variables.pike` (uninitialized detection, scope tracking, Occurrences)
- PIK-09: Each .pike class has `create(object ctx)` constructor
- PIK-10: Each .pike class wraps handlers in catch blocks with make_error()
- PIK-11: Intelligence.pike reduced from 1660 to ~400-500 lines per file
- PIK-12: Integration tests verify module loading via master()->resolv()

## Success Criteria

1. `Intelligence.pmod/` directory with module.pmod + 3 .pike files
2. `Analysis.pmod/` directory with module.pmod + 3 .pike files
3. Intelligence.pike reduced from 1,660 to ~400-500 lines per file
4. Related logic stays together (StdlibResolver with Resolution, Occurrences with Variables)
5. All classes use `create(object ctx)` constructor pattern
6. All classes wrap handlers in catch with make_error() returns
7. Integration tests verify module loading via master()->resolv()

## Deliverables

### New Structure

```
pike-scripts/LSP.pmod/
  module.pmod              # Top-level exports
  Parser.pike              # (existing, unchanged)
  Cache.pmod               # (existing, unchanged)
  Compat.pmod              # (existing, unchanged)

  Intelligence.pmod/
    module.pmod            # Shared helpers (type traversal, inheritance utils)
    Introspection.pike     # Symbol extraction, docstrings
    Resolution.pike        # Name resolution, go-to-definition
    TypeAnalysis.pike      # Type inference, inheritance chains
    # Note: StdlibResolver stays in Resolution.pike (not separate)

  Analysis.pmod/
    module.pmod            # Shared helpers (scope tracking, position utils)
    Diagnostics.pike       # Error/warning generation
    Completions.pike       # Completion context, suggestions
    Variables.pike         # Uninitialized detection, scope tracking
    # Note: Occurrences stays in Variables.pike (not separate)
```

### Why 3-4 Files, Not 8

| Original Plan (v1) | Final Structure (v2) | Rationale |
|-------------------|---------------------|-----------|
| Introspection.pike | Introspection.pike | Keep |
| Resolution.pike | Resolution.pike | Keep |
| StdlibResolver.pike | (in Resolution.pike) | Related to resolution |
| TypeAnalysis.pike | TypeAnalysis.pike | Keep |
| Diagnostics.pike | Diagnostics.pike | Keep |
| Completions.pike | Completions.pike | Keep |
| Variables.pike | Variables.pike | Keep |
| Occurrences.pike | (in Variables.pike) | Related to variables |

### module.pmod Pattern

```pike
// Intelligence.pmod/module.pmod
// Shared helpers available to all classes in this .pmod

//! Traverse type hierarchy
array(program) get_inheritance_chain(program p) {
  array(program) chain = ({ p });
  foreach (Program.inherits(p), program parent) {
    chain += get_inheritance_chain(parent);
  }
  return chain;
}

//! Check if type is callable
int(0..1) is_callable(mixed type_info) {
  return functionp(type_info) || programp(type_info);
}
```

### Class Pattern

```pike
// Intelligence.pmod/Introspection.pike

//! Extracts symbols and type information from Pike code
class Introspection {
  private object context;

  void create(object ctx) {
    context = ctx;
  }

  //! Introspect code and return symbol information
  mapping introspect(string code, string filename) {
    // Can use .Resolution for sibling class
    // Can use get_inheritance_chain() from module.pmod directly

    mixed err = catch {
      program p = compile_string(code, filename);
      return extract_symbols(p);
    };

    if (err) {
      return make_error("COMPILE", describe_error(err));
    }
  }

  private mapping extract_symbols(program p) {
    // ... extraction logic
  }
}
```

## Dependencies

- Phase 4: Server-side must be stable before Pike changes

## Notes

- Related logic stays together for grep-ability
- 3-4 files per .pmod is the sweet spot
- Each class can access sibling classes via `.ClassName`
- Each class can access module.pmod helpers directly
- Error handling uses make_error() from Phase 1
