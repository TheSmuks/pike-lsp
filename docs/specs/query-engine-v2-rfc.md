# Pike Query Engine v2 RFC

Status: Draft

Owners: Pike LSP maintainers

Last Updated: 2026-02-24

## Context

The current Pike LSP architecture is feature-rich but fragile under concurrency and incremental editing. We currently have mutable shared state across server services, partial cancellation behavior, and duplicated feature pipelines. This creates stale-result risk, hard-to-reason invalidation, and uneven latency under load.

We want rust-analyzer-grade responsiveness and correctness, while keeping Pike as the semantic engine.

## Decision

Adopt a Pike-authoritative query engine architecture with these principles:

- Pike owns all semantic truth.
- TypeScript LSP server is an adapter and coordinator only.
- Bridge is transport/process lifecycle only, not semantic policy.
- Request reads execute against immutable snapshots.
- Input changes happen only through a single mutable host.

## Why This Direction

Rust-analyzer architecture review confirms these properties are foundational:

- Single mutable host + immutable per-request analysis snapshot.
- Cancellation as correctness (not only as UX optimization).
- Strict layering from inputs to IDE projections.
- Protocol isolation so LSP types do not leak into core analysis logic.
- Instrumentation and profiling built into architecture from day one.

Rust-analyzer mechanisms we explicitly mirror for performance parity:

- Event-loop prioritization and selective fast-lane handling for latency-sensitive requests.
- Coalescing/debouncing of high-frequency events (file changes, background updates).
- Cancellation as first-class control flow in incremental computation.
- Transactional apply-change into a mutable host + immutable per-request snapshots.
- Thread intent separation (`LatencySensitive` vs worker/background classes).
- Explicit reload/debounce handling for workspace/config/file-system churn.
- Operational observability with mandatory telemetry before rollout progression.

Reference implementation anchors (rust-analyzer):

- Main event loop prioritization/coalescing: `crates/rust-analyzer/src/main_loop.rs`
- Mutable world state + immutable snapshots + transactional apply-change: `crates/rust-analyzer/src/global_state.rs`, `crates/ide-db/src/apply_change.rs`
- Parse-under-edit architecture and cancellation model: `docs/book/src/contributing/architecture.md`

## Non-Negotiable Invariants

1. One mutable host mutates input state.
2. Every read request binds to exactly one `snapshotId`.
3. Revisions are monotonic and globally ordered.
4. Canceled or superseded work never publishes outputs.
5. Query-layer DTOs are protocol-agnostic.
6. Query execution is deterministic for identical `(snapshotId, query, params)`.
7. Query code performs no ad-hoc filesystem or process IO.
8. Parsing under active edits never hard-fails; degraded syntax still yields structured results + diagnostics.
9. Request handling remains stateless across restarts; follow-up requests include full context.
10. Per-request failures are contained and never crash the serving loop.

## Known Fragility to Eliminate

- Ack-only cancellation path in `packages/pike-lsp-server/src/features/advanced/moniker.ts`.
- Shared mutable singleton services in `packages/pike-lsp-server/src/server.ts`.
- Protocol types in core model in `packages/pike-lsp-server/src/core/types.ts`.
- Duplicated diagnostics pipelines:
  - `packages/pike-lsp-server/src/features/diagnostics.ts`
  - `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Runtime `as any` boundary escapes in server/bridge-facing code.

## Target Architecture

### Layer 0: VS Code Client Runtime

- Owns extension lifecycle as a single context object, not global mutable state.
- Validates server binary and runtime environment before LanguageClient startup.
- Uses explicit start/stop/restart/dispose state machine with command gating.
- Applies client middleware guards for post-dispose events and controlled config sync.
- Surfaces server health/status and restart actions through explicit UX controls.
- Keeps editor-side bridge responsibilities strictly transport/lifecycle only.

### Layer 1: TS LSP Adapter

- Owns LSP wire protocol and capability registration.
- Maps LSP requests into engine protocol calls.
- Maps engine DTOs into LSP DTOs.
- Applies stale-response dropping using `snapshotIdUsed`.

### Layer 2: Bridge Transport

- Owns process lifecycle, request framing, correlation ids.
- Owns timeout policy and wire-level retries.
- Does not own semantic caches or query logic.

### Layer 3: Pike Query Engine

- `PikeAnalysisHost` (mutable inputs + revision clock).
- `PikeAnalysis` (immutable snapshot handle).
- Query modules:
  - input/base state
  - parse/index
  - name resolution
  - semantics
  - IDE projections
- Parse behavior under edit loop:
  - parser tolerates incomplete/broken text and returns best-effort tree + errors
  - incremental updates reparse only affected scope where possible
  - stale parse/semantic work is cancelled and never published

## Migration Strategy

### Phase 0 - Contract and Visibility

- Finalize protocol v2 contract.
- Add request/snapshot/revision telemetry.
- Add shadow mode harness (current pipeline vs query pipeline diff).

Exit criteria:

- All query responses include snapshot metadata.
- Baseline p50/p95 and memory profiles established.

### Phase 1 - Host/Snapshot Foundation

- Introduce host and immutable snapshot API in Pike.
- Route one read path through snapshot model.
- Define and test parse-under-edit resilience contract (incomplete text still produces usable structured output).

Exit criteria:

- Snapshot/revision monotonic tests pass.
- Parse-under-edit tests pass for incomplete/broken intermediate states.

### Phase 2 - Real Cancellation

- Propagate cancellation TS -> bridge -> Pike.
- Add cooperative cancellation checkpoints in long-running Pike query paths.

Exit criteria:

- No post-cancel publication in stress tests.

### Phase 3 - Diagnostics Vertical Slice

- Migrate diagnostics to query pipeline.
- Keep one canonical diagnostics path.

Exit criteria:

- Shadow diff threshold met.
- Diagnostics p95 non-regressing vs baseline.

### Phase 4 - Navigation Vertical Slice

- Migrate definition and references to shared query pipeline.

Exit criteria:

- Parity and p95 goals pass in canary.

### Phase 5 - Completion Vertical Slice

- Migrate completion pipeline.

Exit criteria:

- Typing-loop latency targets met.

### Phase 6 - Decommission Fragile Paths

- Remove legacy TS semantic caches and duplicate handlers.
- Remove runtime `as any` semantic boundary escapes.

Exit criteria:

- TS semantic ownership reduced to adapter-only.

### Phase 7 - VS Code Bridge Hardening

- Introduce single runtime context lifecycle manager in `packages/vscode-pike`.
- Replace global mutable extension state with owned lifecycle state.
- Add bootstrap validation for server binary and environment pre-start.
- Add middleware guards for disposed-client file/config events.
- Add explicit health/status wiring for start/stop/restart UX.

Exit criteria:

- Extension restart/dispose resilience tests pass under repeated cycles.
- No post-dispose request/event restart leaks observed in integration tests.
- Bridge lifecycle ownership model documented and enforced in code review.

### Phase 8 - Scheduler and Incremental Performance Parity

- Introduce explicit request classes in TS adapter and bridge queues (`typing`, `interactive`, `background`).
- Add queue coalescing/debouncing for high-frequency edit/config/fs notifications.
- Add cancellation checkpoints in all expensive Pike parse/semantic loops.
- Enforce fine-grained invalidation so body edits avoid unnecessary global recompute.
- Add performance regression gates for p95 latency, queue wait, cancel-stop, and parse hard-fail rate.
- Add restart-safe request statelessness checks for resolve/follow-up requests.
- Add reload-storm resilience tests (workspace/config/fs bursts) with debounce/coalescing assertions.
- Add representative benchmark corpus (small/medium/large workspaces) and pin it for CI comparisons.
- Add per-request failure-containment tests for migrated features.

Exit criteria:

- Queue-wait p95 is within agreed envelope for typing-path requests.
- Cancel-stop latency meets budget under rapid edit stress.
- Parse hard-fail rate remains 0 under rapid malformed-edit fixtures.
- Incremental invalidation coverage proves local edits avoid global recompute in target scenarios.
- Follow-up request correctness is preserved across restart/dispose boundaries.
- Reload-storm scenarios stay within latency/error envelopes.

## Goals and Milestones

### Short Term (0-6 weeks)

- Lock protocol v2 and architecture invariants.
- Ship host/snapshot skeleton and cancellation plumbing.
- Deliver diagnostics vertical slice behind flag.
- Add shadow diff and benchmark baseline.

Success signals:

- Zero stale publish in stress harness.
- Stable snapshot-tagging on all migrated responses.

### Mid Term (6-16 weeks)

- Migrate diagnostics, definition, references, then completion.
- Consolidate duplicate fallback scan logic into shared query paths.
- Remove protocol leakage from core model and runtime boundary escapes.
- Align VS Code extension bridge lifecycle with rust-analyzer-grade reliability model.

Success signals:

- Feature parity thresholds met in shadow mode.
- p95 non-regression across migrated features.
- Memory growth remains bounded during edit loops.

### Long Term (4-12 months)

- Make query engine default-on.
- Enforce SLO/perf gates in CI.
- Stabilize engine contract versioning and runbooks.
- Keep scheduler/invalidation policies under regression tests and canary telemetry.

Success signals:

- Sustained latency and memory SLO compliance.
- Low regression rate tied to invalidation/cancellation.

## Risks and Mitigations

- Boundary creep back into TS semantics.
  - Mitigation: strict module ownership and architecture checks.
- Over-fine invalidation too early.
  - Mitigation: coarse first, optimize based on profiling traces.
- Hidden dual state.
  - Mitigation: enforce Pike-authoritative input ownership.
- Transport overhead in hot path.
  - Mitigation: compact DTOs, batch where safe, measure continuously.

## Acceptance Criteria for Full Cutover

- All core requests execute against immutable snapshots.
- End-to-end cancellation is effective and observable.
- No duplicate semantic pipelines remain active.
- Core model is protocol-agnostic below adapter boundary.
- CI perf and correctness gates pass at default-on rollout.
- VS Code extension bridge lifecycle is deterministic across start/stop/restart/dispose.
- Active-edit parsing remains responsive and non-fatal across rapid typing/deletion loops.
- Scheduler fairness and latency budgets are enforced by CI/canary perf gates.
