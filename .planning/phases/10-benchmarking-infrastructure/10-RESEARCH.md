# Phase 10: Benchmarking Infrastructure - Research

**Researched:** 2026-01-22
**Domain:** LSP Performance Benchmarking & Regression Tracking
**Confidence:** HIGH

## Summary

This research establishes the strategy for Phase 10, which aims to provide a reliable performance baseline for the Pike LSP. The core findings recommend a multi-layered approach: a high-precision Node.js runner (**Mitata**) for the LSP server, custom instrumentation in the Pike analyzer using **`System.Timer`**, and automated regression tracking via **`github-action-benchmark`**.

**Primary recommendation:** Use **Mitata** for the benchmark runner and instrument the Pike analyzer to return internal timing metadata (`_perf`) in JSON-RPC responses to enable granular latency breakdown (IPC vs. Analysis).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| [mitata](https://github.com/evanwashere/mitata) | Latest (2026) | Benchmark runner | High resolution, statistical rigor (p99, variance), and native JSON output. |
| [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark) | v1.20+ | CI Regression tracking | Industry standard for visualizing performance trends and failing builds on regressions. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `System.Timer` | Pike 8.0 Stdlib | High-res timing in Pike | Measuring pure Pike analysis time without IPC overhead. |
| `@vscode/test-electron` | Latest | Cold start measurement | Running benchmarks in a real VS Code environment. |

## Architecture Patterns

### Recommended Project Structure
```
packages/pike-lsp-server/
├── benchmarks/
│   ├── suites/             # Mitata benchmark suites
│   ├── fixtures/           # Pike code samples (small, med, large)
│   └── runner.ts           # Entry point for benchmarking
scripts/
└── benchmark-ci.sh         # CI wrapper for runner + JSON export
```

### Pattern 1: Latency Breakdown (The "_perf" envelope)
**What:** The Pike analyzer returns internal timing in the JSON-RPC response.
**When to use:** Every benchmarked request.
**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... },
  "_perf": {
    "parse_ms": 1.2,
    "analysis_ms": 4.5,
    "total_pike_ms": 5.7
  }
}
```

### Anti-Patterns to Avoid
- **Benchmarking with `performance.now()` only:** Lacks statistical significance and doesn't account for JIT warmup.
- **Ignoring IPC Overhead:** Measuring only the end-to-end time hides where the bottleneck actually is (is it Node.js IPC or Pike's compiler?).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Statistical Analysis | Custom median/avg calc | Mitata | Handles outliers, p99, and variance automatically. |
| Performance Charts | Custom dashboard | github-action-benchmark | Generates charts and manages a 'data' branch automatically. |
| High-Res Timers | `time()` in Pike | `System.Timer()` | `time()` has second-level precision; `System.Timer` provides microsecond/nanosecond resolution. |

## Common Pitfalls

### Pitfall 1: JIT Warmup Noise
**What goes wrong:** First few runs are significantly slower than subsequent ones.
**How to avoid:** Use Mitata's warmup cycles (default or explicit) to ensure the V8 engine and Pike's interpreter are optimized before recording.

### Pitfall 2: CI Environment Variance
**What goes wrong:** GitHub Actions runners have varying CPU steal/load, leading to "noisy" results.
**How to avoid:** Set a high threshold for regression (e.g., 20% instead of 5%) and use the median (not mean) for comparison.

## Code Examples

### Pike Internal Timing (analyzer.pike)
```pike
// Source: Pike System.Timer docs
object t = System.Timer();
// ... perform analysis ...
float elapsed = t->peek(); // Returns seconds as float
```

### Mitata Suite Example
```typescript
import { bench, group, run } from 'mitata';

group('LSP Validation', () => {
  bench('Small file (10 lines)', async () => {
    await server.validate(smallFile);
  });
});

await run({ format: 'json' });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Simple `console.time` | Mitata/Tinybench | 2024-2025 | Better statistical confidence. |
| Manual CSV tracking | github-action-benchmark | 2024 | Automatic trend visualization. |

## Open Questions

1. **Pike 8.0 Timer Precision**: Need to verify if `System.Timer` on the specific Pike 8.0.1116 build provides nanosecond or microsecond precision on Linux.
2. **Shared vs. Fresh Sessions**: Benchmarking a fresh LSP start for every request is too slow, but a shared session might have memory leak noise.
   - *Recommendation*: Use a shared session for "feature" benchmarks and a dedicated suite for "cold start".

## Sources

### Primary (HIGH confidence)
- [Mitata Documentation](https://github.com/evanwashere/mitata) - Checked for 2026 compatibility and JSON support.
- [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark) - Verified for Node.js custom JSON support.
- [Pike System.Timer](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/System/Timer.html) - Verified existence in Pike 8.0.

## Metadata
**Research date:** 2026-01-22
**Valid until:** 2026-02-22
