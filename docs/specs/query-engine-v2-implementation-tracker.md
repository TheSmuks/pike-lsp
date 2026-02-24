# Query Engine v2 Implementation Tracker

Status: Active

Last Updated: 2026-02-24

Source Specs:

- `docs/specs/query-engine-v2-rfc.md`
- `docs/specs/query-engine-v2-protocol.md`
- `docs/specs/query-engine-v2-launch-runbook.md`

## How to Use This Tracker

This file is the single source of truth for rewrite execution progress.

Update cadence:

- Update phase tables when scope/status changes.
- Update KPI dashboard after each benchmark run or canary interval.
- Add a dated log entry for every merged milestone.
- Keep links to evidence (PRs, test runs, benchmark output, incident issues).

Status legend:

- `NOT_STARTED`
- `IN_PROGRESS`
- `AT_RISK`
- `BLOCKED`
- `DONE`

## Program Dashboard

| Area                       | Current                | Target                                            | Status      | Evidence                                                    |
| -------------------------- | ---------------------- | ------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| RFC invariants adopted     | Draft                  | Enforced in code + tests                          | IN_PROGRESS | `docs/specs/query-engine-v2-rfc.md`                         |
| Protocol v2 readiness      | Draft                  | Adapter and engine implement all required methods | IN_PROGRESS | `docs/specs/query-engine-v2-protocol.md`                    |
| Launch/rollback readiness  | Draft                  | Canary and rollback gates automated               | NOT_STARTED | `docs/specs/query-engine-v2-launch-runbook.md`              |
| Shadow diff harness        | Not implemented        | CI gate for migrated features                     | NOT_STARTED |                                                             |
| End-to-end cancellation    | Ack-only path present  | Full TS -> bridge -> Pike cancellation            | NOT_STARTED | `packages/pike-lsp-server/src/features/advanced/moniker.ts` |
| Duplicate pipeline cleanup | Diagnostics duplicated | Single canonical pipelines                        | NOT_STARTED | `packages/pike-lsp-server/src/features/diagnostics.ts`      |

## Short / Mid / Long-Term Goals

### Short Term (0-6 weeks)

| Goal                       | Metric                             | Target                                | Status      | Evidence                            |
| -------------------------- | ---------------------------------- | ------------------------------------- | ----------- | ----------------------------------- |
| Lock protocol + invariants | Specs finalized and approved       | 100% complete                         | IN_PROGRESS | `docs/specs/query-engine-v2-rfc.md` |
| Host/snapshot scaffold     | Snapshot id on migrated responses  | 100% for migrated endpoints           | NOT_STARTED |                                     |
| Real cancellation path     | Post-cancel publish count          | 0                                     | NOT_STARTED |                                     |
| Diagnostics vertical slice | Shadow diff parity                 | >= 99%                                | NOT_STARTED |                                     |
| Baseline perf suite        | p50/p95 + memory baseline captured | Complete on representative workspaces | NOT_STARTED |                                     |

### Mid Term (6-16 weeks)

| Goal                            | Metric                            | Target                     | Status      | Evidence |
| ------------------------------- | --------------------------------- | -------------------------- | ----------- | -------- |
| Migrate definition/references   | Feature parity                    | >= 99% shadow parity       | NOT_STARTED |          |
| Migrate completion              | p95 typing latency                | Non-regression vs baseline | NOT_STARTED |          |
| Remove boundary escapes         | Runtime `as any` in semantic path | 0 in active path           | NOT_STARTED |          |
| Remove protocol leakage in core | LSP types in engine core model    | 0                          | NOT_STARTED |          |

### Long Term (4-12 months)

| Goal                 | Metric                              | Target                                 | Status      | Evidence |
| -------------------- | ----------------------------------- | -------------------------------------- | ----------- | -------- |
| Default-on rollout   | GA stage complete                   | 100%                                   | NOT_STARTED |          |
| SLO governance in CI | Perf gate failures caught pre-merge | 100% coverage for migrated features    | NOT_STARTED |          |
| Stability            | Invariant regressions per quarter   | Downward trend, no critical unresolved | NOT_STARTED |          |

## Phase Tracker

### Phase 0 - Contract and Visibility

Owner: TBD

Status: IN_PROGRESS

Checklist:

- [x] RFC drafted
- [x] Protocol drafted
- [x] Launch runbook drafted
- [x] Protocol/version handshake implemented
- [ ] Shadow mode diff harness implemented
- [ ] Telemetry for requestId/snapshot/revision wired

Exit gate:

- [ ] Query responses include snapshot metadata in migrated paths
- [ ] Baseline p50/p95 and memory profiles captured

Evidence:

- Specs: `docs/specs/query-engine-v2-rfc.md`, `docs/specs/query-engine-v2-protocol.md`, `docs/specs/query-engine-v2-launch-runbook.md`
- Runtime handshake: `pike-scripts/analyzer.pike`, `packages/pike-bridge/src/bridge.ts`, `packages/pike-lsp-server/src/server.ts`

### Phase 1 - Host/Snapshot Foundation

Owner: TBD

Status: IN_PROGRESS

Checklist:

- [x] `PikeAnalysisHost` mutable input model implemented
- [x] Immutable snapshot handle implemented
- [x] One read path migrated to fixed snapshot execution
- [ ] Snapshot monotonicity tests added

Exit gate:

- [ ] Snapshot/revision monotonic tests passing

Evidence:

- PRs:
- Runtime stubs: `pike-scripts/analyzer.pike`, `packages/pike-bridge/src/bridge.ts`, `packages/pike-bridge/src/types.ts`
- Document lifecycle wiring: `packages/pike-lsp-server/src/features/diagnostics/index.ts`, `packages/pike-lsp-server/src/services/bridge-manager.ts`
- Fixed snapshot diagnostics read path: `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Tests:
- Benchmarks:

### Phase 2 - Real Cancellation

Owner: TBD

Status: IN_PROGRESS

Checklist:

- [x] TS adapter emits cancel requests with request ids
- [x] Bridge forwards cancellation to Pike
- [x] Pike query checkpoints honor cancellation
- [x] No-publish-after-cancel guard in adapter

Exit gate:

- [ ] Post-cancel publication count is 0 in stress tests

Evidence:

- PRs:
- Cancellation forwarding path: `packages/pike-lsp-server/src/features/advanced/moniker.ts`, `packages/pike-lsp-server/src/services/bridge-manager.ts`, `packages/pike-bridge/src/bridge.ts`, `pike-scripts/analyzer.pike`
- Adapter no-publish guard: `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Tests:
- Logs:

### Phase 3 - Diagnostics Vertical Slice

Owner: TBD

Status: NOT_STARTED

Checklist:

- [ ] Diagnostics query pipeline migrated
- [ ] Legacy/duplicate diagnostics path disabled in active flow
- [ ] Shadow diff parity checked
- [ ] p95 diagnostics latency compared to baseline

Exit gate:

- [ ] Shadow parity threshold achieved
- [ ] p95 non-regression achieved

Evidence:

- PRs:
- Diff reports:
- Benchmarks:

### Phase 4 - Navigation Vertical Slice

Owner: TBD

Status: NOT_STARTED

Checklist:

- [ ] Definition migrated to query pipeline
- [ ] References migrated to query pipeline
- [ ] Shared fallback scan logic centralized
- [ ] Shadow parity and latency checks complete

Exit gate:

- [ ] Parity and p95 goals pass in canary

Evidence:

- PRs:
- Diff reports:
- Benchmarks:

### Phase 5 - Completion Vertical Slice

Owner: TBD

Status: NOT_STARTED

Checklist:

- [ ] Completion migrated to query pipeline
- [ ] Typing latency benchmark suite updated
- [ ] Cancellation behavior validated during fast edits

Exit gate:

- [ ] Typing-loop latency target met

Evidence:

- PRs:
- Benchmarks:

### Phase 6 - Decommission Fragile Paths

Owner: TBD

Status: NOT_STARTED

Checklist:

- [ ] Remove legacy semantic caches in TS active path
- [ ] Remove duplicate pipelines still in use
- [ ] Remove runtime `as any` semantic boundary escapes
- [ ] Confirm adapter-only semantic ownership in TS

Exit gate:

- [ ] TS semantic ownership reduced to adapter-only

Evidence:

- PRs:
- Static checks:

## KPI Dashboard

| KPI                       | Baseline | Current | Target          | Status      | Notes |
| ------------------------- | -------- | ------- | --------------- | ----------- | ----- |
| p95 diagnostics latency   | TBD      | TBD     | Non-regression  | NOT_STARTED |       |
| p95 definition latency    | TBD      | TBD     | Non-regression  | NOT_STARTED |       |
| p95 completion latency    | TBD      | TBD     | Non-regression  | NOT_STARTED |       |
| cancellation stop latency | TBD      | TBD     | Within budget   | NOT_STARTED |       |
| post-cancel publish count | TBD      | TBD     | 0               | NOT_STARTED |       |
| shadow diff parity        | TBD      | TBD     | >= 99%          | NOT_STARTED |       |
| peak memory               | TBD      | TBD     | Within envelope | NOT_STARTED |       |

## Active Risks and Blockers

| ID    | Risk/Blocker                                 | Impact                         | Owner | Mitigation                                             | Status |
| ----- | -------------------------------------------- | ------------------------------ | ----- | ------------------------------------------------------ | ------ |
| R-001 | Ack-only cancellation remains in active flow | Stale work and wasted CPU      | TBD   | Implement full cancel propagation and no-publish guard | OPEN   |
| R-002 | Duplicate diagnostics pipelines diverge      | Incorrect diagnostics behavior | TBD   | Keep one canonical path and deprecate legacy           | OPEN   |
| R-003 | Protocol types leak into core model          | Boundary fragility and drift   | TBD   | Introduce protocol-agnostic query DTOs                 | OPEN   |

## Weekly Progress Log

### YYYY-MM-DD

- Completed:
- In progress:
- Blocked:
- KPI deltas:
- Risks changed:
- Next week focus:
- Evidence links:

## Per-PR Update Template

Use this in every PR touching query-engine-v2 work:

```text
Tracker Update
- Phase: <phase number/name>
- Milestone: <what moved>
- Status delta: <NOT_STARTED -> IN_PROGRESS, etc>
- KPI impact: <which metrics changed>
- Exit-gate impact: <which checkbox moved>
- Evidence: <tests, benchmark output, logs>
```

## Definition of Done for This Tracker

- Every phase has owner, status, and evidence links.
- Every merged milestone updates at least one checklist item.
- KPI dashboard values are refreshed after each benchmark/canary cycle.
- Risks table reflects current blockers, not historical clutter.
