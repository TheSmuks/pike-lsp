---
phase: 10-benchmarking
plan: 02
subsystem: performance
tags: [benchmarking, fixtures, lsp]
requires: [10-01]
provides: [lsp-feature-benchmarks, performance-fixtures]
affects: [11-startup, 12-consolidation]
tech-stack:
  added: []
  patterns: [benchmark-fixtures]
key-files:
  created: [packages/pike-lsp-server/benchmarks/fixtures/small.pike, packages/pike-lsp-server/benchmarks/fixtures/medium.pike, packages/pike-lsp-server/benchmarks/fixtures/large.pike]
  modified: [packages/pike-lsp-server/benchmarks/runner.ts, packages/pike-bridge/src/types.ts, packages/pike-bridge/src/bridge.ts]
decisions:
  - id: PIKE_PERF_PROPAGATION
    title: Propagate internal timing through bridge
    context: Needed to distinguish between Pike analysis time and Node.js/IPC overhead.
    action: Modified PikeBridge to extract _perf metadata from responses and attach it to result objects.
metrics:
  duration: 9m 46s
  completed: 2026-01-22
---

# Phase 10 Plan 02: LSP Core Benchmarks Summary

## Objective
Create standard benchmarks for key LSP features using realistic Pike code samples and establish a performance baseline with internal timing data.

## Substantive Deliverables
- **Realistic Fixtures**: Created `small.pike` (15 lines), `medium.pike` (70 lines), and `large.pike` (900 lines) to test different load levels.
- **Validation Suite**: Benchmarked the triple-call validation flow (introspect + parse + analyze_uninitialized).
- **Intelligence Suite**: Benchmarked Hover (resolve/resolveStdlib) and Completion (get_completion_context).
- **Timing Breakdown**: Successfully propagated `_perf` metadata from Pike through the bridge, allowing the runner to report Pike-internal vs E2E latency.

## Baseline Results (Warm)
| Operation | Small | Medium | Large |
|-----------|-------|--------|-------|
| Validation (E2E) | ~0.5ms | ~1.6ms | ~18.3ms |
| Validation (Pike) | ~0.1ms | ~0.4ms | ~4.4ms |
| Hover (resolveStdlib)| ~0.3ms | - | - |
| Completion (Pike) | - | - | ~4.3ms |

*Note: Validation E2E includes 3 IPC calls, which explains why it's significantly higher than the Pike-internal time.*

## Deviations from Plan
- **Bridge Modification**: Automatically applied Rule 2/3 to modify `pike-bridge` to propagate `_perf` metadata. Without this, the runner couldn't fulfill the "Latency is broken down by End-to-End vs Pike Internal" truth requirement.

## Next Phase Readiness
- [x] Full feature benchmark suite reporting statistical data.
- [x] High-resolution breakdown of where time is spent (IPC vs Logic).
- [ ] Ready for 10-03 (CI Integration).

## Commits
- 693acca: test(10-02): create benchmarking fixtures
- 9f44e67: feat(10-02): propagate _perf metadata through PikeBridge
- 8959475: feat(10-02): implement Validation and Intelligence benchmark suites

🤖 Generated with [Claude Code](https://claude.com/claude-code)
