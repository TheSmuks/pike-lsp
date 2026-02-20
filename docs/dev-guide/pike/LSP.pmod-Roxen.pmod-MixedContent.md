---
id: pike-LSP.pmod-Roxen.pmod-MixedContent
title: LSP.pmod/Roxen.pmod/MixedContent.pike
description: Development guide for LSP.pmod/Roxen.pmod/MixedContent.pike
---

# LSP.pmod/Roxen.pmod/MixedContent.pike

## Overview

Mixed Content.pike - RXML string detection in Pike multiline strings

Per ADR-001: Uses Parser.Pike.split() for all code parsing

Per ADR-002: Uses String.trim_all_whites() for whitespace handling

This module extracts RXML content from Pike multiline string literals

(#"..." and #'...') for Phase 4 of Roxen Framework Support

Build newline offset array for O(1) line/column lookup

@param code Source code

@returns Array of character offsets where each line starts

Convert byte offset to line/column position (1-indexed)

@param offset Byte offset in code

@param offsets Newline offset array from build_newline_offsets()

@returns Mapping with "line" and "column" (1-indexed)

Find position of a token in the original code string

@param code Source code

@param token_str Token string to search for

@param start_offset Starting offset (default: 0)

@returns Mapping with "line" and "column", or 0 if not found

Calculate confidence score for RXML content (0.0 to 1.0)

@param content String content to analyze

@returns Confidence score

Known RXML tags for marker detection

Detect RXML markers in content

@param content RXML string content

@param content_offsets Newline offsets for the content

@returns Array of marker mappings

Detect multiline string literals using Parser.Pike.split()

@param code Pike source code

@returns Array of detected RXML string mappings

Find the offset of a token in the original source code

This is a simplified version that searches for the token string

@param code Full source code

@param token_str Token string to find

@param token_index Index in token array (for disambiguation)

@returns Character offset of the token

Extract RXML strings from Pike multiline string literals

@param params JSON-RPC parameters with "code" and "filename"

@returns JSON-RPC response with "result" containing "strings" array

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `KNOWN_RXML_TAGS` | constant | 104 |
| `calculate_rxml_confidence` | function | 72 |
| `find_token_offset_for_token` | function | 302 |
| `roxen_extract_rxml_strings` | function | 335 |

