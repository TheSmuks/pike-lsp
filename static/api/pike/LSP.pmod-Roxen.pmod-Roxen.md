---
id: pike-LSP-pmod-Roxen-pmod-Roxen
title: LSP-pmod-Roxen-pmod-Roxen
description: API documentation for LSP.pmod/Roxen.pmod/Roxen.pike
---

# LSP.pmod/Roxen.pmod/Roxen.pike

## Overview

Roxen.pike - Roxen module analysis for LSP

Per ADR-001: Uses Parser.Pike.split() for all code parsing

Per ADR-002: Uses String.trim_all_whites() for whitespace handling

Build newline offset array for O(1) line/column lookup

@param code Source code

@returns Array of character offsets where each line starts

Convert byte offset to line/column position

@param offset Byte offset in code

@param offsets Newline offset array from build_newline_offsets()

@returns Mapping with "line" and "column" (1-indexed)

Find position of a token in the original code string

@param code Source code

@param token_str Token string to search for

@param start_offset Starting offset (default: 0)

@returns Mapping with "line" and "column", or 0 if not found

Detect module types (MODULE_*), inherits, and module name

Per ADR-001: Uses Parser.Pike.split() instead of Tools.AutoDoc.PikeParser

@param code Source code to parse

@param filename Filename for error reporting

@returns Array with: (\{module_types, inherits, module_name\})

Parse tag definitions (simpletag_*, container_*, and RXML.Tag classes)

Per ADR-001: Uses Parser.Pike.split() instead of Tools.AutoDoc.PikeParser

@param code Source code to parse

@param filename Filename for error reporting

@returns Array of tag mappings

Parse defvar() calls using Parser.Pike.split()

Per ADR-001: Uses Parser.Pike.split() instead of Tools.AutoDoc.PikeParser

@param code Source code to parse

@param filename Filename for error reporting

@returns Array of variable mappings from defvar calls

Check if a specific callback function is defined in the code

@param code The source code to search

@param func_name The function name to look for

@returns 1 if the function is found, 0 otherwise

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `MAX_PARSER_ITERATIONS` | constant | 5 |
| `ROXEN_MODULE_TYPES` | constant | 7 |
| `REQUIRED_CALLBACKS` | constant | 13 |
| `has_fast_path_markers` | function | 72 |
| `detect_module` | function | 81 |
| `parse_tags` | function | 304 |
| `parse_vars` | function | 479 |
| `if` | function | 577 |
| `while` | function | 660 |
| `get_callbacks` | function | 733 |
| `next_non_ws` | function | 761 |
| `validate_api` | function | 784 |
| `has_callback_function` | function | 832 |
| `next_non_ws` | function | 835 |
| `find_file` | function | 845 |
| `filter` | function | 845 |
| `has_simpletag_functions` | function | 872 |
| `has_find_file` | function | 876 |

