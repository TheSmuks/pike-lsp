# Fault Injection Patterns

This document defines deterministic fault patterns for Pike LSP scenario tests.

## Fault configuration surface

`FaultInjectionConfig` supports:

- `restartAtIteration`: toggles bridge running state on a specific call number.
- `crashAtOperation`: throws an injected error for a named operation.
- `delayMs`: adds deterministic delay in a min/max range.
- `failWithError`: custom error used with crash faults.
- `hangDurationMs`: forces operation latency before completion.
- `probability`: deterministic 0-1 gate per operation/call index.
- `triggerAfterMs`: delay before applying the fault behavior.

## Recovery expectations by fault type

### Bridge restart during validation

- Fault: `restartAtIteration` on diagnostics request path.
- Expected recovery: validation path remains stable, bridge returns to running state.
- Expected state safety: document cache remains valid and process does not crash.

### Bridge crash during analysis

- Fault: `crashAtOperation: 'engineQuery'` with an injected error.
- Expected recovery: failure is handled through normal diagnostics error path.
- Expected state safety: stale or seeded cache entries are not overwritten by partial data.

### Request timeout and retry

- Fault: `hangDurationMs` on keyed requests to simulate timeout pressure.
- Expected recovery: keyed supersede cancels old work in scheduler bookkeeping.
- Expected state safety: retry request completes and produces the authoritative result.

## Determinism rules

- Tests must set explicit fault config values.
- Tests should avoid random timing and random fault selection.
- Probability gating is deterministic and based on operation/call hash.
- Assertions must cover both control flow and cache/result integrity.
