# Technology Stack: Pike LSP Analyzer Refactoring

**Project:** Pike LSP Analyzer
**Research Date:** 2025-01-19
**Overall Confidence:** HIGH

## Executive Summary

This research analyzes Pike stdlib module patterns to inform the refactoring of `analyzer.pike` (3,221 lines) into a modular `LSP.pmod/` structure. The analysis is based on direct examination of Pike v8.0.1116 stdlib source code, focusing on:
- `Tools.pmod/AutoDoc.pmod/` (large documentation parser module)
- `Parser.pmod/` (parsing utilities)
- `ADT.pmod/` (abstract data types)

**Key Finding:** Pike modules use `.pmod` directories with `module.pmod` files as "namespace controllers" that export shared utilities and inherit from sibling modules. The `.pmod` extension is used for module namespaces and shared code, while `.pike` is for standalone programs and concrete classes.

---

## Module File Types in Pike

### `.pmod` Files (Module Namespace Files)

**Purpose:** Define a module namespace, export utilities, and coordinate between sibling modules.

**When to use:**
- Creating a module namespace directory (`SomeModule.pmod/`)
- Shared utilities and helper functions that siblings use
- Module-level constants and enums
- Exporting symbols from the module

**Example from Pike stdlib:**

```pike
// Tools/AutoDoc.pmod/module.pmod
#pike __REAL_VERSION__

// This module contains utility functions for XML creation and
// some other useful stuff common to all the modules.

#include "./debug.h"

protected constant DOC_COMMENT = "//!";

// Shared enum for all modules
enum Flags {
  FLAG_QUIET = 0,
  FLAG_NORMAL = 1,
  FLAG_VERBOSE = 2,
  FLAG_DEBUG = 3,
  FLAG_VERB_MASK = 3,
  FLAG_KEEP_GOING = 4,
  FLAG_COMPAT = 8,
  FLAG_NO_DYNAMIC = 16,
}

// Protected helper - accessible within the module via "module.pmod"
protected string xmlquote(string s) {
  return replace(s, ({ "<", ">", "&" }), ({ "&lt;", "&gt;", "&amp;" }));
}

// Classes used by siblings
class SourcePosition {
  string filename;
  int firstline;
  int lastline;
  // ...
}

class AutoDocError (
  SourcePosition position,
  string part,
  string message
) {
  // ...
}
```

### `.pike` Files (Program/Class Files)

**Purpose:** Define standalone programs, concrete classes, or single-purpose utilities.

**When to use:**
- Standalone executable scripts (with `main()` or `#!/usr/bin/env pike`)
- Concrete class implementations that don't export symbols
- Single-purpose utilities
- Leaf nodes in the module tree

**Example from Pike stdlib:**

```pike
// Tools/AutoDoc.pmod/PikeParser.pike
#pike __REAL_VERSION__

//! A very special purpose Pike parser that can parse some selected
//! elements of the Pike language...

#include "./debug.h"

protected inherit .PikeObjects;
protected .Flags flags = .FLAG_NORMAL;

//! The end of file marker.
constant EOF = "";

// This is a concrete parser class - no exports
class ParseError {
  inherit Error.Generic;
  // ...
}
```

### Decision Matrix

| Scenario | Use | Why |
|----------|-----|-----|
| Module namespace root | `.pmod` | Defines the namespace, can export shared items |
| Shared utilities between siblings | `.pmod` (in `module.pmod`) | Siblings can inherit from `module.pmod` |
| Concrete class/implementation | `.pike` | Self-contained, no export needed |
| Complex submodule with own namespace | `.pmod` directory + `module.pmod` | Creates nested namespace |
| Simple submodule without internal hierarchy | `.pike` or `.pmod` (flat) | `.pike` for single class, `.pmod` for multi-function |

---

## Module Directory Structure Patterns

### Pattern 1: Flat Module (ADT.pmod)

```
ADT.pmod/
  module.pmod        -- Shared utilities (struct error, item_counter)
  Stack.pike         -- Concrete class
  Queue.pike         -- Concrete class
  Heap.pike          -- Concrete class
  Set.pike           -- Concrete class
  Struct.pike        -- Concrete class
  Relation.pmod/     -- Nested submodule
    Binary.pike
```

**Key observations:**
- `module.pmod` exports shared utilities (e.g., `struct` class, error handling)
- Sibling `.pike` files can access `module.pmod` via `inherit .module.pmod`
- `Relation.pmod/` is a nested module with its own namespace

### Pattern 2: Hierarchical Module (Parser.pmod)

```
Parser.pmod/
  module.pmod        -- HTML utilities, entity parsers
  C.pmod             -- C language parser (shared token utilities)
  Pike.pmod          -- Pike language parser
  Python.pmod        -- Python language parser
  CSV.pike           -- CSV parser (standalone)
  LR.pmod/           -- Nested submodule
    module.pmod      -- Parser generator classes
    GrammarParser.pmod
    lr.pike
  XML.pmod/          -- Nested submodule
    module.pmod      -- Simple: just inherits Parser._parser.XML
    DOM.pmod
    Tree.pmod
    SloppyDOM.pmod
```

**Key observations:**
- `module.pmod` provides shared utilities (HTML entity parsing, XML parser)
- Language parsers (`.pmod`) can share tokenization utilities
- Nested modules (`LR.pmod/`, `XML.pmod/`) have their own `module.pmod`

### Pattern 3: Complex Module with Shared State (Tools.pmod/AutoDoc.pmod)

```
Tools.pmod/AutoDoc.pmod/
  module.pmod            -- Shared: Flags enum, SourcePosition, AutoDocError, XML helpers
  debug.h                -- Debug macros (TRACE, SHOW)
  PikeParser.pike        -- Concrete Pike parser
  PikeExtractor.pmod     -- Uses module.pmod, DocParser
  PikeObjects.pmod       -- Type classes, XML generation (inherits module.pmod)
  DocParser.pmod         -- Documentation parser (inherits PikeObjects)
  ProcessXML.pmod        -- XML processing
  CExtractor.pmod        -- C extractor
  BMMLParser.pike        -- BMML parser
  MirarDocParser.pike    -- Mirar doc parser
```

**Import patterns observed:**

```pike
// PikeExtractor.pmod
protected inherit .DocParser;           // Sibling import
#include "./debug.h";                    // Local header

// PikeObjects.pmod
protected inherit "module.pmod";        // Explicit module.pmod import
protected inherit Parser.XML.Tree;      // External module

// DocParser.pmod
inherit .PikeObjects;                   // Sibling import (short form)

// module.pmod (itself doesn't inherit, defines exports)
// Siblings import from it:
protected .Flags flags = .FLAG_NORMAL;  // Access module.pmod constant
```

---

## Import/Export Patterns

### 1. Dot Notation for Sibling Modules

```pike
// Import from sibling in same directory
protected inherit .DocParser;
object parser = .PikeParser(code, filename, line);

// Access constants/enums from module.pmod
protected .Flags flags = .FLAG_NORMAL;
```

### 2. Explicit module.pmod Import

```pike
// When you need the module.pmod specifically
protected inherit "module.pmod";
```

### 3. External Module Import

```pike
// Import from completely different module
protected inherit Parser.XML.Tree;
constant HTML = Parser._parser.HTML;
```

### 4. Header Files (.h)

```pike
// Use #include for local headers
#include "./debug.h"

// debug.h contains:
#define TRACE werror("### %s(%d)\n", __FILE__, __LINE__);
#define SHOW(x) werror("### %s(%d) %s == %O\n", __FILE__, __LINE__, #x, (x));
```

### 5. Protected vs Public

```pike
// protected = module internal only
protected inherit .DocParser;
protected class Helper { }
protected constant INTERNAL = 1;

// public = exported from module
class ExportedClass { }
constant PUBLIC_API = 1;
```

---

## Shared Utilities Organization

### Pattern: module.pmod as Shared Container

**Best practice:** Put shared utilities in `module.pmod` that siblings can inherit.

```pike
// module.pmod
#pike __REAL_VERSION__

//! Shared utilities for all LSP analyzer modules

// Constants
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;

// Enums
enum DebugLevel {
  QUIET = 0,
  NORMAL = 1,
  VERBOSE = 2,
}

// Error classes
class AnalyzerError {
  string message;
  protected void create(string msg) { message = msg; }
}

// Helper functions
protected string quote_string(string s) {
  return "\"" + replace(s, ({ "\"", "\\" }), ({ "\\\"", "\\\\" })) + "\"";
}

protected mapping(string:string) make_attributes(mapping attrs) {
  // ...
}
```

**Sibling usage:**

```pike
// Parser.pike
#pike __REAL_VERSION__

protected inherit .module;  // Access all shared utilities

// Now can use:
constant MAX_ITER = .MAX_TOP_LEVEL_ITERATIONS;
// Or just: constant MAX_ITER = MAX_TOP_LEVEL_ITERATIONS;  // inherited
```

### Alternative: Dedicated Utils Module

For larger shared codebases, a separate utilities module:

```
LSP.pmod/
  module.pmod
  Utils.pmod           -- All shared helpers
    string.pike
    json.pike
    debug.pike
  Parser.pike
  SymbolExtractor.pike
```

**Usage:**

```pike
// Parser.pike
protected inherit .Utils.string;
protected inherit .Utils.json;
```

---

## File Naming Conventions (from Pike stdlib)

| Pattern | Example | Purpose |
|---------|---------|---------|
| `Module.pmod` | `Parser.pmod`, `ADT.pmod` | Top-level module directory |
| `module.pmod` | `Parser.pmod/module.pmod` | Module coordinator, shared exports |
| `ClassName.pike` | `Stack.pike`, `Heap.pike` | Single public class |
| `camelCase.pike` | `PikeParser.pike`, `BMMLParser.pike` | Parser/named utility classes |
| `lowercase.pmod` | `PikeObjects.pmod`, `DocParser.pmod` | Multi-function module |
| `Header.h` | `debug.h` | C preprocessor macros |
| `under_score.pike` | `priority_queue.pike` | Alternative to CamelCase |

**Observation:** Pike stdlib is inconsistent. Both `CamelCase.pike` and `under_score.pike` exist. For LSP analyzer, use:
- `PascalCase.pike` for concrete classes
- `camelCase.pmod` for multi-function modules
- `UPPER_CASE` for constants

---

## Header File Usage

**From `Tools.pmod/AutoDoc.pmod/debug.h`:**

```pike
#define TRACE werror("### %s(%d)\n", __FILE__, __LINE__);
#define SHOW(x) werror("### %s(%d) %s == %O\n", __FILE__, __LINE__, #x, (x));
```

**Usage:**

```pike
#include "./debug.h"

void some_function() {
  TRACE;  // Prints file and line number
  SHOW(variable);  // Prints variable value
}
```

**Recommendation:** Use `debug.h` for development macros, but prefer Pike constants/defines for production code (better portability).

---

## Anti-Patterns to Avoid

### 1. Don't Mix Entry Point with Library Code

**Bad:**
```pike
// analyzer.pike (3221 lines!)
// Main entry point mixed with parser logic, symbol extraction, etc.
```

**Good:**
```pike
// LSP.pmod/
//   module.pmod          -- Shared utilities
//   Main.pike            -- Entry point, inherits LSP
//   Parser.pike          -- Parsing logic
//   SymbolExtractor.pike -- Symbol extraction
//   Diagnostics.pike     -- Error reporting
```

### 2. Don't Put Everything in module.pmod

**Bad:**
```pike
// module.pmod with 2000 lines of implementation
```

**Good:**
```pike
// module.pmod: exports, constants, shared helpers (< 200 lines)
// Implementation split into sibling .pike/.pmod files
```

### 3. Don't Use Deep Nesting Without Reason

**Bad:**
```pike
// LSP.pmod/Parser/Pike/Symbols/Extractors.pike
```

**Good:**
```pike
// LSP.pmod/SymbolExtractor.pike
// or LSP.pmod/Extractor/Symbols.pike if truly needed
```

### 4. Don't Ignore Protected vs Public

**Bad:**
```pike
// Making everything public when it should be module-internal
class InternalHelper { }  // Should be protected
```

**Good:**
```pike
protected class InternalHelper { }
public class API { }  // or just: class API { }
```

### 5. Don't Duplicate Shared Code

**Bad:**
```pike
// Parser.pike
string quote(string s) { /* ... */ }

// Extractor.pike
string quote(string s) { /* ... same code ... */ }
```

**Good:**
```pike
// module.pmod
protected string quote(string s) { /* ... */ }

// Parser.pike, Extractor.pike
protected inherit .module;  // Use shared quote()
```

---

## Recommended Structure for LSP.pmod

Based on Pike stdlib patterns and analyzer.pick's current functionality:

```
LSP.pmod/
  module.pmod                    -- Shared: constants, errors, JSON utils, debug
  debug.h                        -- Debug macros (TRACE, SHOW)

  // Entry point
  Main.pike                      -- JSON-RPC server entry point

  // Core parsing
  Parser.pike                    -- Pike source parser wrapper
  Tokenizer.pike                 -- Tokenization utilities

  // Symbol extraction
  SymbolExtractor.pike           -- Extract symbols from parsed code
  Symbol.pike                    -- Symbol representation classes

  // Type analysis
  TypeResolver.pike              -- Resolve types
  TypeIntrospector.pike          -- Runtime type introspection

  // Diagnostics
  Diagnostics.pike               -- Error/warning generation
  Analyzer.pike                  -- Uninitialized variable analysis

  // Stdlib integration
  StdlibResolver.pike            -- Resolve stdlib paths
  StdlibScanner.pike             -- Scan and cache stdlib symbols

  // Utilities
  JSON.pike                      -- JSON encoding/decoding helpers
  Preprocessor.pike              -- Handle # directives
  Completion.pike                -- Context-aware completion
```

**module.pmod skeleton:**

```pike
#pike __REAL_VERSION__

//! LSP Analyzer Module for Pike
//! Provides parsing, symbol extraction, and type analysis for Pike code.

// Configuration constants (from MAINT-004)
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;
constant MAX_CACHED_PROGRAMS = 30;
constant MAX_STDLIB_MODULES = 50;

// Debug mode (PERF-005)
int debug_mode = 0;

// Shared error classes
class LSPError {
  string code;
  string message;
  protected void create(string _code, string _message) {
    code = _code;
    message = _message;
  }
}

class ParseError {
  inherit LSPError;
  constant error_code = "PARSE_ERROR";
  protected void create(string _message) {
    ::create(error_code, _message);
  }
}

// Protected helpers
void debug(string fmt, mixed... args) {
  if (debug_mode) {
    werror(fmt, @args);
  }
}

protected string quote_xml(string s) {
  return replace(s, ({ "<", ">", "&" }), ({ "&lt;", "&gt;", "&amp;" }));
}
```

**Main.pike skeleton:**

```pike
#!/usr/bin/env pike
#pike __REAL_VERSION__

//! LSP Analyzer JSON-RPC Server

protected inherit .module;
protected inherit .Parser;
protected inherit .SymbolExtractor;
protected inherit .TypeResolver;
protected inherit .Diagnostics;

protected mapping(string:mixed) handle_request(mapping request) {
  // Dispatch to handler modules
}

int main(int argc, array(string) argv) {
  // JSON-RPC loop
}
```

---

## Migration Strategy

### Phase 1: Create Module Structure

1. Create `LSP.pmod/` directory
2. Create `module.pmod` with shared utilities
3. Create `Main.pike` as new entry point

### Phase 2: Extract Modules (one per iteration)

1. Extract `Parser.pike` - tokenization, parsing
2. Extract `SymbolExtractor.pike` - symbol extraction logic
3. Extract `Diagnostics.pike` - error reporting
4. Extract `TypeResolver.pike` - type resolution
5. Extract remaining utilities

### Phase 3: Update Main Entry Point

1. `Main.pike` imports from siblings
2. Keep `analyzer.pike` as shim or delete
3. Update any external references

---

## Sources

- **Pike v8.0.1116 stdlib source** (HIGH confidence):
  - `/home/smuks/Antigravity/PikeLSP/Pike-v8.0.1116/lib/modules/Tools.pmod/AutoDoc.pmod/`
  - `/home/smuks/Antigravity/PikeLSP/Pike-v8.0.1116/lib/modules/Parser.pmod/`
  - `/home/smuks/Antigravity/PikeLSP/Pike-v8.0.1116/lib/modules/ADT.pmod/`

- **Current analyzer.pike**:
  - `/home/smuks/OpenCode/pike-lsp/pike-scripts/analyzer.pike` (3,221 lines)
