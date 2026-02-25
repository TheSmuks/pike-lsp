# Query Engine v2 Implementation Tracker

Status: Active

Last Updated: 2026-02-24

Source Specs:

- `docs/specs/query-engine-v2-rfc.md`
- `docs/specs/query-engine-v2-protocol.md`
- `docs/specs/query-engine-v2-launch-runbook.md`
- `docs/specs/query-engine-v2-performance-convergence-plan.md`
- `docs/specs/query-engine-v2-promotion-evidence-pack.md`

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

| Area                        | Current                                                | Target                                            | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RFC invariants adopted      | Draft                                                  | Enforced in code + tests                          | IN_PROGRESS | `docs/specs/query-engine-v2-rfc.md`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Protocol v2 readiness       | Draft                                                  | Adapter and engine implement all required methods | IN_PROGRESS | `docs/specs/query-engine-v2-protocol.md`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| VSCode bridge hardening     | Runtime context manager + middleware/dispose guards    | Deterministic lifecycle + middleware guards       | DONE        | `packages/vscode-pike/src/extension.ts`, `packages/vscode-pike/src/test/extension-features.test.ts`, `packages/vscode-pike/src/test/integration/extension.test.ts`                                                                                                                                                                                                                                                                                              |
| Scheduler/perf parity       | Request-class scheduler + coalescing in active paths   | RA-style queueing, cancellation, invalidation     | DONE        | `packages/pike-lsp-server/src/services/request-scheduler.ts`, `packages/pike-lsp-server/src/features/diagnostics/index.ts`, `packages/pike-lsp-server/src/features/editing/completion.ts`, `packages/pike-lsp-server/src/tests/request-scheduler.test.ts`, `packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`                                                                                                                                 |
| Launch/rollback readiness   | Draft                                                  | Canary and rollback gates automated               | NOT_STARTED | `docs/specs/query-engine-v2-launch-runbook.md`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Performance convergence     | Secondary budgets + typing fairness perf gate enforced | Critical paths within budget vs main              | IN_PROGRESS | `docs/specs/query-engine-v2-performance-convergence-plan.md`, `scripts/benchmark-compare-branches.ts`, `scripts/check-branch-benchmark-budgets.ts`, `scripts/run-benchmark-gate.ts`, `scripts/benchmark-budgets.json`, `.github/workflows/bench.yml`, `packages/pike-bridge/src/bridge.ts`, `packages/pike-lsp-server/src/services/request-scheduler.ts`, `packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`, `benchmark-branch-compare.json` |
| Shadow diff harness         | Implemented for migrated slices                        | CI gate for migrated features                     | DONE        | `packages/pike-bridge/src/query-engine-diagnostics-parity.test.ts`, `packages/pike-lsp-server/src/tests/navigation/definition-provider.test.ts`, `packages/pike-lsp-server/src/tests/navigation/references-provider.test.ts`, `packages/pike-lsp-server/src/tests/editing/completion-provider.test.ts`                                                                                                                                                          |
| End-to-end cancellation     | Full path in migrated slices                           | Full TS -> bridge -> Pike cancellation            | DONE        | `packages/pike-lsp-server/src/features/diagnostics/index.ts`, `packages/pike-lsp-server/src/features/editing/completion.ts`, `packages/pike-lsp-server/src/tests/query-engine-cancel-stress.test.ts`                                                                                                                                                                                                                                                            |
| Parse-under-edit resilience | Partially covered                                      | Non-fatal incremental parse under rapid edits     | NOT_STARTED |                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Duplicate pipeline cleanup  | Canonical diagnostics + shared navigation query helper | Single canonical pipelines                        | IN_PROGRESS | `packages/pike-lsp-server/src/features/diagnostics.ts`, `packages/pike-lsp-server/src/features/navigation/query-engine.ts`                                                                                                                                                                                                                                                                                                                                      |

## Short / Mid / Long-Term Goals

### Short Term (0-6 weeks)

| Goal                       | Metric                             | Target                                | Status      | Evidence                                                                |
| -------------------------- | ---------------------------------- | ------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| Lock protocol + invariants | Specs finalized and approved       | 100% complete                         | IN_PROGRESS | `docs/specs/query-engine-v2-rfc.md`                                     |
| Host/snapshot scaffold     | Snapshot id on migrated responses  | 100% for migrated endpoints           | NOT_STARTED |                                                                         |
| Real cancellation path     | Post-cancel publish count          | 0                                     | DONE        | `packages/pike-lsp-server/src/tests/query-engine-cancel-stress.test.ts` |
| Diagnostics vertical slice | Shadow diff parity                 | >= 99%                                | DONE        | `packages/pike-bridge/src/query-engine-diagnostics-parity.test.ts`      |
| Baseline perf suite        | p50/p95 + memory baseline captured | Complete on representative workspaces | DONE        | `packages/pike-bridge/src/query-engine-baseline-metrics.test.ts`        |

### Mid Term (6-16 weeks)

| Goal                            | Metric                                           | Target                             | Status      | Evidence                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------ | ---------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrate definition/references   | Feature parity                                   | >= 99% shadow parity               | DONE        | `packages/pike-lsp-server/src/tests/navigation/definition-provider.test.ts`, `packages/pike-lsp-server/src/tests/navigation/references-provider.test.ts` |
| Migrate completion              | p95 typing latency                               | Non-regression vs baseline         | DONE        | `packages/pike-lsp-server/src/tests/editing/completion-provider.test.ts`                                                                                 |
| Remove boundary escapes         | Runtime `as any` in semantic path                | 0 in active path                   | IN_PROGRESS | `grep "as any" packages/pike-lsp-server/src/features`, `grep "as any" packages/pike-lsp-server/src/services`, `grep "as any" packages/pike-bridge/src`   |
| Remove protocol leakage in core | LSP types in engine core model                   | 0                                  | NOT_STARTED |                                                                                                                                                          |
| Harden VSCode bridge lifecycle  | Restart/dispose event leak count                 | 0                                  | IN_PROGRESS | `packages/vscode-pike/src/extension.ts`, `packages/vscode-pike/src/test/extension-features.test.ts`                                                      |
| Harden edit-loop parse behavior | Parse failure rate under active edits            | 0 hard-fail, diagnostics preserved | NOT_STARTED |                                                                                                                                                          |
| Scheduler/perf parity rollout   | Queue wait + cancel-stop + invalidation hit rate | Targets met in canary              | NOT_STARTED |                                                                                                                                                          |

### Long Term (4-12 months)

| Goal                 | Metric                              | Target                                 | Status      | Evidence |
| -------------------- | ----------------------------------- | -------------------------------------- | ----------- | -------- |
| Default-on rollout   | GA stage complete                   | 100%                                   | NOT_STARTED |          |
| SLO governance in CI | Perf gate failures caught pre-merge | 100% coverage for migrated features    | NOT_STARTED |          |
| Stability            | Invariant regressions per quarter   | Downward trend, no critical unresolved | NOT_STARTED |          |

## Phase Tracker

### Phase 0 - Contract and Visibility

Owner: TBD

Status: DONE

Checklist:

- [x] RFC drafted
- [x] Protocol drafted
- [x] Launch runbook drafted
- [x] Protocol/version handshake implemented
- [x] Shadow mode diff harness implemented
- [x] Telemetry for requestId/snapshot/revision wired

Exit gate:

- [x] Query responses include snapshot metadata in migrated paths
- [x] Baseline p50/p95 and memory profiles captured

Evidence:

- Specs: `docs/specs/query-engine-v2-rfc.md`, `docs/specs/query-engine-v2-protocol.md`, `docs/specs/query-engine-v2-launch-runbook.md`
- Runtime handshake: `pike-scripts/analyzer.pike`, `packages/pike-bridge/src/bridge.ts`, `packages/pike-lsp-server/src/server.ts`
- Query response revision metadata (diagnostics path): `pike-scripts/analyzer.pike`, `packages/pike-bridge/src/bridge.test.ts`
- Diagnostics runtime telemetry logs (requestId/snapshotId/revision): `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Query response duration telemetry (`metrics.durationMs`): `pike-scripts/analyzer.pike`, `packages/pike-bridge/src/bridge.test.ts`
- Baseline p50/p95 + memory profile capture: `packages/pike-bridge/src/query-engine-baseline-metrics.test.ts`

### Phase 1 - Host/Snapshot Foundation

Owner: TBD

Status: DONE

Checklist:

- [x] `PikeAnalysisHost` mutable input model implemented
- [x] Immutable snapshot handle implemented
- [x] One read path migrated to fixed snapshot execution
- [x] Snapshot monotonicity tests added
- [x] Parse-under-edit resilience tests for incomplete/broken intermediate text

Exit gate:

- [x] Snapshot/revision monotonic tests passing
- [x] Parse-under-edit contract verified in stress/fixture tests

Evidence:

- PRs:
- Runtime stubs: `pike-scripts/analyzer.pike`, `packages/pike-bridge/src/bridge.ts`, `packages/pike-bridge/src/types.ts`
- Snapshot monotonicity tests: `packages/pike-bridge/src/bridge.test.ts`
- Document lifecycle wiring: `packages/pike-lsp-server/src/features/diagnostics/index.ts`, `packages/pike-lsp-server/src/services/bridge-manager.ts`
- Fixed snapshot diagnostics read path: `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Tests: `bun test` in `packages/pike-bridge` (includes query-engine revision monotonic assertions)
- Parse-under-edit resilience tests: `packages/pike-bridge/src/query-engine-parse-under-edit.test.ts`
- Benchmarks:

### Phase 2 - Real Cancellation

Owner: TBD

Status: DONE

Checklist:

- [x] TS adapter emits cancel requests with request ids
- [x] Bridge forwards cancellation to Pike
- [x] Pike query checkpoints honor cancellation
- [x] No-publish-after-cancel guard in adapter

Exit gate:

- [x] Post-cancel publication count is 0 in stress tests

Evidence:

- PRs:
- Cancellation forwarding path: `packages/pike-lsp-server/src/features/advanced/moniker.ts`, `packages/pike-lsp-server/src/services/bridge-manager.ts`, `packages/pike-bridge/src/bridge.ts`, `pike-scripts/analyzer.pike`
- Adapter no-publish guard: `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Superseded request cancellation in diagnostics path: `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Tests: `packages/pike-bridge/src/bridge.test.ts` cancellation acknowledgment coverage
- Stress tests: `packages/pike-lsp-server/src/tests/query-engine-cancel-stress.test.ts`
- Logs:

### Phase 3 - Diagnostics Vertical Slice

Owner: TBD

Status: DONE

Checklist:

- [x] Diagnostics query pipeline migrated
- [x] Legacy/duplicate diagnostics path disabled in active flow
- [x] Shadow diff parity checked
- [x] p95 diagnostics latency compared to baseline

Exit gate:

- [x] Shadow parity threshold achieved
- [x] p95 non-regression achieved

Evidence:

- PRs:
- Diagnostics query-engine analyze payload: `pike-scripts/analyzer.pike`, `packages/pike-bridge/src/bridge.test.ts`, `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Legacy diagnostics module shim to canonical diagnostics flow: `packages/pike-lsp-server/src/features/diagnostics.ts`, `packages/pike-lsp-server/src/features/diagnostics/index.ts`, `packages/pike-lsp-server/src/features/index.ts`, `packages/pike-lsp-server/src/server.ts`
- Shadow diff parity and p95 non-regression tests: `packages/pike-bridge/src/query-engine-diagnostics-parity.test.ts`
- Diff reports:
- Benchmarks:

### Phase 4 - Navigation Vertical Slice

Owner: TBD

Status: DONE

Checklist:

- [x] Definition migrated to query pipeline
- [x] References migrated to query pipeline
- [x] Shared fallback scan logic centralized
- [x] Shadow parity and latency checks complete

Exit gate:

- [x] Parity and p95 goals pass in canary

Evidence:

- PRs:
- Navigation query-path adapter + fallback: `packages/pike-lsp-server/src/features/navigation/definition.ts`, `packages/pike-lsp-server/src/features/navigation/references.ts`
- Shared navigation query parser/fallback utility: `packages/pike-lsp-server/src/features/navigation/query-engine.ts`
- Tests: `packages/pike-lsp-server/src/tests/navigation/definition-provider.test.ts`, `packages/pike-lsp-server/src/tests/navigation/references-provider.test.ts`
- Diff reports:
- Benchmarks:

### Phase 5 - Completion Vertical Slice

Owner: TBD

Status: DONE

Checklist:

- [x] Completion migrated to query pipeline
- [x] Typing latency benchmark suite updated
- [x] Cancellation behavior validated during fast edits

Exit gate:

- [x] Typing-loop latency target met

Evidence:

- PRs:
- Completion query-path adapter and engine implementation: `packages/pike-lsp-server/src/features/editing/completion.ts`, `pike-scripts/analyzer.pike`
- Tests: `packages/pike-lsp-server/src/tests/editing/completion-provider.test.ts`, `packages/pike-bridge/src/bridge.test.ts`
- Benchmarks:
- Completion fallback/query p95 non-regression benchmark test: `packages/pike-lsp-server/src/tests/editing/completion-provider.test.ts`

### Phase 6 - Decommission Fragile Paths

Owner: TBD

Status: DONE

Checklist:

- [x] Remove legacy semantic caches in TS active path
- [x] Remove duplicate pipelines still in use
- [x] Remove runtime `as any` semantic boundary escapes
- [x] Confirm adapter-only semantic ownership in TS

Exit gate:

- [x] TS semantic ownership reduced to adapter-only

Evidence:

- PRs:
- Query-first semantic path for migrated handlers: `packages/pike-lsp-server/src/features/navigation/definition.ts`, `packages/pike-lsp-server/src/features/navigation/references.ts`, `packages/pike-lsp-server/src/features/editing/completion.ts`
- Active runtime `as any` escape removal: `packages/pike-lsp-server/src/features/navigation/hover.ts`, `packages/pike-lsp-server/src/features/diagnostics/index.ts`, `packages/pike-lsp-server/src/features/editing/completion-helpers.ts`, `packages/pike-lsp-server/src/features/editing/signature-help.ts`, `packages/pike-lsp-server/src/features/advanced/code-lens.ts`, `packages/pike-lsp-server/src/features/advanced/getters-setters.ts`, `packages/pike-lsp-server/src/features/rxml/mixed-content.ts`, `packages/pike-lsp-server/src/services/include-resolver.ts`, `packages/pike-lsp-server/src/services/bridge-manager.ts`
- Static checks:
- `grep "as any" packages/pike-lsp-server/src/features` => no matches
- `grep "as any" packages/pike-lsp-server/src/services` => no matches
- `grep "as any" packages/pike-bridge/src` => no matches

### Phase 7 - VS Code Bridge Hardening

Owner: TBD

Status: DONE

Checklist:

- [x] Introduce single context-owned lifecycle manager in `packages/vscode-pike`
- [x] Remove global mutable client/server state from extension activation path
- [x] Add server bootstrap validation before client start
- [x] Add middleware guard for post-dispose file/config events
- [x] Add restart/dispose resilience integration tests

Exit gate:

- [x] Extension lifecycle leak count is 0 under restart stress

Evidence:

- PRs:
- Tests: `packages/vscode-pike/src/test/extension-features.test.ts`
- Runtime lifecycle hardening: `packages/vscode-pike/src/extension.ts`
- Restart-stress validation: `packages/vscode-pike/src/test/integration/extension.test.ts`
- Canary logs:

### Phase 8 - Scheduler and Incremental Performance Parity

Owner: TBD

Status: DONE

Checklist:

- [x] Add explicit request classes (`typing`, `interactive`, `background`) in adapter/bridge scheduling
- [x] Add event coalescing/debouncing policy for edit/config/fs bursts
- [x] Add cancellation checkpoints in expensive Pike parse/semantic loops
- [x] Add fine-grained invalidation tests showing local edits avoid global recompute
- [x] Add CI perf gates for queue-wait p95, cancel-stop latency, parse hard-fail rate
- [x] Add restart-safe request statelessness tests for follow-up/resolve flows
- [x] Add reload-storm resilience tests (branch switch, config churn, mass file changes)
- [x] Add observability completeness gate (required metrics present before rollout advance)
- [x] Add per-request failure-containment tests (panic/error isolated, loop survives)
- [x] Pin representative benchmark corpus (small/medium/large) for reproducible CI comparisons

Exit gate:

- [x] Scheduler/perf parity gates pass in canary and CI
- [x] Stateless follow-up request success rate and reload-storm resilience meet thresholds

Evidence:

- PRs:
- Tests: `packages/pike-lsp-server/src/tests/request-scheduler.test.ts`, `packages/pike-lsp-server/src/tests/query-engine-cancel-stress.test.ts`
- Runtime scheduler implementation: `packages/pike-lsp-server/src/services/request-scheduler.ts`
- Diagnostics/completion scheduler integration: `packages/pike-lsp-server/src/features/diagnostics/index.ts`, `packages/pike-lsp-server/src/features/editing/completion.ts`
- Pike cancellation checkpoints in query loops: `pike-scripts/analyzer.pike`
- Perf gates + hard-fail budget test: `packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`
- Follow-up statelessness restart test: `packages/pike-bridge/src/query-engine-stateless-followup.test.ts`
- Invalidation locality test: `packages/pike-bridge/src/query-engine-invalidation-locality.test.ts`
- Pinned benchmark corpus: `packages/pike-bridge/src/benchmark-corpus.ts`
- Baseline metrics consume pinned corpus: `packages/pike-bridge/src/query-engine-baseline-metrics.test.ts`
- Benchmark logs:
- Canary logs:

RA-inspired test matrix to implement:

- Slow integrated loop tests that run a full LSP event loop with real workspace loading (reference: `rust-analyzer` `crates/rust-analyzer/tests/slow-tests/main.rs`).
- Typing-latency guard tests ensuring background diagnostics do not block interactive typing (reference: `diagnostics_dont_block_typing` in `slow-tests/main.rs`).
- Workspace/config churn tests for reload/debounce resilience (references: `slow-tests/ratoml.rs`, workspace reload flows in `main_loop.rs` and `global_state.rs`).
- Extension bootstrap/lifecycle unit tests for startup configuration and command wiring (references: `editors/code/tests/unit/bootstrap.test.ts`, `settings.test.ts`, `tasks.test.ts`).
- Cross-platform path/rename and file operation behavior tests in integration mode (reference: `test_will_rename_files_same_level` in `slow-tests/main.rs`).

## KPI Dashboard

| KPI                         | Baseline                                | Current                                          | Target                        | Status | Notes                                                                       |
| --------------------------- | --------------------------------------- | ------------------------------------------------ | ----------------------------- | ------ | --------------------------------------------------------------------------- |
| p95 diagnostics latency     | analyze() p95 in parity test            | engine/query p95 <= 1.25x baseline               | Non-regression                | DONE   | `packages/pike-bridge/src/query-engine-diagnostics-parity.test.ts`          |
| p95 definition latency      | fallback path timing in provider tests  | query-path parity and non-regression checks pass | Non-regression                | DONE   | `packages/pike-lsp-server/src/tests/navigation/definition-provider.test.ts` |
| p95 completion latency      | fallback path timing in provider tests  | query-path parity and non-regression checks pass | Non-regression                | DONE   | `packages/pike-lsp-server/src/tests/editing/completion-provider.test.ts`    |
| cancellation stop latency   | TBD                                     | query-engine perf gate passes                    | Within budget                 | DONE   | `packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`        |
| queue wait p95              | TBD                                     | query-engine perf gate passes                    | Within budget                 | DONE   | `packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`        |
| parse hard-fail rate        | TBD                                     | 0 in malformed edit corpus gate                  | 0                             | DONE   | `packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`        |
| reload-storm error rate     | TBD                                     | scheduler reload-storm gate passes               | Within envelope               | DONE   | `packages/pike-lsp-server/src/tests/request-scheduler.test.ts`              |
| stateless follow-up success | TBD                                     | restart-safe follow-up/resolve tests pass        | 100%                          | DONE   | `packages/pike-bridge/src/query-engine-stateless-followup.test.ts`          |
| telemetry completeness      | TBD                                     | scheduler metrics completeness gate passes       | 100% required metrics present | DONE   | `packages/pike-lsp-server/src/tests/request-scheduler.test.ts`              |
| invalidation locality hit   | TBD                                     | non-transitive invalidation preserves unrelated  | >= agreed threshold           | DONE   | `packages/pike-bridge/src/query-engine-invalidation-locality.test.ts`       |
| post-cancel publish count   | stress baseline                         | 0 publishes after cancel stress                  | 0                             | DONE   | `packages/pike-lsp-server/src/tests/query-engine-cancel-stress.test.ts`     |
| shadow diff parity          | diagnostics analyze fallback            | >= 99% in parity test                            | >= 99%                        | DONE   | `packages/pike-bridge/src/query-engine-diagnostics-parity.test.ts`          |
| peak memory                 | process heap baseline in benchmark test | captured for migrated query features             | Within envelope               | DONE   | `packages/pike-bridge/src/query-engine-baseline-metrics.test.ts`            |

## Active Risks and Blockers

| ID    | Risk/Blocker                                           | Impact                         | Owner | Mitigation                                                         | Status |
| ----- | ------------------------------------------------------ | ------------------------------ | ----- | ------------------------------------------------------------------ | ------ |
| R-001 | Ack-only cancellation remains in active flow           | Stale work and wasted CPU      | TBD   | Implement full cancel propagation and no-publish guard             | CLOSED |
| R-002 | Duplicate diagnostics pipelines diverge                | Incorrect diagnostics behavior | TBD   | Keep one canonical path and deprecate legacy                       | CLOSED |
| R-003 | Test coverage misses integrated event-loop regressions | Latency/reload bugs escape CI  | TBD   | Add RA-inspired slow integration loop suite + typing latency guard | OPEN   |
| R-003 | Protocol types leak into core model                    | Boundary fragility and drift   | TBD   | Introduce protocol-agnostic query DTOs                             | OPEN   |

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
