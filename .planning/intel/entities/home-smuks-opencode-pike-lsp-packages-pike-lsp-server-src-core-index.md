---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/core/index.ts
type: module
updated: 2026-01-20
status: active
---

# index.ts

## Purpose

Central export module for the pike-lsp-server core layer, providing error handling utilities, logging infrastructure, and shared types.

## Exports

- **LSPError** - LSP protocol layer error class
- **BridgeError** - Pike bridge communication error class
- **PikeError** - Pike subprocess error class
- **ErrorLayer** - Type discriminating error layers (lsp | bridge | pike)
- **Logger** - Logging utility class
- **LogLevel** - Log level enum (debug | info | warn | error)
- **PikeSettings** - Configuration settings type
- **DocumentCacheEntry** - Cached document metadata type
- **defaultSettings** - Default PikeSettings instance

## Dependencies

[[./errors]], [[./logging]], [[./types]]

## Used By

TBD

## Notes

Barrel export pattern consolidating core infrastructure exports for clean imports from other modules.