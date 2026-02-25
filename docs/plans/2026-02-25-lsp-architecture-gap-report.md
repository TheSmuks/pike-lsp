# LSP Architecture Report: Current State, Gaps, and Improvements

**Date:** 2026-02-25  
**Scope:** `packages/pike-lsp-server`, `packages/vscode-pike`, selected test suites, and external LSP references  
**Method:** Repository-wide grep/ast-grep scans, focused source reads, test evidence review, and official LSP/VS Code guidance comparison

---

## Executive Summary

The Pike LSP implementation is already strong in feature breadth and modularization. It has a centralized lifecycle shell, clear feature domains, query-engine contract pinning, and non-trivial stress/performance tests. The main architectural debt is concentrated in a few high-impact areas: cross-file hierarchy completeness, RXML workspace-scan scalability, semantic tokens delta strategy, and uneven protocol-compliance testing quality.

Overall maturity is best described as **production-capable with targeted reliability/performance gaps** rather than a foundational architecture issue.

---

## Architecture Snapshot

### Runtime and Layering

1. VS Code client activation and language client wiring are managed in `packages/vscode-pike/src/extension.ts`.
2. LSP server lifecycle, capability advertisement, and feature registration are centralized in `packages/pike-lsp-server/src/server.ts`.
3. Query engine protocol compatibility is explicitly version-gated in `packages/pike-lsp-server/src/query-engine/contracts.ts`.
4. Bridge orchestration and engine forwarding live in `packages/pike-lsp-server/src/services/bridge-manager.ts`.
5. Request scheduling/coalescing priorities are implemented in `packages/pike-lsp-server/src/services/request-scheduler.ts`.

### Feature Topology

Feature domains are separated under `packages/pike-lsp-server/src/features/`:

- Navigation, editing, diagnostics, hierarchy, advanced providers, Roxen, and RXML modules.
- Capability surface is broad (hover/definition/references/completion/signature help/rename/hierarchy/semantic tokens/code actions/formatting/code lens/inlay hints/etc.) as reflected by `packages/pike-lsp-server/src/server.ts` and validated in `packages/pike-lsp-server/src/tests/unhandled-methods.test.ts`.

### Test Topology

- Runtime provider registration tests exist (e.g. completion/resolve, codeLens/resolve, semantic tokens handlers) in `packages/pike-lsp-server/src/tests/runtime-protocol-compliance.test.ts` and related advanced tests.
- Query-engine cancellation stress and performance gates are explicit in:
  - `packages/pike-lsp-server/src/tests/query-engine-cancel-stress.test.ts`
  - `packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`
- End-to-end feature coverage through VS Code command surface exists in `packages/vscode-pike/src/test/integration/lsp-features.test.ts`.

---

## Strengths

### 1) Clear lifecycle ownership and capability handshake

- Single primary initialization/registration path in `packages/pike-lsp-server/src/server.ts` reduces hidden control flow and matches common `vscode-languageserver` patterns.

### 2) Explicit query-engine protocol contracts

- Protocol ID and major-version compatibility checks in `packages/pike-lsp-server/src/query-engine/contracts.ts` reduce integration drift risk.

### 3) Practical cancellation and supersession handling

- Diagnostics and completion paths already use request IDs and cancellation forwarding:
  - `packages/pike-lsp-server/src/features/diagnostics/index.ts`
  - `packages/pike-lsp-server/src/features/editing/completion.ts`
- Stress validation confirms “latest request wins” behavior under repeated supersession in `packages/pike-lsp-server/src/tests/query-engine-cancel-stress.test.ts`.

### 4) Operationally meaningful perf gates

- Queue wait p95 and cancel-stop latency budgets are asserted in `packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts`, which is stronger than purely unit-level correctness checks.

### 5) Client-level E2E regression visibility

- The VS Code integration suite (`packages/vscode-pike/src/test/integration/lsp-features.test.ts`) verifies real command endpoints and catches null/undefined regressions at the UX boundary.

---

## Gaps and Risks

## P0 (Highest): Cross-file hierarchy is known-incomplete

Evidence:

- `packages/pike-lsp-server/src/tests/hierarchy/cross-file-hierarchy.test.ts` contains explicit failing/not-implemented scenarios for:
  - cross-file supertypes
  - multi-level cross-file inheritance traversal
  - circular cross-file inheritance detection

Impact:

- Type hierarchy correctness degrades on real multi-file projects.
- Users receive partial or misleading hierarchy graphs.
- Risk of confidence erosion in navigation features despite broad capability advertisement.

## P1: RXML definition/reference providers rely on broad workspace scans

Evidence:

- `packages/pike-lsp-server/src/features/rxml/definition-provider.ts` and `packages/pike-lsp-server/src/features/rxml/references-provider.ts` use glob + full file reads over workspace files.
- Current TTL caches mitigate repeated scans but do not remove O(workspace file count) pressure for cold paths and invalidation-heavy workflows.

Impact:

- Latency spikes on larger workspaces.
- Potential CPU/IO contention under frequent requests.
- Reduced responsiveness for definition/references in mixed Roxen/RXML environments.

## P1: Semantic tokens delta is effectively full-replacement

Evidence:

- `packages/pike-lsp-server/src/features/advanced/semantic-tokens.ts` registers `onDelta`, but returns replacement edits computed from full tokens each time.

Impact:

- Correctness is preserved, but incremental bandwidth/compute advantages are mostly unrealized.
- Increased churn on frequent edits in large documents.

## P2: Protocol compliance tests include weak signal sections

Evidence:

- `packages/pike-lsp-server/src/tests/unhandled-methods.test.ts` mixes capability assertions with documentation-style checks and placeholder semantics.
- Repository-wide TODO/placeholder test markers remain widespread in several suites.

Impact:

- Harder to distinguish strict runtime guarantees from descriptive tests.
- Potential false confidence when “passing” tests do not exercise behavior deeply.

---

## Improvement Plan (Prioritized)

### P0: Complete cross-file hierarchy using workspace graph-first resolution

Target outcome:

- Reliable supertypes/subtypes and circular detection across files/workspace.

Actions:

1. Build hierarchy resolution from indexed workspace symbols first, not ad-hoc per-request traversal.
2. Add deterministic cycle detection with explicit visited-path diagnostics.
3. Preserve current in-file behavior as fallback; avoid regressions for single-file cases.
4. Use existing failing tests in `packages/pike-lsp-server/src/tests/hierarchy/cross-file-hierarchy.test.ts` as hard acceptance gates.

Success criteria:

- All currently marked failing cross-file hierarchy tests pass.
- No regression in existing hierarchy providers and integration tests.

### P1: Replace RXML glob-scan request path with indexed lookup

Target outcome:

- Stable latency independent of total workspace file count in hot paths.

Actions:

1. Introduce/extend an RXML symbol/reference index keyed by URI and tag/defvar identifiers.
2. Update index incrementally on document open/change/close and workspace scans.
3. Retain controlled fallback scan for uncached cold starts, then hydrate index.
4. Add benchmarks for large workspace synthetic load.

Success criteria:

- Significant p95 reduction for RXML definition/reference requests on large workspaces.
- No loss in result completeness against current behavior.

### P1: Implement true semantic token delta tracking

Target outcome:

- Reduced token payload churn and improved incremental responsiveness.

Actions:

1. Track prior token snapshots per document/resultId.
2. Compute minimal edit deltas rather than full replacement edits.
3. Expire snapshot state safely on close/version reset.

Success criteria:

- Lower average delta payload size.
- No correctness regressions in semantic token tests and editor behavior.

### P2: Harden protocol-compliance test signal

Target outcome:

- Tests represent runtime guarantees, not documentation placeholders.

Actions:

1. Split capability-surface tests from runtime behavior tests.
2. Replace placeholder assertions with concrete request/response path checks.
3. Track and progressively retire TODO-heavy suites with explicit owners/milestones.

Success criteria:

- Improved confidence that passing protocol tests map to actual runtime behavior.

---

## Suggested Milestone Sequence

1. **Milestone A (P0):** Cross-file hierarchy completion + failing-tests closure.
2. **Milestone B (P1):** RXML indexing refactor and latency baselining.
3. **Milestone C (P1):** Semantic token delta state/diff implementation.
4. **Milestone D (P2):** Protocol test suite hygiene and signal hardening.

---

## External Best-Practice Alignment Notes

Compared against common `vscode-languageserver` and LSP 3.17 patterns:

- Current architecture already aligns on centralized `onInitialize` capability negotiation, TextDocument synchronization patterns, and request/notification separation.
- The biggest delta from mature servers is not feature breadth but **behavior depth under scale** (indexing and true incrementalism) and **strictness of behavior-focused protocol tests**.

Primary references used:

- LSP specification 3.17 (`microsoft.github.io/language-server-protocol`)
- VS Code Language Server Extension Guide (`code.visualstudio.com`)
- Microsoft `vscode` and `vscode-extension-samples` LSP server patterns

---

## Conclusion

Pike LSP has a solid modular architecture and meaningful reliability/performance scaffolding. The highest-value investment is to complete cross-file hierarchy correctness and move remaining scan-heavy/incremental-lite paths toward index-driven and truly incremental behavior. That combination will materially improve correctness confidence and large-workspace responsiveness without requiring a major architectural rewrite.
