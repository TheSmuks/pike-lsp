---
id: pike-LSP-pmod-Analysis-pmod-Diagnostics
title: LSP-pmod-Analysis-pmod-Diagnostics
description: API documentation for LSP.pmod/Analysis.pmod/Diagnostics.pike
---

# LSP.pmod/Analysis.pmod/Diagnostics.pike

## Overview

Diagnostics.pike - Uninitialized variable analysis

This file provides diagnostic analysis for Pike code, specifically

detecting variables used before initialization. It implements sophisticated

control flow tracking across scopes, branches, and function bodies.

Design pattern:

- create(object ctx) constructor for context injection

- Handlers wrap errors in catch blocks with LSPError responses

- Partial analysis is returned on error rather than failing

Private context field (reserved for future use with LSP context)

Get access to module.pmod constants and helpers

In a .pmod subdirectory, we access module.pmod functions via the module program

Create a new Diagnostics instance

@param ctx Optional LSP context object

Analyze code for potentially uninitialized variable usage

This is the main handler entry point for uninitialized variable analysis.

@param params Mapping with "code" and "filename" keys

@returns Mapping with "result" containing "diagnostics" array

Returns empty diagnostics on error (graceful degradation, not crash)

Implementation of uninitialized variable analysis

Tokenizes the code and calls analyze_scope to find uninitialized variables.

@param code Pike source code to analyze

@param filename Source filename for diagnostics

@returns Array of diagnostic mappings (empty on tokenization error)

Analyze a scope (global, function, or block) for uninitialized variables

Tracks variable declarations and usage across scopes, handling:

- Block boundaries (\{ \})

- Lambda/function definitions (recurses via analyze_function_body)

- Class definitions (recurses via analyze_scope)

@param tokens Array of Parser.Pike tokens

@param lines Source code lines for position lookup

@param filename Source filename

@param start_idx Starting token index

@param end_idx Ending token index (exclusive)

@returns Array of diagnostic mappings

Analyze a function body for uninitialized variable usage

This is the core analysis that tracks variable declarations,

assignments, and usage across all control flow paths.

@param tokens Array of Parser.Pike tokens

@param lines Source code lines for position lookup

@param filename Source filename

@param start_idx Starting token index (after opening \{)

@param end_idx Ending token index (closing \})

@param initial_vars Initial variables (function parameters)

@returns Array of diagnostic mappings

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `create` | function | 20 |
| `handle_analyze_uninitialized` | function | 31 |
| `definitions` | function | 94 |

