# Query Engine v2 Performance Convergence Plan

Status: Active

Last Updated: 2026-02-25

## Purpose

Close remaining performance deltas against `origin/main` while keeping query-engine-v2 correctness and lifecycle guarantees intact.

## Scope

- Branch-level performance convergence for `rewrite/query-engine-v2-ra-parity`.
- Critical paths only: startup, first-diagnostic responsiveness, closed-file cache-key path, typing-loop warm validation.
- Deterministic, repeatable branch-to-branch benchmark evidence.

## Non-Negotiable Guardrails

- Do not regress cancellation correctness (post-cancel publish count stays 0).
- Do not regress parse-under-edit hard-fail rate (stays 0).
- Do not remove lifecycle/dispose safety guards in VS Code bridge.
- Any perf optimization must pass typecheck/build and existing rewrite stress suites.

## Measurement Contract

Use:

`bun run bench:compare-branches -- --base=origin/main --target=HEAD --iterations=3 --warmup=1 --mitata-time=300 --output=benchmark-branch-compare.json`

Rules:

- Compare medians first, then p95.
- Require two consecutive stable runs before marking a path as converged.
- Treat +/- 3% as noise envelope for sub-ms microbench paths.

## Goals

### Short-Term Goals (0-2 weeks)

1. Stabilize benchmark signal quality
   - Deliverable: deterministic run protocol in docs and CI invocation examples.
   - Success metric: repeat-run variance small enough to separate noise from real regressions.

2. Remove top currently regressed hotspots
   - Focus: closed-file stat-key path, first-diagnostic-after-change path, startup+detailed metrics path.
   - Success metric: each target within <= +3% median delta vs `origin/main`.

3. Keep correctness gates green while tuning
   - Success metric: cancellation, parse-hard-fail, reload-storm, stateless-follow-up suites remain passing.

### Medium-Term Goals (2-6 weeks)

1. Convert comparison into enforceable CI budget checks
   - Deliverable: CI gate with explicit per-path budgets for critical benchmarks.
   - Success metric: PRs violating budgets fail before merge.

2. Improve cache-path efficiency without correctness trade-offs
   - Focus: open-vs-closed file cache key generation and request dedupe policy on large payloads.
   - Success metric: closed-file analyze and warm validation paths consistently non-regressed.

3. Prioritize typing-responsiveness fairness over aggregate throughput
   - Focus: scheduler tuning for typing-class requests under background load.
   - Success metric: first-diagnostic and warm typing paths converge to non-regression budgets.

### Long-Term Goals (6+ weeks)

1. Make v2 performance governance default
   - Deliverable: quarterly budget refresh process and pinned corpus evolution policy.
   - Success metric: no silent benchmark drift across releases.

2. Reach sustained parity-or-better posture
   - Success metric: all critical paths within budget, with majority at parity or better over release windows.

3. Rollout confidence at scale
   - Success metric: canary and GA runbook gates stay green with no rollback triggered by perf/correctness regressions.

## Execution Plan

### Workstream A - Benchmark Robustness

- Keep branch comparison harness as source of truth for branch-vs-branch decisions.
- Preserve fixed environment knobs (`CI`, `TZ`, locale) and warmup/repeat strategy.
- Record each convergence run artifact in `benchmark-branch-compare.json` for PR evidence.

### Workstream B - Hotspot Tuning

- Tune one hotspot at a time.
- After each tuning change:
  1. run focused tests for touched area,
  2. run benchmark comparison,
  3. retain only changes that improve or remain within noise budget.

### Workstream C - CI Gates

- Promote measurement thresholds from advisory to required checks.
- Start with critical paths only, then expand to secondary paths after two stable cycles.

## Completion Criteria

- Critical paths converge to <= +3% median delta (or better) against `origin/main` in two consecutive stable runs.
- CI budgets are active for those critical paths.
- All rewrite correctness/perf stress gates remain passing.
- Tracker and runbook evidence are updated with latest convergence data.

## Execution Status (2026-02-25)

Completed in-repo:

- Deterministic branch comparison harness is active (`scripts/benchmark-compare-branches.ts`).
- Critical-path budget checker is implemented (`scripts/check-branch-benchmark-budgets.ts`).
- Initial budget config is defined (`scripts/benchmark-budgets.json`).
- CI benchmark workflow now runs branch-vs-main compare and enforces critical budgets on PRs (`.github/workflows/bench.yml`).
- CI benchmark gate now requires two consecutive compare+budget pass rounds (`scripts/run-benchmark-gate.ts`, `bench:gate`).
- Benchmark harness overhead reduced by disabling internal metric collection during JSON-mode benchmark runs (`packages/pike-lsp-server/benchmarks/runner.ts`).
- Bridge stdlib/module fast paths now cache repeated resolution results to reduce hover/stdlib path variance (`packages/pike-bridge/src/bridge.ts`).

Current convergence signal:

- Critical budget gate passes with current branch-vs-main comparison command.
- Consecutive pass policy validated locally (`bench:gate` with 2 rounds) for reduced flake risk.
- Secondary stdlib/hover paths are now included in budget checks with tuned noise-aware thresholds and passing consecutive gate rounds.
- Typing fairness under background load now has an explicit perf-gate test and CI enforcement step (`packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`, `.github/workflows/bench.yml`).
