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

## Non-Negotiable Invariants

1. One mutable host mutates input state.
2. Every read request binds to exactly one `snapshotId`.
3. Revisions are monotonic and globally ordered.
4. Canceled or superseded work never publishes outputs.
5. Query-layer DTOs are protocol-agnostic.
6. Query execution is deterministic for identical `(snapshotId, query, params)`.
7. Query code performs no ad-hoc filesystem or process IO.

## Known Fragility to Eliminate

- Ack-only cancellation path in `packages/pike-lsp-server/src/features/advanced/moniker.ts`.
- Shared mutable singleton services in `packages/pike-lsp-server/src/server.ts`.
- Protocol types in core model in `packages/pike-lsp-server/src/core/types.ts`.
- Duplicated diagnostics pipelines:
  - `packages/pike-lsp-server/src/features/diagnostics.ts`
  - `packages/pike-lsp-server/src/features/diagnostics/index.ts`
- Runtime `as any` boundary escapes in server/bridge-facing code.

## Target Architecture

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

Exit criteria:

- Snapshot/revision monotonic tests pass.

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

Success signals:

- Feature parity thresholds met in shadow mode.
- p95 non-regression across migrated features.
- Memory growth remains bounded during edit loops.

### Long Term (4-12 months)

- Make query engine default-on.
- Enforce SLO/perf gates in CI.
- Stabilize engine contract versioning and runbooks.

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
