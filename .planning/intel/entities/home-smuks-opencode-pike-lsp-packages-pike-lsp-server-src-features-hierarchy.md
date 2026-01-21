---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/hierarchy.ts
type: module
updated: 2026-01-20
status: active
---

# hierarchy.ts

## Purpose

Implements LSP hierarchy handlers for call and type hierarchy queries, enabling navigation of method call relationships and type inheritance hierarchies in Pike code.

## Exports

- `registerHierarchyHandlers` - Registers callHierarchy and typeHierarchy LSP handlers with the connection

## Dependencies

- [[logging.js]]
- [[regex-patterns.js]]
- [[document-cache.md]]
- [[index.md]] (services)
- vscode-languageserver/node.js
- vscode-languageserver-textdocument
- fs

## Used By

[[index.md]]

## Notes

Each handler includes try/catch with logging fallback (SRV-12). Call hierarchy requires method symbols with position metadata. Type hierarchy is currently a stub returning empty results.