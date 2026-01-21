---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/symbols.ts
type: module
updated: 2026-01-20
status: active
---

# symbols.ts

## Purpose

Registers LSP handlers for document symbols (outline view) and workspace symbols (search across project). Converts Pike symbols to LSP SymbolKind format.

## Exports

- `registerSymbolsHandlers(connection, services): void` - Registers textDocument/documentSymbol and workspace/symbol handlers

## Dependencies

- [[../core/logging.js]]
- [[../constants/index.js]]
- [[../services/index.js]]
- vscode-languageserver/node.js
- @pike-lsp/pike-bridge

## Used By

TBD

## Notes

Maps Pike symbol kinds (class, method, variable, constant, typedef, enum, inherit, import, module) to LSP SymbolKind enum values. Returns single-line ranges for all symbols.