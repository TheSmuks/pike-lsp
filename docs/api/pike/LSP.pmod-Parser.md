---
id: pike-LSP-pmod-Parser
title: LSP-pmod-Parser
description: API documentation for LSP.pmod/Parser.pike
---

# LSP.pmod/Parser.pike

## Overview

Parser.pike - Stateless parser class for Pike LSP

Design per CONTEXT.md:

- Parser is a pure function: source text in, structured result out

- Parser has no cache interaction (cache belongs to handler layer)

- Parser methods throw exceptions on unexpected errors (caller catches)

This file acts as a class - instantiate with Parser() from LSP.Parser

Create a new Parser instance

Parse Pike source code and extract symbols

@param params Mapping with "code", "filename", "line" keys

@returns Mapping with "result" containing "symbols" and "diagnostics"

@throws On unexpected parsing errors (caller catches)

Tokenize Pike source code

@param params Mapping with "code" key

@returns Mapping with "result" containing "tokens" array

@throws On tokenization errors (caller catches)

PERF-004: Includes character positions to avoid JavaScript string search

Compile Pike source code and capture diagnostics

@param params Mapping with "code" and "filename" keys

@returns Mapping with "result" containing "symbols" and "diagnostics"

@throws On compilation errors (caller catches)

Parse preprocessor conditional blocks and extract branch structure

@param code Raw source code

@returns Array of preprocessor block mappings with conditions, branches, line ranges

Extract symbol declarations from potentially incomplete code using token-based analysis

Uses Parser.Pike.split() which handles unbalanced braces gracefully

@param branch_code String of code from a single preprocessor branch

@param filename Source filename for position tracking

@param line_offset Line number offset for this branch within the file

@returns Array of symbol mappings extracted from the branch

Parse preprocessor blocks - public wrapper

@param params Mapping with "code" key

@returns Mapping with "result" containing "blocks" array

@throws On parsing errors (caller catches)

Parse multiple Pike source files in a single request

@param params Mapping with "files" array (each with "code" and "filename")

@returns Mapping with "result" containing "results" array and "count"

@throws On batch processing errors (caller catches)

Parse autodoc documentation string into structured format

Extracts @param, @returns, @throws, @note, @seealso, @deprecated tags

@param doc Raw autodoc string (with //! prefixes stripped)

@returns Mapping with text, params, returns, throws, notes, seealso, deprecated

@deprecated Use TypeAnalysis.parse_autodoc() instead. This function delegates to

TypeAnalysis which provides superior parsing with inline markup,

structured types, and native Pike parser integration.

Parse a class or enum body and return child symbols

@param parser The PikeParser positioned after the opening \{

@param autodoc_by_line Mapping of line-&gt;autodoc documentation

@param filename Source filename for position tracking

@param max_depth Maximum recursion depth (default 5)

@param current_depth Current depth (default 0)

@returns Array of child symbol mappings

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `MAX_TOP_LEVEL_ITERATIONS` | constant | 11 |
| `MAX_BLOCK_ITERATIONS` | constant | 12 |
| `create` | function | 14 |
| `parse_request` | function | 22 |
| `array` | function | 306 |
| `tokenize_request` | function | 591 |
| `compile_request` | function | 677 |
| `capture_error` | function | 684 |
| `foo` | function | 924 |
| `parse_preprocessor_blocks_request` | function | 988 |
| `batch_parse_request` | function | 1003 |
| `get_symbol_kind` | function | 1063 |
| `simple_parse_autodoc` | function | 1092 |
| `symbol_to_json` | function | 1252 |
| `type_to_json` | function | 1337 |

