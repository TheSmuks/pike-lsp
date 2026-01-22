# Phase 10: Benchmarking Infrastructure - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Developer tooling for measuring LSP performance — establishing baseline metrics before optimization. This phase delivers benchmark tests, CI integration, and reporting to measure latency across all LSP operations.

</domain>

<decisions>
## Implementation Decisions

### Metrics coverage
- **Full breakdown granularity**: IPC + Pike compilation + analysis timing (not just end-to-end)
- **All LSP features**: Benchmark every operation the server supports (validation, hover, completion, go-to-definition, symbols, document highlights, code lens, etc.)
- **5 test scenarios**: Small file, medium file, large file, empty workspace, full workspace
- **Statistical variance**: Include standard deviation, min/max, median across multiple runs

### Output format
- **Dual format**: JSON for CI parsing, human-readable console table for local runs
- **Per-operation + summary**: Individual reports per operation with totals summary
- **Before/after comparison**: When baseline exists, show side-by-side with highlighted differences
- **--save-baseline flag**: Support saving current results as baseline for future comparison

### Regression detection
- **Threshold**: Claude's discretion (determine reasonable tolerance based on measured variance)
- **Critical operations**: Claude's discretion (decide which operations must pass vs optional)
- **Configurable thresholds**: Via config file or environment variable

### Test environment
- **Include Pike subprocess**: Benchmark Pike analyzer.pike in isolation too
- **Both fixture types**: Real Pike code fixtures for realism, synthetic code for edge cases
- **Run count**: Claude's discretion (determine based on statistical needs)
- **Test isolation**: Claude's discretion (balance isolation vs realism)

### Claude's Discretion
- Regression failure threshold (based on measured variance)
- Which operations are "critical" for regression checks
- Number of benchmark runs per test
- Whether tests use fresh LSP sessions or shared sessions

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for benchmark tooling.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-benchmarking-infrastructure*
*Context gathered: 2026-01-22*
