---
id: pike-LSP-pmod-Intelligence-pmod-ModuleResolution
title: LSP-pmod-Intelligence-pmod-ModuleResolution
description: API documentation for LSP.pmod/Intelligence.pmod/ModuleResolution.pike
---

# LSP.pmod/Intelligence.pmod/ModuleResolution.pike

## Overview

ModuleResolution.pike - Import/include/inherit/require directive handling

This file provides handlers for parsing and resolving Pike module imports

and dependencies with waterfall symbol loading and circular dependency detection.

Design pattern:

- create(object ctx) constructor for context injection

- Handlers wrap errors in catch blocks with LSPError responses

- Uses trim_whites() for string operations

- Uses Parser.Pike.split() for tokenization (NOT regex)

@module ModuleResolution

@summary Module resolution API for Pike LSP analyzer

This module provides functionality for:

- Parsing import/include/inherit/require directives from Pike code

- Resolving directive targets to file paths

- Detecting circular dependencies in import graphs

- Waterfall symbol loading across dependencies

@const string INCLUDE - Preprocessor include directive type

@const string IMPORT - Import statement directive type

@const string INHERIT - Inheritance statement directive type

@const string REQUIRE - Preprocessor require directive type

Create a new ModuleResolution instance

@param ctx Context object with parser, intelligence, analysis references

Trim leading and trailing whitespace from a string

@param s The string to trim

@returns Trimmed string

Check if a file exists (Pike 8.0 compatible)

@param path The file path to check

@returns 1 if file exists and is a regular file, 0 otherwise

Parse a #require directive using limited subset approach.

Supported patterns:

- String literals: #require "module.pike";

- Constant identifiers: #require constant(ModuleName);

- Complex expressions: Marked as skip

@param line

The line containing the #require directive

@param line_num

Line number for error reporting (unused but reserved for future)

@returns

Mapping with type, path, resolution_type, identifier (for constant), skip (for complex)

@example

@code

mapping result = parse_require_directive("#require \"my_module.pike\";", 1);

// result: ([

//   "type": "require",

//   "path": "my_module.pike",

//   "resolution_type": "string_literal",

//   "skip": 0

// ])

mapping result2 = parse_require_directive("#require constant(MyModule);", 2);

// result2: ([

//   "type": "require",

//   "path": "MyModule",

//   "resolution_type": "constant_identifier",

//   "identifier": "MyModule",

//   "skip": 0

// ])

mapping result3 = parse_require_directive("#require some_func() + \".pike\";", 3);

// result3: ([

//   "type": "require",

//   "path": "some_func() + \".pike\";",

//   "resolution_type": "complex_require",

//   "skip": 1

// ])

@endcode

Extract import/include/inherit/require directives from Pike code

Parses a Pike source code string and extracts all import-related directives.

Supports both preprocessor directives (#include, #require) and keyword-based

statements (import, inherit).

@param params Mapping with "code" key (Pike source code string)

@returns Mapping with "result" containing array of import_entry mappings

@returns_mapping result

@returns_array result.imports Array of import_entry structures

@example

@code

mapping params = ([

"code": "import Stdio;\\n#include &lt;unistd.h&gt;\\ninherit Thread.Thread;"

]);

mapping result = handle_extract_imports(params);

// result-&gt;result-&gt;imports contains:

// (\{ (["type": "import", "target": "Stdio", "raw": "import Stdio"]),

//   (["type": "include", "target": "unistd.h", "raw": "#include &lt;unistd.h&gt;"]),

//   (["type": "inherit", "target": "Thread.Thread", "raw": "inherit Thread.Thread"]) \})

@endcode

Resolve an import/include/inherit/require directive to its file path

Given an import directive type and target, attempts to resolve it to a file path.

Resolution logic varies by import type:

- INCLUDE: Resolves "local.h" relative to current file, &lt;system.h&gt; via include paths

- IMPORT: Uses master()-&gt;resolv() to find the program, then Program.defined()

- INHERIT: Multi-strategy resolution (introspection, qualified names, workspace search, stdlib)

- REQUIRE: Tries as module via master()-&gt;resolv(), then as file path

@param params Mapping with "import_type" key (type constant), "target" key (module/path name),

and optional "current_file" key (file path for relative resolution)

@returns_mapping result

@returns_string result.path Resolved absolute file path (empty if not found)

@returns_int result.exists 1 if file exists, 0 otherwise

@returns_string result.type Import type (include/import/inherit/require)

@returns_int result.mtime File modification time (0 if not found)

@returns_string result.error Error message if resolution failed (empty string if success)

@example

@code

mapping params = (["import_type": "import", "target": "Stdio"]);

mapping result = handle_resolve_import(params);

// result-&gt;result-&gt;path: "/usr/local/pike/lib/modules/Stdio.so"

// result-&gt;result-&gt;exists: 1

// result-&gt;result-&gt;type: "import"

mapping params2 = ([

"import_type": "inherit",

"target": "Thread.Thread",

"current_file": "/path/to/current.pike"

]);

mapping result2 = handle_resolve_import(params2);

// Multi-strategy resolution: introspection → qualified → workspace → stdlib

@endcode

Resolve #include directive to file path

@param target Include target (with or without quotes/angle brackets)

@param current_file Current file path for relative includes

@returns Resolved file path or 0

Resolve import Module.Name via master()-&gt;resolv()

@param target Module name to resolve

@returns Resolved file path or 0

Resolve #require directive to file path

@param target Require target (string literal or identifier)

@param current_file Current file path for relative paths

@returns Resolved file path or 0

Resolve inherit ClassName using multi-strategy approach

@param class_name Name of class to resolve

@param current_file Current file path for workspace search context

@returns Resolved file path or 0

Strategy 1: Resolve inherit via introspection data

@param class_name Name of class to resolve

@returns Resolved file path or 0

Strategy 2: Resolve inherit via qualified module names

@param class_name Name of class to resolve

@returns Resolved file path or 0

Strategy 3: Resolve inherit via direct workspace search

@param class_name Name of class to resolve

@param current_file Current file path for context

@returns Resolved file path or 0

Strategy 4: Resolve inherit via stdlib master()-&gt;resolv()

@param class_name Name of class to resolve

@returns Resolved file path or 0

Get directory name from file path

@param path File path

@returns Directory path

Check for circular dependencies in a dependency graph

Performs cycle detection on a dependency graph structure using depth-first search.

Uses three-color DFS (white=unvisited, gray=visiting, black=visited).

@param params Mapping with optional "graph" key (pre-built dependency graph)

or "file" key to build graph from a file

@returns_mapping result

@returns_int result.has_circular 1 if cycles detected, 0 otherwise

@returns_array result.cycle Array of file paths forming a cycle (if found)

@returns_array result.dependencies All dependencies found

@example

@code

// Check imports from code

mapping params = ([

"code": "import A; import B;",

"filename": "test.pike"

]);

mapping result = handle_check_circular(params);

@endcode

Build dependency graph from source code

@param code Pike source code

@param filename Filename for the code

@returns Graph mapping (file -&gt; array of dependencies)

Detect cycles in dependency graph using DFS

@param graph Dependency graph (file -&gt; array of dependencies)

@returns Array of file paths forming a cycle, or empty array if no cycle

DFS helper for cycle detection

@param node Current node being visited

@param graph Dependency graph

@param color Color mapping (0=white, 1=gray, 2=black)

@param path Current DFS path

@returns Cycle path if found, empty array otherwise

Get symbols with waterfall loading (transitive dependency resolution)

Performs transitive symbol loading by recursively resolving all dependencies

of the specified file. Implements waterfall pattern where symbols from

dependencies are loaded with depth tracking for proper prioritization.

@param params Mapping with "code" key (Pike source code) and optional

"filename" key (for resolution context), "max_depth" (default: 5)

@returns_mapping result

@returns_array result.symbols All symbols from file and transitive dependencies

@returns_array result.imports Direct imports from the file

@returns_array result.transitive Transitive imports (waterfall)

@returns_mapping result.provenance Provenance information for each symbol

@example

@code

mapping params = ([

"code": "import Stdio;\n#include \"header.h\";",

"filename": "test.pike",

"max_depth": 3

]);

mapping result = handle_get_waterfall_symbols(params);

@endcode

Load symbols from a file and its transitive dependencies (waterfall)

@param file File path or identifier

@param depth Current depth (0 for direct imports, incremented for transitive)

@param max_depth Maximum depth to traverse

@param visited Mapping of visited files (to prevent cycles)

@param visit_order Array tracking visit order

@param symbols Array to accumulate symbols

@param transitive Array to accumulate transitive imports

@param provenance Mapping of provenance information

Merge symbols with "most specific wins" precedence

Prioritizes symbols based on their depth:

- Current file symbols (depth -1) have highest priority

- Direct imports (depth 0) have medium priority

- Transitive imports (depth 1+) have lowest priority

@param symbols_by_file Array of [symbols, file, depth] entries

@returns Merged symbol array with precedence applied

@example

@code

array result = merge_symbols_with_precedence((\{

(\{ current_file_syms, "main.pike", -1 \}),

(\{ import_syms, "Stdio", 0 \}),

(\{ transitive_syms, "header.h", 1 \})

\}));

@endcode

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `INCLUDE` | constant | 22 |
| `IMPORT` | constant | 25 |
| `INHERIT` | constant | 28 |
| `REQUIRE` | constant | 31 |
| `create` | function | 36 |
| `trim_whites` | function | 44 |
| `is_file` | function | 62 |
| `parse_require_directive` | function | 108 |
| `handle_extract_imports` | function | 177 |
| `handle_resolve_import` | function | 376 |
| `resolve_include` | function | 496 |
| `resolve_import_module` | function | 542 |
| `if` | function | 545 |
| `resolve_require` | function | 566 |
| `resolve_inherit` | function | 587 |
| `resolve_inherit_strategy_introspection` | function | 612 |
| `resolve_inherit_strategy_qualified` | function | 640 |
| `resolve_inherit_strategy_workspace` | function | 675 |
| `resolve_inherit_strategy_stdlib` | function | 716 |
| `get_dirname` | function | 732 |
| `handle_check_circular` | function | 760 |
| `build_dependency_graph_from_code` | function | 818 |
| `handle_get_waterfall_symbols` | function | 915 |
| `load_waterfall_symbols` | function | 982 |
| `merge_symbols_with_precedence` | function | 1081 |

