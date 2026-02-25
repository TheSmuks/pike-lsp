---
id: benchmarks
title: Benchmarks
description: Performance benchmarks and optimization history for Pike LSP
sidebar_position: 10
---

# Benchmarks

Last updated: 2026-02-18 (v0.1.0-alpha.20)

## Performance Summary

| Operation                     | Target | Actual      | Status       |
| ----------------------------- | ------ | ----------- | ------------ |
| Pike Startup                  | <500ms | ~57µs       | ✅ Excellent |
| Small Validation (15 lines)   | -      | 0.15ms      | ✅ Good      |
| Medium Validation (100 lines) | -      | 0.64ms      | ✅ Good      |
| Large Validation (1000 lines) | <10ms  | 7.5ms       | ✅ Good      |
| Completion Context            | <0.5ms | 0.16-0.23ms | ✅ Exceeded  |
| Hover (resolveModule)         | <100µs | 21µs        | ✅ Excellent |
| Stdlib Resolution             | <500ms | 20-300µs    | ✅ Excellent |
| Cache Hit Rate                | >80%   | 84%         | ✅ Good      |

:::info Live Dashboard
View interactive benchmarks: [thesmuks.github.io/pike-lsp](https://thesmuks.github.io/pike-lsp)
:::

## Optimization History

### v0.1.0-alpha.20 (2026-02-16)

- **LRU cache**: - Add Pike-side LRU cache for symbol introspection
- **Symbol indexing**: - Optimize symbol indexing for large Pike projects
- **Hover lookups**: - Index symbols for O(1) hover lookups
- **Completion caching**: - Cache waterfall symbols for completion
- **RXML providers**: - Cache glob results in RXML providers

### v0.1.0-alpha.17 (2026-02-07)

- **Hash-based cache eviction**: - Replace LRU tracking with hash-based eviction for zero overhead (7.2% faster on cache-intensive workloads)

### v0.1.0-alpha.13 (2026-02-01)

- **Benchmark regression detection**: - Raise absolute diff floor to 2ms for fast benchmarks (<10ms average) to properly absorb CI timing jitter while still catching real regressions

### v0.1.0-alpha.11 (2026-01-26)

- **Tokenization reuse**: - Cache and reuse tokenized results across analysis pipeline
- **Line splitting reuse**: - Share computed line boundaries between operations
- **Variables analysis buffering**: - Use string buffering for variables analysis
- **Incremental indexing**: - Changed document classification identifies affected files for partial re-parsing

## Benchmark Specifications

| Specification                                                                                              | Status       | Severity                                                      | Date       |
| ---------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------- | ---------- |
| [Spec: Fix Benchmark Regression from paramOrder Array](./specs/2026-01-25-benchmark-regression-paramorder) | 📋 Draft     | Performance Regression (55-70% slower on affected benchmarks) | 2026-01-25 |
| [Spec: Pike LSP Performance Optimization](./specs/2026-01-25-lsp-performance-optimization)                 | ✅ Completed | User Experience Impact (4.69ms for completion context)        | 2026-01-25 |

## Methodology

Benchmarks are measured using:

- **Pike 8.0.1116** as the language runtime
- **Mitata** for high-precision timing (<100µs resolution)
- **TypeScript LSP Server** for client-side overhead measurement
- **PikeBridge** for IPC latency measurement

### Test Scenarios

1. **Startup**: Cold start time for Pike analyzer
2. **Validation**: Document validation for files of varying sizes
3. **Completion**: Full completion context extraction
4. **Hover**: Symbol resolution and documentation lookup
5. **Stdlib**: Common stdlib module resolution

### Measurement Environment

- Platform: Linux (CI environment)
- Pike: 8.0.1116
- Node.js: 20.x

### Branch-to-Branch Comparison

Use the deterministic branch comparison runner to compare median/p95 metrics between two refs:

```bash
bun run bench:compare-branches -- --base=origin/main --target=origin/fix/vscode-e2e-ci-real-tests --iterations=3 --warmup=1 --mitata-time=300 --output=benchmark-branch-compare.json
```

The command runs isolated clone-based benchmark rounds for each ref and writes a single JSON report with per-benchmark median, p95, and delta.

Apply critical-path budgets to the comparison output:

```bash
bun run bench:check-budgets -- --report=benchmark-branch-compare.json --budget=scripts/benchmark-budgets.json
```

The budget checker supports noise-aware handling for sub-ms paths using absolute-delta caps.

Current budget set includes both critical and secondary convergence paths (stdlib nested/hover) with calibrated thresholds in `scripts/benchmark-budgets.json`.

For low-flake CI enforcement, run two consecutive compare+budget rounds:

```bash
bun run bench:gate -- --rounds=2 --base=origin/main --target=HEAD --iterations=2 --warmup=1 --mitata-time=200 --output=benchmark-branch-compare.json --budget=scripts/benchmark-budgets.json
```

## CI Integration

Benchmark generation is automated in CI:

```bash
# Generate benchmark docs
node scripts/generate-benchmark-docs.js

# Generate interactive HTML page
node scripts/generate-benchmark-page.js
```

See [scripts/generate-benchmark-docs.js](https://github.com/TheSmuks/pike-lsp/blob/main/scripts/generate-benchmark-docs.js) for source.
