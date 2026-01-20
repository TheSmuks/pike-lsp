---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts
type: service
updated: 2025-01-20
status: active
---

# bridge.ts

## Purpose

Manages the Pike subprocess lifecycle and provides JSON-RPC communication interface for parsing, tokenization, and symbol extraction. This is the critical IPC bridge that allows TypeScript to call Pike's native compiler utilities.

## Exports

- `PikeBridge` - Main class managing Pike subprocess communication via JSON-RPC over stdin/stdout
- `PikeBridgeOptions` - Configuration interface for Pike executable path, analyzer script location, timeout, and debug mode
- `BridgeHealthCheck` - Health check result interface with Pike availability, version, and analyzer path status

## Dependencies

- child_process - Spawns and manages Pike subprocess
- events - EventEmitter for subprocess lifecycle events
- readline - Line-by-line JSON-RPC response parsing from stdout
- [[packages-pike-bridge-src-types]] - Type definitions for Pike protocol
- [[packages-pike-bridge-src-constants]] - Default timeout and batch size constants

## Used By

TBD
