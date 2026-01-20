---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/workspace-index.ts
type: service
updated: 2025-01-20
status: active
---

# workspace-index.ts

## Purpose

Maintains a workspace-wide symbol index enabling fast Ctrl+T symbol search across all Pike files. Uses nested Map structure for O(1) symbol lookup and removal. Supports batch parsing (PERF-002) for efficient directory indexing.

## Exports

- `WorkspaceIndex` - Main class managing workspace symbol index
- `IndexedDocument` - Interface for cached document with symbols and metadata
- `SymbolEntry` - Quick lookup entry for symbol search
- `IndexErrorCallback` - Error reporting callback type

## Dependencies

- [[packages-pike-bridge-src-types]] - PikeSymbol type
- [[packages-pike-bridge-src-bridge]] - PikeBridge for parsing
- [[packages-pike-lsp-server-src-constants-index]] - LSP.MAX_WORKSPACE_SYMBOLS constant
- vscode-languageserver - SymbolInformation and SymbolKind types
- fs - File system reading for directory indexing
- path - Path manipulation

## Used By

TBD

## Notes

Flattens nested symbol trees so all class members are indexed at workspace level. Uses negative cache pattern for files that don't exist.
