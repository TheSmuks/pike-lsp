---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/index.ts
type: module
updated: 2026-01-20
status: active
---

# index.ts

## Purpose

Public API entry point for the Pike Bridge package. Re-exports all submodules and provides a clean interface for TypeScript consumers to communicate with Pike subprocesses.

## Exports

- **PikeError** - Error type for Pike subprocess failures
- **LSPError** - Error type for LSP protocol errors
- **Logger** - Logging utility for debug/trace output
- **LogLevel** - Enum for log severity levels
- **ErrorLayer** - Type for error layer classification
- All exports from `./types.js`, `./bridge.js`, `./constants.js`, and `./process.js`

## Dependencies

[[types]], [[bridge]], [[constants]], [[process]], [[errors]], [[logging]]

## Used By

TBD

## Notes

None