---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/bridge-manager.ts
type: service
updated: 2026-01-20
status: active
---

# bridge-manager.ts

## Purpose

Wraps PikeBridge with lifecycle management and health monitoring, providing a single interface for feature handlers to interact with the Pike subprocess.

## Exports

- **BridgeManager** - Wrapper class around PikeBridge that tracks uptime, logs errors, and provides pass-through methods for bridge operations
- **HealthStatus** - Interface describing bridge/server health state (uptime, connection status, PID, version, recent errors)

## Dependencies

- @pike-lsp/pike-bridge (PikeBridge type)
- [[core/logging]] (Logger type)

## Used By

TBD

## Notes

- Maintains a rolling buffer of the last 5 error messages from stderr
- Health status includes TODO for Pike version detection via introspection
- All PikeBridge methods are proxied with null-checks for safety