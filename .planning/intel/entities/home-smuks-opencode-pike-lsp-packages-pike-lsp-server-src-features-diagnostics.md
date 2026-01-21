---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/diagnostics.ts
type: feature
updated: 2026-01-21
status: active
---

# diagnostics.ts

## Purpose

Provides document validation, diagnostics, and configuration handling for the Pike LSP server. Extracted from server.ts for modular feature organization.

## Exports

- `registerDiagnosticsHandlers` - Registers diagnostics handlers with the LSP connection, including validation, configuration changes, and document diagnostics

## Dependencies

[[../utils/regex-patterns.js]], [[../type-database.js]], [[../core/logging.js]], [[../constants/index.js]], [[../services/index.js]], [[../core/types.js]], vscode-languageserver/node.js, vscode-languageserver-textdocument, @pike-lsp/pike-bridge

## Used By

TBD

## Notes

- Validates Pike documents with debouncing to avoid excessive re-validation
- Converts Pike diagnostics to LSP diagnostic format with severity mapping
- Handles configuration changes for Pike settings (pikePath, maxNumberOfProblems, diagnosticDelay)
- Accesses services.bridge dynamically due to late initialization in onInitialize