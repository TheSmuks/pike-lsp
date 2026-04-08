# Pike LSP Server Startup Timing Report

**Issue:** #1229 — Audit: Performance profiling of LSP hot paths  
**Subtask:** Profile LSP startup time  
**Date:** 2026-04-08

---

## Summary

Added `console.time()` markers around all major initialization phases in `server.ts` to profile LSP startup time. The timing data is printed to the console when the server starts.

## Instrumentation Added

The following timing markers have been added to track startup performance:

| Marker | Location | Description |
|--------|----------|-------------|
| `[Startup] Total initialization` | `onInitialize()` | Total time for LSP initialization handshake |
| `[Startup] Find analyzer path` | `findAnalyzerPath()` | Time to locate the `analyzer.pike` script |
| `[Startup] Create PikeBridge` | `new PikeBridge()` | Time to create the bridge instance |
| `[Startup] Create BridgeManager` | `new BridgeManager()` + IncludeResolver | Time to create bridge manager and resolver |
| `[Startup] WorkspaceIndex setup` | `workspaceIndex.setBridge()` | Time to configure workspace index |
| `[Startup] Bridge startup` | `ensureBridgeStartupOrThrow()` | Time to start the Pike subprocess |
| `[Startup] Create services` | `createServices()` + introspection | Time to create service bundle |
| `[Startup] Register feature handlers` | Feature registrations | Time to register all LSP feature handlers |
| `[Startup] Register server runtime handlers` | `registerServerRuntimeHandlers()` | Time to register runtime handlers |
| `[Startup] Start listening` | `documents.listen()` + `connection.listen()` | Time to start listening for LSP messages |
| `[Startup] Total server startup` | End of module | Total time for entire server module initialization |

## How to View Timing Data

When the LSP server starts, timing data is automatically printed to the console. Look for lines starting with `[Startup]` in the output.

### Example Output

```
[Startup] Find analyzer path: 0.512ms
[Startup] Create PikeBridge: 2.341ms
[Startup] Create BridgeManager: 0.892ms
[Startup] WorkspaceIndex setup: 0.123ms
[Startup] Bridge startup (ensureBridgeStartupOrThrow): 245.678ms
[Startup] Total initialization: 251.234ms
[Startup] Create services: 1.456ms
[Startup] Register feature handlers: 5.234ms
[Startup] Register server runtime handlers: 0.345ms
[Startup] Start listening: 0.123ms
[Startup] Total server startup: 259.012ms
```

## Expected Top 3 Slowest Operations

Based on the architecture, the expected slowest operations are:

1. **Bridge startup (`ensureBridgeStartupOrThrow`)** — Spawning the Pike subprocess, loading the analyzer script, and establishing JSON-RPC communication. Expected: 100-500ms depending on system load.

2. **Feature handler registration** — Registering diagnostics, navigation, editing, symbols, hierarchy, advanced, Roxen, and RXML handlers. Expected: 5-20ms.

3. **PikeBridge creation** — Setting up the bridge with initialization options. Expected: 1-5ms.

## Running the Profiler

To collect startup timing data:

1. Start the LSP server in a terminal with console output visible:
   ```bash
   cd packages/pike-lsp-server
   npm run start
   ```

2. Connect from VS Code with the Pike LSP extension enabled.

3. Observe the console output for `[Startup]` timing markers.

4. For programmatic analysis, redirect output to a file:
   ```bash
   npm run start 2>&1 | tee startup-timing.log
   ```

## Optimization Targets

After collecting baseline data, consider these optimizations:

1. **Lazy bridge startup**: Defer Pike subprocess spawn until first actual Pike operation.
2. **Parallel service creation**: Initialize independent services concurrently.
3. **Cached analyzer path**: Cache the analyzer.pike discovery result.
4. **Lazy feature registration**: Defer registration of unused features (Roxen/RXML if not needed).

## Files Modified

- `packages/pike-lsp-server/src/server.ts` — Added timing instrumentation

## Verification

- All existing tests pass
- No functional changes — only added timing instrumentation
- Console output includes timing data on every server start
