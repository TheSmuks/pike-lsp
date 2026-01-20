---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/core/index.ts
type: module
updated: 2026-01-20
status: active
---

# index.ts

## Purpose

Barrel export file for the core utilities module, aggregating error classes and logging infrastructure used throughout the LSP server implementation.

## Exports

- `LSPError` - Base error class for LSP-layer errors with layer tracking
- `BridgeError` - Error class for Pike bridge communication failures
- `PikeError` - Error class for Pike subprocess-level errors
- `Logger` - Logging utility with level-based filtering
- `LogLevel` - Enum defining log severity levels (DEBUG, INFO, WARN, ERROR)

## Dependencies

[[core/errors]], [[core/logging]]

## Used By

TBD

## Notes

This is a re-export module only—no original implementations. Provides a single import point for all core utilities.