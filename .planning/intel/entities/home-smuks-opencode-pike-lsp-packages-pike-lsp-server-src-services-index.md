---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/index.ts
type: service
updated: 2026-01-20
status: active
---

# index.ts

## Purpose

Services bundle that provides a unified interface for feature handlers to access all server dependencies. Centralizes dependency injection for the LSP server.

## Exports

- `Services` - Interface bundling all service dependencies (bridge, logger, documentCache, typeDatabase, workspaceIndex, stdlibIndex)
- `DocumentCache` - Re-exported from document-cache service
- `BridgeManager` - Re-exported from bridge-manager service
- `HealthStatus` - Type re-exported from bridge-manager

## Dependencies

[[document-cache]], [[bridge-manager]], [[logging]], [[type-database]], [[workspace-index]], [[stdlib-index]]

## Used By

TBD

## Notes

Feature handlers receive the Services interface rather than individual dependencies, decoupling handlers from service initialization details.