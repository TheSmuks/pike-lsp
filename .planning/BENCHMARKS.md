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

| Metric | Current (Baseline) | Target |
|--------|-------------------|--------|
| Cold Start | ~200ms | < 100ms |
| Large File Validation (E2E) | ~18ms | < 10ms |
| Hover Latency | ~0.3ms | < 0.1ms |

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
