---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/utils/regex-patterns.ts
type: util
updated: 2025-01-20
status: active
---

# regex-patterns.ts

## Purpose

Centralizes regex patterns for Pike LSP server (MAINT-003). Ensures consistency across codebase for comment detection, identifier matching, indentation analysis, and file path parsing.

## Exports

- `COMMENT_PATTERNS` - Single-line, multi-line, and AutoDoc comment patterns
- `INDENT_PATTERNS` - Leading whitespace and brace counting patterns
- `IDENTIFIER_PATTERNS` - Member access, scoped access, and bare identifier matching
- `PATH_PATTERNS` - Pike file path with optional line number extraction
- `PatternHelpers` - Helper functions for pattern creation and line classification

## Dependencies

None

## Used By

TBD

## Notes

MAINT-003: Centralized patterns avoid duplication and bugs from inconsistent regex across files.
