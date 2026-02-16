---
id: pike-LSP-pmod-Intelligence-pmod-Resolution
title: LSP-pmod-Intelligence-pmod-Resolution
description: API documentation for LSP.pmod/Intelligence.pmod/Resolution.pike
---

# LSP.pmod/Intelligence.pmod/Resolution.pike

## Overview

Resolution.pike - Module name resolution and stdlib introspection handlers

This file provides handlers for resolving module paths to file locations,

introspecting stdlib modules with documentation, and managing stdlib caching.

Design pattern:

- create(object ctx) constructor for context injection

- Handlers wrap errors in catch blocks with LSPError responses

- Uses LSP.Cache for stdlib data caching

- Uses LSP.Compat.trim_whites() for string operations

- Uses helper functions from module.pmod (extract_autodoc_comments, extract_symbol_name)

Bootstrap modules used internally by the resolver.

These modules cannot be resolved using the normal path because

they are used during the resolution process itself, causing

circular dependency if we try to resolve them.

IMPORTANT: Stdio is used for reading source files during introspection.

Using Stdio.read_file() triggers module resolution, causing infinite

recursion when resolving Stdio itself. Use Stdio.FILE()-&gt;read() instead.

Track modules currently being resolved to prevent circular dependency.

When a module is being resolved, it's added to this set. If the same

module is requested again during resolution, we return early to prevent

infinite recursion (30-second timeout).

Create a new Resolution instance

@param ctx Optional context object (reserved for future use)

Resolve module path to file system location

@param params Mapping with "module" and "currentFile" keys

@returns Mapping with "result" containing "path", "exists", and optionally "symbols"

Resolve stdlib module and extract symbols with documentation

Uses LSP.Cache for stdlib data caching with flat module name keys.

@param params Mapping with "module" key (fully qualified module name)

@returns Mapping with "result" containing module symbols and documentation

Implements two-cache architecture:

- Stdlib cache: flat by module name, on-demand loading, never invalidated during session

- Symbols merged from runtime introspection and source file parsing

- Documentation parsed from AutoDoc comments and merged into results

Per CONTEXT.md decision:

- Cache check happens before resolution (returns cached data if available)

- Line number suffix is stripped from Program.defined() paths

Bootstrap modules guard: For modules used internally by the resolver

(Stdio, String, Array, Mapping), we use reflection-only introspection

to avoid circular dependency. These modules are already loaded by Pike

before our code runs, so master()-&gt;resolv() succeeds, but we must avoid

using their methods (like Stdio.read_file()) during resolution.

Get the source file path for a resolved module

Uses Pike's native module resolution instead of heuristics

Handles dirnodes (directory modules), joinnodes (merged modules),

and regular programs/objects.

@param resolved The resolved module object or program

@returns The source file path, or empty string if not found

Extract symbols from a local module file for completion caching.

Uses the Parser class to extract symbols from .pike or .pmod files.

@param file_path Path to the local module file

@returns Array of symbol mappings

Safely read a source file without triggering module resolution recursion.

IMPORTANT: Must use Stdio.FILE()-&gt;read() NOT Stdio.read_file().

Stdio.read_file() triggers module resolution via master()-&gt;resolv(),

causing infinite recursion when resolving Stdio itself.

@param path The file path to read

@param max_bytes Maximum bytes to read (default 1MB)

@returns File contents or empty string on error

Parse stdlib source file for autodoc documentation

Returns mapping of symbol name -&gt; documentation mapping

@param source_path Path to the stdlib source file (may have line number suffix)

@returns Mapping of symbol name to parsed documentation

Uses extract_autodoc_comments and extract_symbol_name helpers from module.pmod.

Extract AutoDoc from bootstrap modules after resolution is complete

This method is safe to call after all modules are loaded because

the module system is now stable and won't cause circular dependencies.

@param module_path The module name (e.g., "Array", "String")

@returns Documentation mapping or empty if not found

Merge documentation into introspected symbols

@param introspection The introspection result mapping

@param docs Mapping of symbol name -&gt; documentation

@returns Updated introspection with documentation merged in

Merges documentation into symbols, functions, and variables arrays.

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `Cache` | constant | 14 |
| `BOOTSTRAP_MODULES` | constant | 24 |
| `create` | function | 40 |
| `handle_resolve` | function | 47 |
| `handle_resolve_stdlib` | function | 151 |
| `get_module_path` | function | 345 |
| `extract_local_module_symbols` | function | 401 |
| `read_source_file` | function | 441 |
| `parse_stdlib_documentation` | function | 480 |
| `extract_bootstrap_autodoc` | function | 575 |
| `merge_documentation` | function | 601 |
| `if` | function | 605 |
| `if` | function | 619 |
| `if` | function | 633 |

