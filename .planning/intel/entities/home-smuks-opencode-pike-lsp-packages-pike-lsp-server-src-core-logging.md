---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/core/logging.ts
type: util
updated: 2026-01-20
status: active
---

# logging.ts

## Purpose

Simple logging utility with component-based namespacing and global log level filtering, designed for Lean Observability in LSP servers.

## Exports

- `LogLevel` - Enum defining log levels (OFF, ERROR, WARN, INFO, DEBUG, TRACE)
- `Logger` - Logger class with component namespacing and global level filtering

## Dependencies

None

## Used By

TBD

## Notes

All output goes to stderr (console.error) where LSP servers emit diagnostic output. Default level is WARN for production safety. No transports, formatters, or log rotation—minimal by design.