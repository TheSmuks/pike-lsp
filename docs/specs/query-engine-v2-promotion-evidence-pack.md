# Query Engine v2 Promotion Evidence Pack

Status: Active

Last Updated: 2026-02-25

## Purpose

Single evidence bundle for promoting `rewrite/query-engine-v2-ra-parity` into `rewrite/query-engine-v2`.

## Required Gate Results

- `bun run typecheck`
- `bun run build`
- `cd packages/pike-lsp-server && bun test src/tests/query-engine-perf-gates.test.ts`
- `bun run bench:gate -- --rounds=2 --base=origin/main --target=HEAD --iterations=2 --warmup=1 --mitata-time=200 --output=benchmark-branch-compare.json --budget=scripts/benchmark-budgets.json`
- `pike test/tests/cross-version-tests.pike`

## Evidence Artifacts

- `benchmark-branch-compare.json`
- `scripts/benchmark-budgets.json`
- `docs/specs/query-engine-v2-implementation-tracker.md`
- `docs/specs/query-engine-v2-launch-runbook.md`

## Checklist (rewrite/query-engine-v2-ra-parity -> rewrite/query-engine-v2)

- [ ] All required gate commands pass in the same branch state.
- [ ] Performance convergence row is up to date in tracker.
- [ ] Launch runbook stage gates and rollback rules remain consistent.
- [ ] Bench budget file reflects current enforced thresholds.
- [ ] PR body includes tracker update section and links to artifacts.

## PR Body Snippet

```text
Tracker Update
- Phase: Performance convergence (medium-term)
- Milestone: Typing fairness gate + secondary budget coverage
- Status delta: IN_PROGRESS -> IN_PROGRESS (promotion-ready)
- KPI impact: critical + secondary benchmark budgets passing in consecutive rounds
- Exit-gate impact: promotion evidence pack complete for rewrite integration PR
- Evidence: benchmark-branch-compare.json, scripts/benchmark-budgets.json, bench gate logs
```
