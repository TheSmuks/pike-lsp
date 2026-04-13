---
id: KB-ARCH-BRIDGE-MODEL
domain: ARCHITECTURE
date: 2026-04-13
authors: [dga-coder]
summary: Pike subprocess IPC architecture and bridge API
---

# Bridge Model: Subprocess IPC

pike-bridge mediates between the LSP server (Node.js) and the Pike analyzer
subprocess via JSON-RPC over stdin/stdout, line-delimited.

## Two-Layer Design

**PikeProcess** (`process.ts`) — low-level IPC:
- Spawns `pike analyzer.pike` with piped stdio
- `readline` on stdout emits one `message` event per JSON line
- `send(json)` writes to stdin with trailing newline
- `kill()` / `forceKill()` — SIGTERM / SIGKILL
- Emits: `message`, `stderr`, `exit`, `error`
- No request correlation or timeouts

**PikeBridge** (`bridge.ts`) — business logic:
- Owns PikeProcess, correlates requests via auto-incrementing `requestId`
- Per-request timeouts (default 30s), deduplicates in-flight requests
- Auto-restart on unexpected exit (max 3 attempts)
- Optional `RateLimiter` (default: 100 req / 10s window)

## JSON-RPC Protocol

Request (`PikeRequest`): `{ id, method, params }`
Response (`PikeResponse`): `{ id, result?, error?: { code, message }, _perf? }`

Methods: `parse`, `tokenize`, `compile`, `analyze`, `resolve`,
`introspect`, `get_version`, `resolve_module`, `resolve_include`,
`resolve_stdlib`, `get_pike_paths`, `get_inherited`, `extract_imports`,
`resolve_import`, `check_circular`, `get_waterfall_symbols`,
`find_occurrences`, `find_rename_positions`, `prepare_rename`,
`analyze_uninitialized`, `set_debug`, `query_engine_*`.

## Lifecycle

1. `start()` spawns, waits `PROCESS_STARTUP_DELAY` (100ms)
2. Ready — emits `started`
3. `sendRequest()` auto-starts if process died
4. `stop()` — SIGTERM, wait `GRACEFUL_SHUTDOWN_DELAY` (100ms), then SIGKILL

## Constants (`constants.ts`)

`BRIDGE_TIMEOUT_DEFAULT` (30000ms), `BATCH_PARSE_MAX_SIZE` (50 files),
`PROCESS_STARTUP_DELAY` (100ms), `GRACEFUL_SHUTDOWN_DELAY` (100ms).

## Types (`types.ts`)

**PikeSymbol** — `name`, `kind`, `modifiers`, `position?`, `type?`,
`children?`, `inherited?`, `documentation?`, `conditional?`.

Subtypes (discriminated on `kind`):
- `PikeClass` — `children`, `inherits`
- `PikeMethod` — `argNames`, `argTypes`, `returnType`
- `PikeVariable`, `PikeConstant`, `PikeTypedef` — `type?: PikeType`

Kinds: `class | method | variable | constant | typedef | enum |
enum_constant | inherit | import | include | module`

**PikeType** — discriminated union: `int | float | string | array |
mapping | multiset | function | object | program | mixed | void | zero |
type | unknown | or | and | attribute | name`
