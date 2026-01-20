---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/constants.ts
type: config
updated: 2025-01-20
status: active
---

# constants.ts

## Purpose

Centralizes configuration values for the Pike Bridge (MAINT-004 pattern). Provides default timeout and batch size limits that balance IPC performance with memory constraints.

## Exports

- `BRIDGE_TIMEOUT_DEFAULT` - Default request timeout of 30000ms (30 seconds)
- `BATCH_PARSE_MAX_SIZE` - Maximum 50 files per batch parse request to prevent memory issues

## Dependencies

None

## Used By

TBD

## Notes

These constants are referenced in bridge.ts for request timeout and batch splitting logic.
