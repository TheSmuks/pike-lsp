# Benchmarking Pike LSP Performance

This document describes the benchmarking infrastructure for the Pike LSP project. We use these benchmarks to establish baselines and measure the impact of performance optimizations in Milestone v3.0.

## Infrastructure Overview

- **Mitata**: A high-performance benchmarking library for Node.js.
- **Pike Internal Timing**: High-resolution timing using `System.Timer()` inside the Pike subprocess, reported via `_perf` metadata in JSON-RPC responses.
- **Runner**: Located at `packages/pike-lsp-server/benchmarks/runner.ts`.

## Running Benchmarks

### Local Execution

To run the full suite locally:

```bash
cd packages/pike-lsp-server
pnpm benchmark
```

This will run:
1. **LSP Server Foundations**: Subprocess cold start times.
2. **Validation Pipeline (Warm)**: Combined cost of `introspect`, `parse`, and `analyze_uninitialized` on various file sizes.
3. **Intelligence Operations (Warm)**: Hover and Completion latency.

### CI Integration

Benchmarks run automatically on every push to `main` and on pull requests via the **Performance Benchmarks** workflow (`.github/workflows/bench.yml`).

- **Regression Detection**: The build will fail if performance regresses by more than **20%** compared to the baseline on `main`.
- **Trend Tracking**: Results are archived and visualized using the [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark) action.

## Interpreting Results

The benchmark output provides two critical metrics:

1. **Avg (End-to-End)**: The total time from the Node.js request until the response is received. This includes Node.js processing, IPC overhead, and Pike execution.
2. **Pike Internal Latency**: The actual time spent executing logic inside the Pike subprocess (extracted from `_perf`).

### Performance Targets (v3.0)

| Metric | Current (Baseline) | Target | Status |
|--------|-------------------|--------|--------|
| Cold Start (TypeScript) | ~203ms | < 500ms | ACHIEVED |
| Cold Start (Pike subprocess) | ~0.05ms | < 500ms | ACHIEVED |
| First Request (with Context creation) | ~82ms | < 500ms | ACHIEVED |
| Large File Validation (E2E) | ~18ms | < 10ms | In Progress |
| Hover Latency | ~0.3ms | < 0.1ms | In Progress |

### Startup Optimization Results (Phase 11 - 2026-01-22)

The <500ms startup goal has been achieved through three optimizations:

| Optimization | Impact |
|--------------|--------|
| Lazy Context creation | Pike startup: 18.9ms -> 0.05ms (99.7% reduction) |
| __REAL_VERSION__ builtin | Version phase: 0.515ms -> 0.074ms (7x faster) |
| Async version fetch | Perceived startup: 100-200ms saved |

**Startup breakdown (post-optimization):**
- `path_setup`: 0.041 ms
- `version`: 0.051 ms
- `handlers`: 0.053 ms
- `total` (Pike ready): 0.053 ms
- `context_lazy` (first request): ~19 ms
- `total_with_first_request`: ~82 ms

**Note:** The TypeScript bridge cold start (~203ms) is dominated by subprocess spawn overhead. This is expected and acceptable for the v3.0 goals. The Pike subprocess itself starts in <0.1ms and is ready to handle requests immediately.

## Adding New Benchmarks

1. **Add a Fixture**: Place new `.pike` files in `packages/pike-lsp-server/benchmarks/fixtures/`.
2. **Update Runner**: Add a new `bench()` call to `packages/pike-lsp-server/benchmarks/runner.ts`.
3. **Track Pike Time**: Use the `trackPikeTime(name, result)` helper to include internal timing in the summary.

```typescript
bench('My Operation', async () => {
  const result = await bridge.myOperation(code);
  trackPikeTime('My Operation', result);
});
```

## Phase 17: Responsiveness Tuning Results

**Completed:** 2026-01-23

### Summary

Phase 17 completed the v3.0 performance optimization series by tuning the diagnostic debounce delay from 500ms to 250ms and adding responsiveness-focused benchmarks.

### Configuration Changes

| Setting | Old Value | New Value | Rationale |
|---------|-----------|-----------|-----------|
| `DIAGNOSTIC_DELAY_DEFAULT` | 500ms | 250ms | Faster feedback while maintaining CPU efficiency |
| `pike.diagnosticDelay` minimum | 100ms | 50ms | Allow shorter delays on fast machines |
| `pike.diagnosticDelay` maximum | 5000ms | 2000ms | Prevent excessive delays that feel broken |

### New Benchmarks

Added "Responsiveness (Warm)" benchmark group with 3 benches:
- **First diagnostic after document change**: Measures latency from first edit to validation (user perception)
- **Validation with 250ms debounce**: Full cycle time including debounce wait
- **Rapid edit simulation**: Verifies debounce coalesces multiple rapid edits

### Benchmark Results (Phase 17)

| Benchmark | avg (min-max) | Notes |
|-----------|---------------|-------|
| First diagnostic after document change | 54.03 µs | Cached analysis - extremely fast |
| Validation with 250ms debounce | 250.78 ms | Includes 250ms debounce wait |
| Rapid edit simulation | 252.00 ms | 5 edits at 50ms intervals |

### v3.0 Performance Improvements Summary

| Metric | Phase 10 Baseline | Phase 17 Final | Improvement |
|--------|-------------------|----------------|-------------|
| Cold Start (Pike subprocess) | ~19ms | ~0.06ms | 99.7% faster |
| Validation Pipeline (3 calls) | ~1.85ms | ~1.64ms | 11% faster |
| Compilation Cache Hit | N/A | ~40µs | New feature |
| Stdlib Introspection | N/A | < 500ms | New feature |
| Diagnostic Debounce | 500ms | 250ms | 50% faster |

### E2E Verification

Created `responsiveness.test.ts` with typing simulation test:
- Simulates 50 rapid edits over 5 seconds (10 keystrokes/second)
- Verifies typing completes without blocking UI
- Confirms LSP remains responsive during rapid editing

### Conclusion

The v3.0 performance optimization milestone delivered measurable improvements across startup, validation, caching, and responsiveness. All optimizations maintain backward compatibility and pass automated regression gates (20% threshold in CI).

**Next Steps:** Future milestones could explore adaptive debouncing, Bun runtime migration, or workspace-level parallel indexing.
