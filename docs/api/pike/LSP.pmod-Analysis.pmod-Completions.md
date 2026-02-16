---
id: pike-LSP-pmod-Analysis-pmod-Completions
title: LSP-pmod-Analysis-pmod-Completions
description: API documentation for LSP.pmod/Analysis.pmod/Completions.pike
---

# LSP.pmod/Analysis.pmod/Completions.pike

## Overview

Completions.pike - Code completion context analysis

This file provides completion context analysis for Pike code.

It analyzes code around the cursor position to determine:

- What kind of completion is needed (global, identifier, member access, scope access)

- The object/module being accessed (for member/scope access)

- The prefix to complete

Design pattern:

- create(object ctx) constructor for context injection

- Handlers wrap errors in catch blocks

- Uses Parser.Pike for tokenization

Private context field (reserved for future use with LSP context)

Get access to module.pmod helpers

In a .pmod subdirectory, we access module.pmod functions via the module program

Create a new Completions instance

@param ctx Optional LSP context object

Get completion context at a specific position using tokenization

Analyzes code around cursor position to determine completion context.

This enables accurate code completion in LSP clients.

Context types:

- "none": Error or undeterminable context

- "global": Cursor at module scope (before any tokens)

- "identifier": Regular identifier completion (no access operator)

- "member_access": Member access via -&gt; or .

- "scope_access": Scope access via ::

PERF-003: Returns tokenization data for caching on the TypeScript side.

The splitTokens and tokens can be reused in subsequent completion requests

when the document hasn't changed, avoiding expensive re-tokenization.

@param params Mapping with "code" (string), "line" (int, 1-based), "character" (int, 0-based)

@returns Mapping with "result" containing context, objectName, prefix, operator,

plus "splitTokens" and "tokens" for caching

PERF-003: Get completion context using pre-tokenized input

Optimized version that skips tokenization when the caller provides

cached tokens from a previous request. This provides ~10x speedup

for repeated completion requests on unchanged documents.

@param params Mapping with "code", "line", "character", and "splitTokens"

@returns Mapping with "result" containing completion context

Check if cursor is immediately after a dot operator (with optional whitespace)

When the cursor is at "Array.|" or "Array.   |" (with whitespace), this

function detects that the user wants member access completion even though

there's no partial identifier after the dot.

@param code Full source code

@param line_no Line number (1-indexed)

@param char_pos Character position (0-indexed)

@returns true if cursor follows a dot operator (possibly with whitespace)

Helper to extract the prefix being typed at the cursor position

Gets the partial identifier being typed by looking backwards from

the cursor position for word characters.

@param code Full source code

@param line_no Line number (1-indexed)

@param char_pos Character position (0-indexed)

@returns The prefix string (may be empty)

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `create` | function | 22 |
| `handle_get_completion_context` | function | 45 |
| `name` | function | 162 |
| `handle_get_completion_context_cached` | function | 222 |
| `name` | function | 324 |
| `extract_prefix_at_cursor` | function | 409 |

