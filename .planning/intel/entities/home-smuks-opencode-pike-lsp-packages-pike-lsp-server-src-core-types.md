---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/core/types.ts
type: model
updated: 2026-01-20
status: active
---

# types.ts

## Purpose

Centralized type definitions for the Pike LSP server, providing shared interfaces and constants used across the server implementation.

## Exports

- `PikeSettings` - LSP server configuration interface (pike path, max problems, diagnostic delay)
- `DocumentCacheEntry` - Cached document info with symbols, diagnostics, and position index
- `defaultSettings` - Default Pike settings constant

## Dependencies

- [[constants]] - DEFAULT_MAX_PROBLEMS, DIAGNOSTIC_DELAY_DEFAULT
- vscode-languageserver - Diagnostic, Position types
- @pike-lsp/pike-bridge - PikeSymbol type

## Used By

TBD

## Notes

The `symbolPositions` Map in `DocumentCacheEntry` enables O(1) lookups for finding all positions where a symbol is referenced within a document.