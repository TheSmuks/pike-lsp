---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced.ts
type: module
updated: 2026-01-20
status: active
---

# advanced.ts

## Purpose

Registers advanced LSP feature handlers for code folding, semantic tokens, inlay hints, selection ranges, code actions, document formatting, document links, and code lens.

## Exports

- `registerAdvancedHandlers()` - Registers all advanced feature handlers with the LSP connection

## Dependencies

- [[regex-patterns]]
- [[code-lens]]
- [[logging]]
- [[types]]
- [[services/index]]
- vscode-languageserver/node.js
- vscode-languageserver-textdocument

## Used By

TBD

## Notes

Each handler includes try/catch with logging fallback per SRV-12. Semantic tokens legend is duplicated here with a TODO to refactor.