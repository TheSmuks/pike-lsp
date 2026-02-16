---
id: pike-LSP-pmod-Intelligence-pmod-Introspection
title: LSP-pmod-Intelligence-pmod-Introspection
description: API documentation for LSP.pmod/Intelligence.pmod/Introspection.pike
---

# LSP.pmod/Intelligence.pmod/Introspection.pike

## Overview

Introspection.pike - Symbol extraction and introspection handlers

This file provides handlers for introspecting Pike code to extract

symbols, types, and structure information.

Design pattern:

- create(object ctx) constructor for context injection

- Handlers wrap errors in catch blocks with LSPError responses

- Uses LSP.Cache for caching compiled programs

- Uses LSP.Compat.trim_whites() for string operations

- Uses helper functions from module.pmod directly

Bootstrap modules used internally by the resolver.

These modules cannot be resolved using the normal path because

they are used during the resolution process itself, causing

circular dependency if we try to resolve them.

IMPORTANT: Stdio is used for reading source files during introspection.

Using Stdio.read_file() triggers module resolution, causing infinite

recursion when resolving Stdio itself. Use Stdio.FILE()-&gt;read() instead.

PERF-XXX: LRU cache for introspected programs

Caches introspection results to avoid re-introspecting the same programs

Key: program identifier (from Program.defined), Value: introspection result

PERF-XXX: Known Pike stdlib modules that don't need deep parent introspection

These modules have well-known symbols and parent introspection is wasteful

Create a new Introspection instance

@param ctx Optional context object (reserved for future use)

Trim leading and trailing whitespace from a string.

Polyfill for missing LSP.Compat.trim_whites

Check if a filename is within the LSP.pmod module directory

@param filename The file path to check

@returns 1 if the file is part of LSP.pmod, 0 otherwise

Convert a file path within LSP.pmod to a module name for resolv()

@param filename The file path (e.g., "/path/to/LSP.pmod/Parser.pike")

@returns Module name (e.g., "LSP.Parser") or empty string if not a valid LSP module file

Normalize a file path for compilation

Handles Windows-style paths like /c:/path -&gt; c:/path to avoid Pike's

path mangling that produces c:/c:/path which breaks module resolution.

@param filename The file path to normalize

@returns Normalized path safe for compilation

Check if a filename is within a .pmod module directory

@param filename The file path to check

@returns 1 if the file is inside a .pmod directory, 0 otherwise

Extract the parent module name for a file in a .pmod directory

@param filename The file path (e.g., "/path/to/Crypto.pmod/RSA.pmod")

@returns Module name (e.g., "Crypto") or empty string if not in a .pmod directory

Preprocess code to convert relative module references to absolute paths

This allows files in .pmod directories to compile without sibling modules.

@param code Source code with potential relative references (e.g., "inherit .Random;")

@param module_name Parent module name (e.g., "Crypto")

@returns Preprocessed code with absolute references (e.g., "inherit Crypto.Random;")

Introspect Pike code using parser only (no compilation)

This is used for files with #require directives that trigger expensive

module loading during compilation, causing timeouts.

IMPORTANT: Does NOT call master()-&gt;resolv() to avoid triggering

module resolution that can cause circular dependencies.

@param params Mapping with "code" and "filename" keys

@returns Mapping with "result" containing minimal symbol information

Introspect Pike code by compiling it and extracting symbol information

Extract inheritance information from source code using Tools.AutoDoc.PikeParser

@param code The source code

@param filename The filename for the parser

@returns Array of mappings with "name" (label) and "classname" (source name)

Introspect Pike code by compiling it and extracting symbol information

@param params Mapping with "code" and "filename" keys

@returns Mapping with "result" containing compilation results and symbols

Parse a function signature string to extract arguments and return type

@param type_str The type string (e.g. "function(int, string : void)")

@returns Mapping with "arguments" (array of mappings) and "returnType" (string)

Safely instantiate a program with timeout protection

Some modules have #require directives or complex dependencies that can

cause circular dependencies or timeout during instantiation. This function

attempts to instantiate but returns 0 if it takes too long or fails.

@param prog The program to instantiate

@returns The instantiated object or 0 if instantiation failed/timed out

Introspect a compiled program to extract symbols

@param prog The compiled program to introspect

@param source_inherits Optional array of inherit metadata from source parsing

@param depth Recursion depth for nested class introspection (default: 0, max: 5)

@returns Mapping containing symbols, functions, variables, classes, inherits

IMPORTANT: Uses safe_instantiate() to prevent timeout crashes when

introspecting modules with complex dependencies (e.g., Crypto.PGP

which has #require directives that trigger module loading).

Introspect a singleton object directly without instantiation

This method is used for stdlib modules that are already loaded as

singleton objects by Pike (e.g., Stdio, String, Array, Mapping).

These cannot be re-instantiated via prog() as that causes

"Parent lost, cannot clone program" errors.

Instead of instantiation, we call indices() and values() directly

on the object to extract its symbols.

@param obj The object to introspect (already instantiated)

@param depth Recursion depth for nested class introspection (default: 0, max: 5)

@returns Mapping containing symbols, functions, variables, classes, inherits

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `BOOTSTRAP_MODULES` | constant | 25 |
| `SKIP_PARENT_INTROSPECT_MODULES` | constant | 42 |
| `identifier` | function | 34 |
| `create` | function | 52 |
| `trim_whites` | function | 59 |
| `is_lsp_module_file` | function | 77 |
| `path_to_module_name` | function | 87 |
| `normalize_path_for_compilation` | function | 125 |
| `is_in_pmod_directory` | function | 150 |
| `get_parent_module_name` | function | 164 |
| `preprocess_relative_references` | function | 187 |
| `handle_introspect_parser_only` | function | 277 |
| `handle_introspect` | function | 337 |
| `compile_error_handler` | function | 380 |
| `parse_function_signature` | function | 493 |
| `safe_instantiate` | function | 545 |
| `introspect_program` | function | 568 |
| `introspect_object` | function | 942 |

