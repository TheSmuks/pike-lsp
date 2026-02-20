---
id: pike-LSP.pmod-Analysis.pmod-Variables
title: LSP.pmod/Analysis.pmod/Variables.pike
description: Development guide for LSP.pmod/Analysis.pmod/Variables.pike
---

# LSP.pmod/Analysis.pmod/Variables.pike

## Overview

Variables.pike - Variable analysis and occurrences

This file provides variable analysis for Pike code, specifically

finding all identifier occurrences in source code. It uses tokenization

to accurately identify variables while filtering out keywords and operators.

Design pattern:

- create(object ctx) constructor for context injection

- Handlers wrap errors in catch blocks

- Uses Parser.Pike for tokenization

Private context field (reserved for future use with LSP context)

Get access to module.pmod helpers

In a .pmod subdirectory, we access module.pmod functions via the module program

Create a new Variables instance

@param ctx Optional LSP context object

Find all identifier occurrences using tokenization

This is much more accurate and faster than regex-based searching.

Uses Parser.Pike tokenization to find all identifiers in Pike source code,

filtering out keywords and operators.

@param params Mapping with:

- "code": string (optional if tokens/lines provided)

- "tokens": array (optional)

- "lines": array of strings (optional)

@returns Mapping with "result" containing "occurrences" array

Each occurrence has: text, line, character

Helper to get character position of a token on a line

Find the nth occurrence of a token in a line (1-indexed)

@param lines Array of code lines

@param line_no Line number (1-indexed)

@param token_text Token text to find

@param nth Which occurrence to find (1-based)

@returns Character position (0-indexed) or -1 if not found

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `create` | function | 20 |
| `handle_find_occurrences` | function | 36 |
| `find_nth_occurrence` | function | 122 |

