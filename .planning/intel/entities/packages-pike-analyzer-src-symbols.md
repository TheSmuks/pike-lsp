---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-analyzer/src/symbols.ts
type: util
updated: 2025-01-20
status: active
---

# symbols.ts

## Purpose

Provides symbol table data structure for managing Pike symbols with dual indexing by name and position. Enables fast symbol lookup during LSP operations like hover and go-to-definition.

## Exports

- `SymbolTable` - Class maintaining symbol lookup maps by name and position

## Dependencies

- [[packages-pike-bridge-src-types]] - PikeSymbol and PikePosition types

## Used By

TBD

## Notes

Simple utility with position-based key format "file:line:column" for O(1) position lookups.
