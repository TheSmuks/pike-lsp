---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/core/errors.ts
type: util
updated: 2026-01-20
status: active
---

# errors.ts

## Purpose

Defines a layered error class hierarchy for tracking errors across the LSP stack (server, bridge, and Pike layers) with error chaining support.

## Exports

- `ErrorLayer` - Type union for the three valid error layers: 'server' | 'bridge' | 'pike'
- `LSPError` - Base error class with layer tracking, error chaining via `cause`, and readable error chain output
- `BridgeError` - Pre-configured LSPError for bridge layer communication failures
- `PikeError` - Pre-configured LSPError for Pike subprocess errors

## Dependencies

None

## Used By

TBD

## Notes

Uses native `Error.cause` property (Node.js 16.9.0+) for error chaining. The `chain` getter returns a readable error path like "hover request failed -> bridge timeout -> pike subprocess not responding".