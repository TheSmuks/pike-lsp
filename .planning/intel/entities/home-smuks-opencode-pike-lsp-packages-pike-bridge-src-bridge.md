---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts
type: service
updated: 2026-01-20
status: active
---

# bridge.ts

## Purpose

Communication layer managing Pike subprocess lifecycle and providing JSON-RPC interface for parsing, tokenization, and symbol extraction using Pike's native utilities.

## Exports

- **PikeBridge** - Main bridge class for Pike subprocess communication via JSON-RPC over stdin/stdout
- **PikeBridgeOptions** - Configuration interface for Pike executable path, timeout, debug logging, and environment variables
- **BridgeHealthCheck** - Health check result interface with Pike availability, version, and analyzer script status

## Dependencies

- [[process]] - PikeProcess for subprocess management
- [[constants]] - BRIDGE_TIMEOUT_DEFAULT, BATCH_PARSE_MAX_SIZE
- [[logging]] - Logger for debug output
- [[errors]] - PikeError for error handling
- child_process (spawn)
- events (EventEmitter)
- path
- url (fileURLToPath)

## Used By

TBD

## Notes

Uses request/response pattern with timeout tracking and pending request management. Emits events for process lifecycle changes. Auto-detects analyzer.pike path relative to module location.