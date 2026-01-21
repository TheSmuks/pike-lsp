---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/editing.ts
type: module
updated: 2026-01-20
status: active
---

# editing.ts

## Purpose

Implements LSP code editing feature handlers for completion, signature help, and rename operations in Pike source files.

## Exports

- `registerEditingHandlers` - Registers completion, signature help, prepare rename, and rename handlers with the LSP connection

## Dependencies

- [[services/index]]
- [[services/document-cache]]
- [[utils/regex-patterns]]
- vscode-languageserver/node.js
- vscode-languageserver-textdocument
- @pike-lsp/pike-bridge

## Used By

TBD

## Notes

Handles scoped access (`::`) for Pike-specific context like `this::` and `this_program::`, filters completions based on type/expression context, and sorts results by relevance (locals → scope members → stdlib → workspace).