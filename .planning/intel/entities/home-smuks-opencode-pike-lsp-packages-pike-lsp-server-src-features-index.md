---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/index.ts
type: module
updated: 2026-01-20
status: active
---

# index.ts

## Purpose

Central barrel file that re-exports all feature registration functions for convenient importing. Organizes LSP capabilities into cohesive feature modules.

## Exports

- `registerSymbolsHandlers` - Registers document and workspace symbol providers
- `registerDiagnosticsHandlers` - Registers validation and document lifecycle handlers
- `registerNavigationHandlers` - Registers go-to-definition, references, and other navigation features
- `registerEditingHandlers` - Registers completion, signature help, and rename capabilities
- `registerHierarchyHandlers` - Registers call and type hierarchy features
- `registerAdvancedHandlers` - Registers formatting, semantic tokens, and advanced features
- `Services` (type) - Re-exported services interface type

## Dependencies

- [[symbols]]
- [[diagnostics]]
- [[navigation]]
- [[editing]]
- [[hierarchy]]
- [[advanced]]
- [[../services/index]]

## Used By

TBD