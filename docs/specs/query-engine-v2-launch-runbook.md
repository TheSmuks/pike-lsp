# Query Engine v2 Launch Runbook

Status: Draft

Last Updated: 2026-02-24

## Purpose

Operational guide for rolling out Pike Query Engine v2 safely with measurable gates, fast rollback, and clear incident response.

## Scope

- Rollout of query-engine-backed diagnostics, navigation, and completion paths.
- Applies to canary and full rollout.
- Assumes protocol v2 and telemetry are already shipped.

## Preconditions (Hard Requirements)

- Snapshot/revision metadata in all migrated responses.
- End-to-end cancellation implemented and tested.
- Shadow diff harness running in CI.
- Benchmark baseline established on representative workspaces.
- VS Code extension bridge lifecycle hardening completed (restart/dispose resilience).
- Feature flags available per migrated feature.

## Rollout Stages

### Stage 0 - Internal Only

- Enable v2 for maintainers/internal projects.
- Collect stability data for at least 24 hours of active editing sessions.

Gate to proceed:

- No critical correctness issues.
- No persistent memory growth trend.

### Stage 1 - Canary 5%

- Enable for 5% of external sessions.
- Keep per-feature fallback toggles available.

Gate to proceed:

- Stale publish count remains zero.
- Cancellation latency meets budget.
- p95 latency within accepted regression threshold.
- No extension restart/dispose leak signals in canary telemetry.
- Queue wait p95 for typing-path requests within budget.
- Parse hard-fail rate stays at 0 during malformed rapid-edit canary fixtures.
- Reload-storm error/latency metrics remain within envelope.
- Follow-up/resolve requests remain correct across restart/dispose cycles.
- Required telemetry set is complete for the entire canary interval.

### Stage 2 - Canary 25%

- Expand to 25% of sessions.
- Monitor for 48 hours minimum.

Gate to proceed:

- Error rate and latency remain within SLO.
- No increase in severe editor usability regressions.
- No post-dispose client event handling regressions.
- Failure-containment checks show no loop-crashing per-request failures.

### Stage 3 - General Availability

- Enable as default-on.
- Keep rollback controls for at least one release window.

Gate to complete:

- Stable SLO adherence over full release window.

## SLOs and Alert Thresholds

Minimum tracked SLOs:

- p95 completion latency
- p95 definition latency
- p95 diagnostics latency
- cancellation acknowledgment-to-stop latency
- peak engine memory

Recommended alert classes:

- Critical:
  - any stale publish detected above noise floor
  - cancellation failures causing post-cancel result publication
- High:
  - sustained p95 regression above agreed threshold
  - error-rate spike above baseline multiplier
- Medium:
  - increasing memory trend that exceeds expected envelope

## Mandatory Telemetry

For every query:

- `requestId`
- `snapshotRequested`
- `snapshotIdUsed`
- `durationMs`
- `queueWaitMs`
- `cancelled` flag
- `cacheHit` and recompute metadata

Required completeness rule:

- Rollout stage cannot advance if any required metric stream is missing for the full observation window.

For rollouts:

- cohort tag (`internal`, `canary-5`, `canary-25`, `ga`)
- feature flags enabled

## Rollback Policy

Rollback is immediate if any hard trigger occurs:

- stale results published to client
- cancellation correctness failure
- severe latency regression with editor impact
- crash loop or restart-recovery failure
- extension client lifecycle leak (post-dispose event/request handling)

Rollback steps:

1. Disable v2 feature flags for impacted features.
2. Confirm fallback path healthy.
3. Capture correlated logs and snapshots.
4. Open incident issue with exact trigger metrics and request samples.
5. Block further rollout until root cause is fixed and verified.

## Incident Playbook

### Symptom: Stale Results

- Verify `snapshotIdUsed` vs target stream snapshot.
- Check adapter stale-drop logs.
- Check for out-of-order mutation application.
- Hotfix path: force strict fixed-snapshot mode for affected feature.

### Symptom: Cancellation Not Effective

- Confirm `engine/cancelRequest` receipt.
- Confirm cooperative checkpoint logs in Pike query path.
- Check for long-running non-interruptible loops.
- Hotfix path: tighten checkpoints and shorten unsafe sections.

### Symptom: Latency Spike

- Segment by query type.
- Check queue depth and wait time first.
- Check invalidation fanout and recompute rates.
- Hotfix path: apply temporary coarse caching and defer expensive derived queries.

### Symptom: Memory Growth

- Inspect cache hit/miss and eviction behavior.
- Inspect lifetime of snapshot-retained structures.
- Hotfix path: enable emergency eviction policy and reduce retention windows.

## Verification Checklist per Release

- Shadow diff parity check passes.
- Rapid-edit cancellation stress test passes.
- Determinism tests for fixed snapshot pass.
- Restart and replay test passes.
- Benchmarks pass SLO thresholds.
- Rollback toggle tested in staging.
- Queue wait and cancel-stop latency gates pass for typing-path requests.
- Parse-under-edit non-fatal fixture suite passes (broken intermediate states).
- Restart-safe follow-up/resolve request suite passes.
- Reload-storm suite (workspace/config/fs burst) passes.
- Failure-containment suite verifies per-request panic/error isolation.
- Benchmarks run against pinned small/medium/large corpus and remain within regression budget.

## Ownership and Escalation

- Primary owner: Pike engine maintainers.
- Secondary owner: TS adapter and bridge maintainers.
- Escalate to architecture owner when invariant violations recur across releases.

## Post-Launch Hardening

- Remove temporary compatibility code once GA stability is proven.
- Keep architecture checks to prevent semantic leakage back into TS.
- Review SLO targets quarterly and update based on real usage.
