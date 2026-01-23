# Phase 17: Responsiveness Tuning - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

## Phase Boundary

Optimize debouncing behavior and validate overall performance improvements against Phase 10 baseline. Configure diagnostic delay settings, add user configuration option, verify debouncing prevents CPU thrashing, and run final benchmark comparison with baseline.

## Implementation Decisions

### Diagnostic Delay Optimization
- Set static 250ms default delay (not adaptive to file size or workspace)
- New default replaces existing value; 250ms chosen as moderate between responsiveness and CPU
- Measure impact of change: benchmark before/after to show effect on CPU and responsiveness
- Static approach keeps Phase 17 scoped as tuning, not redesign

### User Configuration
- Setting key: `pike.diagnosticDelay` (language section, not server section)
- Validation: 50-2000ms bounds, reject invalid values with warning, fall back to default
- UI: Basic number input field with ms suffix in description
- Validates + warns on out-of-bounds values

### Debouncing Verification
- Rapid typing test: 10 keystrokes/second for 5 seconds (fast typist simulation)
- CPU thrashing metric: No sustained spikes >100ms duration during rapid typing
- Temporal behavior pattern matters more than absolute CPU percentage
- Success: Bursty-but-bounded CPU, never oscillating continuously while typing
- Verification: Both automated E2E test (CI) and manual test procedure (local)

### Final Benchmark Reporting
- Format: Executive summary paragraph + detailed appendix
- Source: JSON output from benchmark runner + Markdown documentation
- Executive summary includes: Core LSP metrics (startup, first hover, validation latency, cache hit rate) + Responsiveness metrics (diagnostic delay impact, CPU during typing)
- Full benchmark suite in appendix: startup, validation, compilation cache, stdlib, responsiveness

### Claude's Discretion
- Exact wording of warning messages for invalid configuration values
- Detailed benchmark formatting and presentation in Markdown
- Specific implementation of rapid typing simulation in E2E tests

## Specific Ideas

- "250ms feels right — not instant but not sluggish"
- CPU thrashing is about pattern (temporal), not peak percentage
- Static over clever: predictability matters more than adaptive sophistication at this stage

## Deferred Ideas

- **Bun migration** — Migrate from Node/pnpm to Bun runtime, replace Mocha with bun test, benchmark before/after to measure performance gain
  - Rationale: This is a runtime/tooling change, not responsiveness tuning
  - Belongs in: Future phase or separate milestone

---

*Phase: 17-responsiveness-tuning*
*Context gathered: 2026-01-23*
