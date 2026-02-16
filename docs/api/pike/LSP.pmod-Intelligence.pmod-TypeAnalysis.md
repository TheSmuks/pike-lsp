---
id: pike-LSP-pmod-Intelligence-pmod-TypeAnalysis
title: LSP-pmod-Intelligence-pmod-TypeAnalysis
description: API documentation for LSP.pmod/Intelligence.pmod/TypeAnalysis.pike
---

# LSP.pmod/Intelligence.pmod/TypeAnalysis.pike

## Overview

TypeAnalysis.pike - Type inheritance and AutoDoc parsing handlers

This file provides handlers for type inheritance traversal and AutoDoc

documentation parsing using Pike's native Tools.AutoDoc.DocParser.

Design pattern:

- create(object ctx) constructor for context injection

- Handlers wrap errors in catch blocks with LSPError responses

- Uses LSP.Compat.trim_whites() for string operations

- Uses helper functions from module.pmod (process_inline_markup) for markdown conversion

Create a new TypeAnalysis instance

@param ctx Optional context object (reserved for future use)

Get inherited members from a class

Retrieves inherited members from parent classes using Program.inherit_list().

@param params Mapping with "class" key (fully qualified class name)

@returns Mapping with "result" containing inherited members

Per CONTEXT.md decision:

- Errors in class resolution return empty result (not crash)

- Handles both object and program resolutions

Note: Basic inheritance traversal (no cycle detection yet)

- Current implementation handles typical shallow inheritance chains

- Cycle detection can be added in future enhancement

Parse autodoc documentation string into structured format

Uses Pike's native Tools.AutoDoc.DocParser.splitDocBlock for tokenization.

Processes AutoDoc markup tags (@param, @returns, @throws, etc.) into

structured documentation.

@param doc The raw autodoc documentation string

@returns Mapping with structured documentation fields

Token type constants (Pitfall 3 from RESEARCH.md):

1 = METAKEYWORD, 3 = DELIMITERKEYWORD, 4 = BEGINGROUP,

6 = ENDGROUP, 7 = ENDCONTAINER, 8 = TEXTTOKEN, 9 = EOF

Internal implementation of parse_autodoc

Save accumulated text buffer to the appropriate result section

Format a group (array/mapping/multiset) as markdown-formatted text

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `create` | function | 15 |
| `handle_get_inherited` | function | 33 |
| `parse_autodoc` | function | 125 |
| `parse_autodoc_impl` | function | 138 |
| `save_text_buffer` | function | 748 |
| `format_group_as_text` | function | 868 |

