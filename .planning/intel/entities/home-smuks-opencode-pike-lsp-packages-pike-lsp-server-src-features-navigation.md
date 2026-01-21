---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/navigation.ts
type: feature
updated: 2026-01-20
status: active
---

# navigation.ts

## Purpose

Implements LSP navigation handlers (hover, definition, declaration, type definition, implementation, references, document highlights) for Pike code symbol exploration.

## Exports

- `registerNavigationHandlers(connection, services, documents)` - Registers all navigation handlers with LSP connection

## Dependencies

- [[core/logging]]
- [[services/index]]
- vscode-languageserver/node.js
- vscode-languageserver-textdocument

## Used By

TBD

## Notes

Each handler includes try/catch with logging fallback per SRV-12. Uses document cache and position-based symbol resolution.