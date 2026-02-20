---
id: pike-LSP.pmod-Intelligence.pmod-Intelligence
title: LSP.pmod/Intelligence.pmod/Intelligence.pike
description: Development guide for LSP.pmod/Intelligence.pmod/Intelligence.pike
---

# LSP.pmod/Intelligence.pmod/Intelligence.pike

## Overview

Intelligence.pike - Backward-compatible delegating class

This class forwards all handler calls to the appropriate specialized class

in the Intelligence.pmod/ namespace.

Usage in analyzer.pike:

program IntelligenceClass = master()-&gt;resolv("LSP.Intelligence.Intelligence");

intelligence = IntelligenceClass();

Private handler instances (created on first use)

Create a new Intelligence instance

Helper to create an LSP Error response without static dependency

Get or create the introspection handler

Get or create the resolution handler

Get or create the type analysis handler

Get or create the module resolution handler

Introspect Pike code by compiling it and extracting symbol information

Delegates to Introspection class in Intelligence.pmod/

Resolve module path to file system location

Delegates to Resolution class in Intelligence.pmod/

Resolve stdlib module and extract symbols with documentation

Delegates to Resolution class in Intelligence.pmod/

Get inherited members from a class

Delegates to TypeAnalysis class in Intelligence.pmod/

Introspect a compiled program to extract symbols

Delegates to Introspection class in Intelligence.pmod/

This is a public method for use by handle_analyze in Analysis.pike

for request consolidation (Phase 12).

@param prog The compiled program to introspect

@returns Mapping containing symbols, functions, variables, classes, inherits

Extract import/include/inherit/require directives from Pike code

Delegates to ModuleResolution class in Intelligence.pmod/

Resolve an import/include/inherit/require directive to its file path

Delegates to ModuleResolution class in Intelligence.pmod/

Check for circular dependencies in a dependency graph

Delegates to ModuleResolution class in Intelligence.pmod/

Get symbols with waterfall loading (transitive dependency resolution)

Delegates to ModuleResolution class in Intelligence.pmod/

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `create` | function | 16 |
| `make_error_response` | function | 22 |
| `get_introspection_handler` | function | 37 |
| `get_resolution_handler` | function | 48 |
| `get_type_analysis_handler` | function | 59 |
| `get_module_resolution_handler` | function | 70 |
| `handle_introspect` | function | 81 |
| `handle_resolve` | function | 91 |
| `handle_resolve_stdlib` | function | 101 |
| `handle_get_inherited` | function | 111 |
| `introspect_program` | function | 127 |
| `handle_extract_imports` | function | 137 |
| `handle_resolve_import` | function | 147 |
| `handle_check_circular` | function | 157 |
| `handle_get_waterfall_symbols` | function | 167 |

