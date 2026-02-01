# Pike LSP Dependencies Analysis Summary

**Generated:** 2026-02-01
**Total Pike Files Analyzed:** 11 (.pike files)
**Total Module Files:** 6 (.pmod files)

## Overview

The Pike LSP project uses a modular architecture with three main subsystems:
- **LSP.Parser** - Source code parsing and tokenization
- **LSP.Intelligence** - Introspection, resolution, and type analysis
- **LSP.Analysis** - Diagnostics, completions, and variable analysis

## Most Referenced Files

### 1. LSP.pmod/module.pmod
**References:** 5 direct references
- Exported by: `LSP.Intelligence.*`, `LSP.Analysis.Variables`
- Provides: `LSPError` class, JSON helpers, debug logging, constants
- Role: Central shared utilities module

### 2. LSP.pmod/Cache.pmod
**References:** Used by Intelligence subsystem
- Provides: LRU caching for programs and stdlib modules
- Limits: 30 programs, 50 stdlib modules
- Role: Performance optimization layer

### 3. LSP.pmod/Compat.pmod
**References:** 5 direct references
- Exported by: Parser, Diagnostics, Completions, Resolution, TypeAnalysis
- Provides: `trim_whites()`, `pike_version()` polyfills
- Role: Cross-version compatibility (Pike 7.6, 7.8, 8.0.x)

## Handler Registrations (analyzer.pike)

### Active Handlers (13)
| Method | Handler | Status |
|--------|---------|--------|
| `tokenize` | `ctx->parser->tokenize_request` | Active |
| `compile` | `ctx->parser->compile_request` | Active |
| `batch_parse` | `ctx->parser->batch_parse_request` | Active |
| `resolve` | `ctx->intelligence->handle_resolve` | Active |
| `resolve_stdlib` | `ctx->intelligence->handle_resolve_stdlib` | Active |
| `resolve_include` | inline implementation | Active |
| `get_inherited` | `ctx->intelligence->handle_get_inherited` | Active |
| `find_occurrences` | `ctx->analysis->handle_find_occurrences` | Active |
| `get_completion_context` | `ctx->analysis->handle_get_completion_context` | Active |
| `get_completion_context_cached` | `ctx->analysis->handle_get_completion_context_cached` | Active |
| `analyze` | `ctx->analysis->handle_analyze` | Active |
| `set_debug` | inline implementation | Active |
| `get_version` | `LSP.Compat->pike_version()` | Active |
| `get_startup_metrics` | inline implementation | Active |
| `get_cache_stats` | `LSP.CompilationCache->get_stats()` | Active |
| `invalidate_cache` | `LSP.CompilationCache->invalidate()` | Active |

### Deprecated Handlers (3)
| Method | Replacement | Deprecation Warning |
|--------|-------------|---------------------|
| `parse` | `analyze` with `include: ['parse']` | Line 209 |
| `introspect` | `analyze` with `include: ['introspect']` | Line 245 |
| `analyze_uninitialized` | `analyze` with `include: ['diagnostics']` | Line 351 |

## Inheritance Analysis

**No traditional `inherit` statements found** in the codebase. The architecture uses:
- **Composition** via `master()->resolv()` for dynamic module resolution
- **Delegation** pattern (Intelligence.pike, Analysis.pike forward to specialized classes)
- **Module-level helpers** accessed via `module_program` references

## Include Directives

### Found in 2 files:
1. **analyzer.pike**: `#pike __REAL_VERSION__`
2. **type-introspector.pike**: `#pike __REAL_VERSION__`

**No `#include` directives found** - the codebase does not use traditional C-style includes.

## master()->resolv() Call Analysis

### Total Dynamic Resolutions: 37 calls across 10 files

**Most frequently resolved modules:**
1. `LSP.Cache` - 4 references
2. `LSP.Compat` - 3 references
3. `LSP.Parser` - 3 references
4. `LSP.module.LSPError` - 5 references

**Resolution pattern:**
```pike
// Lazy initialization pattern used throughout
program HandlerClass = master()->resolv("LSP.Module.SubModule.Class");
if (HandlerClass && programp(HandlerClass)) {
    handler_instance = HandlerClass(context);
}
```

## Potential Dead Code

### type-introspector.pike
- **Status:** DEPRECATED
- **Reason:** Functionality moved to `LSP.Intelligence` module
- **Recommendation:** Remove after verifying no external consumers
- **Lines of code:** 569 lines
- **Methods:** `handle_introspect`, `handle_resolve_stdlib`, `handle_get_inherited`

## Module Helper Files

### LSP.pmod/Analysis.pmod/module.pmod
**Exports:** 16 helper functions
- Constants: `STATE_UNINITIALIZED`, `STATE_MAYBE_INIT`, `STATE_INITIALIZED`, `STATE_UNKNOWN`
- Type checking: `is_type_keyword`, `is_identifier`, `is_assignment_operator`
- Token navigation: `find_next_token`, `find_matching_brace`
- Variable management: `remove_out_of_scope_vars`, `save_variable_states`, `restore_variable_states`
- Declaration parsing: `try_parse_declaration`
- Definition detection: `is_function_definition`, `is_lambda_definition`
- Parameter extraction: `extract_function_params`

### LSP.pmod/Intelligence.pmod/module.pmod
**Exports:** 6 helper functions
- AutoDoc parsing: `extract_autodoc_comments`, `extract_symbol_name`
- Markdown conversion: `process_inline_markup`, `replace_markup`
- Utilities: `trim_whites`, `make_error_response`

## Pike Stdlib Dependencies

### Core Modules Used:
1. **Parser.Pike** - Tokenization (split, tokenize)
2. **Tools.AutoDoc.PikeParser** - Documentation parsing
3. **Tools.AutoDoc.DocParser** - AutoDoc tokenization
4. **Program** - Program introspection (defined, inherit_list)
5. **Function** - Function introspection (defined)
6. **Stdio** - File I/O (for reading source files)
7. **String** - String utilities (trim_all_whites)
8. **Standards.JSON** - JSON encoding/decoding

### Stdlib Access Patterns:
- Direct usage: `Parser.Pike.split(code)`
- Via master()->resolv(): Avoids circular dependencies during module initialization
- Conditional: Fallback patterns for missing functions (Pike 7.x compatibility)

## Dependency Graph Levels

### Level 0: Entry Point
- `analyzer.pike`

### Level 1: Core Subsystems
- `LSP.Parser`
- `LSP.Intelligence.Intelligence`
- `LSP.Analysis.Analysis`
- `LSP.CompilationCache`

### Level 2: Specialized Handlers (Intelligence)
- `LSP.Intelligence.Introspection`
- `LSP.Intelligence.Resolution`
- `LSP.Intelligence.TypeAnalysis`

### Level 2: Specialized Handlers (Analysis)
- `LSP.Analysis.Diagnostics`
- `LSP.Analysis.Completions`
- `LSP.Analysis.Variables`

### Level 3: Infrastructure
- `LSP.pmod/module.pmod` (shared utilities)
- `LSP.pmod/Cache.pmod` (caching)
- `LSP.pmod/Compat.pmod` (compatibility)
- `LSP.pmod/CompilationCache.pmod` (compilation cache)

### Level 4: Module Helpers
- `LSP.pmod/Analysis.pmod/module.pmod`
- `LSP.pmod/Intelligence.pmod/module.pmod`

## Key Architectural Patterns

1. **Lazy Initialization:** Handlers created on first use via `master()->resolv()`
2. **Delegation:** Intelligence.pike and Analysis.pike forward to specialized classes
3. **Circular Dependency Avoidance:** Comments note where `master()->resolv()` is required
4. **Bootstrap Modules Guard:** Special handling for Stdio, String, Array, Mapping
5. **Error Normalization:** LSPError class provides consistent error responses
6. **Performance Optimization:** Three-layer caching (program, stdlib, compilation)

## Recommendations

1. **Remove deprecated handlers** after confirming no external consumers:
   - Replace `parse` with `analyze include: ['parse']`
   - Replace `introspect` with `analyze include: ['introspect']`
   - Replace `analyze_uninitialized` with `analyze include: ['diagnostics']`

2. **Consider removing type-introspector.pike**:
   - 569 lines of duplicate code
   - Functionality fully migrated to LSP.Intelligence module

3. **Document master()->resolv() usage**:
   - Add comments explaining why dynamic resolution is needed
   - Note circular dependency avoidance patterns

4. **Standardize error handling**:
   - All handlers should use `LSP.module.LSPError` for consistency
   - Already well-established in the codebase

5. **Performance monitoring**:
   - Cache statistics available via `get_cache_stats` handler
   - Monitor hit/miss ratios to optimize cache sizes
