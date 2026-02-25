# Query Engine v2 Rewrite - Resume Prompt

Use this prompt to resume rewrite work in a future session.

```text
Resume the Pike query-engine-v2 rewrite from the current repository state.

Context:
- Repo: pike-lsp
- Branch policy: rewrite work must stay off main; use rewrite/query-engine-v2 flow.
- Source of truth tracker: docs/specs/query-engine-v2-implementation-tracker.md
- Architecture docs:
  - docs/specs/query-engine-v2-rfc.md
  - docs/specs/query-engine-v2-protocol.md
  - docs/specs/query-engine-v2-launch-runbook.md
  - docs/specs/query-engine-v2-branching-and-execution-policy.md
  - docs/specs/query-engine-v2-performance-convergence-plan.md
  - docs/specs/query-engine-v2-promotion-evidence-pack.md

Current status snapshot:
- Query-engine vertical slices are complete through diagnostics, navigation, and completion.
- Decommission phase is complete for active semantic runtime paths.
- Phase 7 bridge lifecycle hardening is complete, including restart-stress stability coverage.
- Phase 8 scheduler/perf parity implementation is complete, including cancellation checkpoints, perf gates, invalidation locality, stateless follow-up/restart coverage, and pinned benchmark corpus.

Recent rewrite commits (newest first):
- b67d58a feat: emit engine query duration telemetry
- 538a17d feat: log diagnostics query telemetry metadata
- 11d6b67 feat: include diagnostics query revision metadata
- 34cd137 feat: return diagnostics analyze payload from engine queries
- 54c9ade feat: cancel superseded diagnostics engine requests

What to do first:
1) Open and read docs/specs/query-engine-v2-implementation-tracker.md.
2) Pick the next unchecked gate and implement only that slice.
3) Keep commits small and scoped (one milestone per commit).
4) Update tracker evidence after each milestone.

Suggested next slices:
- Execute performance convergence plan short-term goals in order (signal stability -> top hotspot tuning -> correctness gate revalidation).
- Keep `bench:check-budgets` green while tuning secondary stdlib nested/hover paths that still show variance.
- Keep `bench:gate` (2 consecutive rounds) green to avoid perf-gate flake regressions.
- Preserve and extend bridge-side stdlib/module resolution caches before considering riskier analyzer-level tuning.
- Keep typing-fairness gate (`query-engine-perf-gates`) passing while adjusting scheduler behavior.
- Run `bun run qe2:promotion-gates` before opening integration promotion PRs.
- Promote/rollout only after branch policy gates are satisfied on `rewrite/query-engine-v2`.
- If new regressions appear, use tracker KPIs and the new perf-gate tests as first triage surface.

Required verification after each slice:
- bun run typecheck
- cd packages/pike-bridge && bun test && cd ../..
- cd packages/pike-lsp-server && bun test src/tests/smoke.test.ts && cd ../..
- pike test/tests/cross-version-tests.pike

Hard constraints:
- Use bun tooling only.
- Do not work directly on main.
- Do not commit unrelated local files.
- Keep code and tracker in sync.
```
