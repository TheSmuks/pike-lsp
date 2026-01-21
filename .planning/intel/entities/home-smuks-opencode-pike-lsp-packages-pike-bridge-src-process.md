---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/process.ts
type: service
updated: 2026-01-20
status: active
---

# process.ts

## Purpose

Low-level subprocess IPC wrapper that manages the Pike interpreter using JSON-RPC over stdin/stdout. Handles only process lifecycle mechanics (spawn, readline, events) while delegating business logic to PikeBridge.

## Exports

- **PikeProcess** - EventEmitter wrapper for Pike subprocess with spawn/kill and line-based stdout handling
- **PikeProcessEvents** - TypeScript interface for process events (message, stderr, exit, error)

## Dependencies

- child_process (Node.js stdlib)
- events (Node.js stdlib)
- readline (Node.js stdlib)

## Used By

TBD

## Notes

Line-by-line readline interface is critical to prevent JSON fragmentation bugs. Does NOT handle request correlation or timeouts—those are PikeBridge responsibilities.