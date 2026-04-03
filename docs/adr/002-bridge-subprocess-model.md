# ADR-002: Bridge Subprocess Model

## Status

Accepted

## Context

The Pike LSP needs to execute Pike code for parsing and introspection. We considered:

1. **In-process Pike integration** - Fast but complex linking
2. **Separate language server in Pike** - Native but harder to maintain
3. **Pike subprocess with IPC** - Clean separation, language-agnostic

## Decision

We chose **Pike subprocess with JSON-RPC IPC**:

- One `PikeBridge` instance manages one Pike subprocess
- Pike runs synchronous read-process-write loop:
  1. Read one JSON-RPC request from stdin
  2. Process (parse, introspect - all blocking)
  3. Write one response to stdout
  4. Loop

## Key Implications

### No Concurrent Calls Benefit

```
Sending concurrent analyze() calls to single PikeBridge =
  Requests queue in stdin, execute serially
  NO speedup from concurrency
```

### True Parallelism Requires Multiple Bridges

```
For N-way parallelism, need N PikeBridge instances
Each backed by independent Pike subprocess
See: packages/pike-bridge/src/test-utils/bridge-pool.ts
```

### Why This Model

- **Simplicity**: No threading complexity in Pike
- **Reliability**: Isolated crashes don't kill LSP server
- **Resource control**: Easy to limit Pike instances
- **Testability**: Easy to mock/substitute bridge

## Consequences

### Positive

- Clean separation of concerns
- Pike crashes don't bring down LSP server
- Easy to add fault injection testing
- Can scale by adding more bridge instances

### Negative

- IPC overhead (but acceptable for language server latency)
- Memory overhead per Pike subprocess
- Need careful resource management (BridgePool)

## Related

- `packages/pike-bridge/src/bridge.ts` - Implementation
- `packages/pike-bridge/src/test-utils/bridge-pool.ts` - Parallelism utility
- `docs/adr/001-monorepo-structure.md` - Package organization
