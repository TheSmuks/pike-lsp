---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts
type: service
updated: 2026-01-20
status: active
---

# server.ts

## Purpose

Main LSP server entry point that initializes the Language Server connection, manages services (bridge, document cache, type database), and wires up all feature handlers for Pike language support.

## Exports

None (wiring-only module that initializes and runs the LSP server)

## Dependencies

- [[workspace-index.js]]
- [[type-database.js]]
- [[stdlib-index.js]]
- [[regex-patterns.js]]
- [[bridge-manager.js]]
- [[document-cache.js]]
- [[logging.js]]
- [[types.js]]
- [[features/index.js]]
- @pike-lsp/pike-bridge
- vscode-languageserver/node.js
- vscode-languageserver-textdocument

## Used By

TBD

## Notes

This is a wiring-only file—all handler logic is delegated to feature modules in `features/`. The server manages validation timers with debouncing, finds the analyzer.pike script location, and handles LSP lifecycle (initialize, initialized, shutdown). Global settings and include paths are tracked here and propagated to services.