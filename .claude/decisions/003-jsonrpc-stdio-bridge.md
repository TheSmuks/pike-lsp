# ADR-003: JSON-RPC Over stdin/stdout for Pike Bridge

**Status:** active
**Area:** ipc
**Date:** 2025-12-01

## Context

The TypeScript LSP server needs to communicate with the Pike analyzer subprocess. Need a reliable IPC mechanism.

## Decision

Use JSON-RPC 2.0 protocol over stdin/stdout pipes. The Pike subprocess (`analyzer.pike`) reads JSON-RPC requests from stdin and writes responses to stdout. Stderr is reserved for debug logging (`werror()`).

## Alternatives Rejected

- **TCP sockets** - Extra port management, firewall issues, more complex lifecycle
- **Unix domain sockets** - Platform-specific, not available on Windows
- **FFI/native binding** - No stable Pike FFI for Node.js. Maintenance burden too high.
- **File-based IPC** - Slow, requires polling, race conditions

## Consequences

- Clean process isolation (Pike crash doesn't crash VSCode)
- Simple debugging (pipe JSON to/from Pike directly)
- Stderr available for logging without protocol interference
- Latency of subprocess spawn + JSON serialization per request

## Challenge Conditions

Revisit if:
- Round-trip latency exceeds 50ms for common operations
- Need bidirectional streaming (Pike pushing events to TS)
- Pike FFI for Node.js becomes stable
