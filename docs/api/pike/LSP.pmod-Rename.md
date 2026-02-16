---
id: pike-LSP-pmod-Rename
title: LSP-pmod-Rename
description: API documentation for LSP.pmod/Rename.pike
---

# LSP.pmod/Rename.pike

## Overview

Rename.pike - Smart rename handler for Pike LSP

Issue #194: Smart rename that handles Pike module structure.

Provides functionality to:

- Find all occurrences of a symbol across files

- Handle module path aware renaming (e.g., Module.Symbol)

- Support cross-file rename through inherit/import statements

This handler works with the existing find_occurrences functionality

to provide accurate position information for rename operations.

Find all rename positions for a symbol in Pike code

@param code Pike source code

@param filename Optional filename for error reporting

@param symbolName The symbol to find

@param line The line number where the symbol is referenced (1-based)

@param character Optional character position for more precise matching (0-based)

@returns Mapping with "edits" array containing position information

Prepare rename - get the symbol range at the given position

@param code Pike source code

@param filename Optional filename

@param line Line number (1-based)

@param character Character position (0-based)

@returns Mapping with the symbol range or null if not renamable

Request handler for find_rename_positions

@param params Mapping with "code", "filename", "symbolName", "line", optional "character"

@returns Mapping with "result" containing "edits" array

Request handler for prepare_rename

@param params Mapping with "code", optional "filename", "line", "character"

@returns Mapping with "result" containing symbol range info

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `find_rename_positions` | function | 19 |
| `prepare_rename` | function | 112 |
| `find_rename_positions_request` | function | 164 |
| `prepare_rename_request` | function | 177 |

