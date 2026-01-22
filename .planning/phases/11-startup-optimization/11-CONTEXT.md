# Phase 11: Startup Optimization - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

## Phase Boundary

Reduce Pike subprocess startup time to under 500ms through strategic module loading, eliminating redundant initialization work, and ensuring module path setup happens exactly once per session. This phase focuses purely on cold start optimization — caching, request consolidation, and stdlib improvements are handled in later phases.

## Implementation Decisions

### Module Loading Strategy
- **Hybrid approach**: Preload critical modules, lazy load others
- **Critical modules to preload**: Analysis (parsing, symbols, diagnostics) + Navigation (go-to-definition, references)
- **Lazy load modules**: Refactoring, code lens, and other rare features
- **Detection method**: JSON-RPC method name mapping — explicit mapping from method names to required modules
- **Lifetime**: Once a lazy-loaded module is loaded, it stays loaded for the session
- **Trigger behavior**: If a legacy method triggers an unloaded module, load synchronously and block the request until ready

### Initialization Path Setup
- **Idempotent setup function**: Can be called multiple times but only performs work once
- **Configuration source hierarchy**:
  1. VSCode settings (primary source - expose module paths in settings)
  2. Environment variables (fallback)
  3. Standard Pike locations (final fallback)
- **Failure handling - tiered startup logic**:
  - Attempt configured paths from VSCode settings
  - Fall back to environment variables
  - Fall back to standard Pike locations
  - Classify result:
    - **Core modules missing → FAIL FAST**: Exit with error if parser/analyzer core cannot load or structural errors occur
    - **Optional modules missing → WARN + CONTINUE**: Log warning if formatting, linting, or niche features fail but language basics work
- **Startup timing**: JSON-RPC server starts listening immediately; `initialize` handler runs idempotent path setup, validates core modules, applies VSCode configuration, then returns InitializeResult

### Performance Measurement Approach
- **Always-on (production)**: Phase-level timings with single emission during startup
  - Phases: `startup.total`, `startup.path_setup`, `startup.core_modules`, `startup.initialize`, `startup.ready`
  - Disabled or summarized by default unless debug logging enabled
- **On-demand (debug builds)**: Temporary fine-grained timers around suspicious phases, removed once bottleneck is identified
- **Data flow**:
  1. Collect timings internally in structured object
  2. Emit once as `_perf` metadata
  3. Emit as formatted table in output (debug level)
  4. VSCode command to re-render last collected data on demand
- **Baseline**: Use Phase 10 benchmark as official baseline + local before/after measurements for development
- **Profiling**:
  - Primary: Manual instrumentation using phase timers (always-on during startup optimization)
  - Escalation: Pike profiler enabled temporarily when phase timing shows unclear bottlenecks or optimizations plateau

### Backward Compatibility
- **Soft compatibility**: Existing JSON-RPC methods (introspect, parse, analyzeUninitialized) must work, but performance characteristics may change (e.g., lazy load delays are acceptable)
- **Lazy module loading**: Load synchronously when triggered, blocking the request until module is ready
- **Version behavior**: Opaque — clients don't need version information as changes are implementation details
- **Testing**: Both unit tests (speed) and E2E tests (integration confidence)

### Claude's Discretion
- Exact phase boundary names and timer granularity
- VSCode command name and UI for viewing startup metrics
- Specific error message wording for fail-fast vs warning scenarios
- Threshold for "debug" logging enablement

## Specific Ideas

- "Fail fast when the LSP cannot function" — user should know immediately if core modules are missing
- "Graceful degradation when only advanced features are affected" — pair with `window/showErrorMessage` for fatal issues, `window/showWarningMessage` for degraded mode
- JSON-RPC method name → module mapping should be explicit and clear
- Tiered fallback for path configuration gives robustness without requiring user setup

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 11-startup-optimization*
*Context gathered: 2026-01-22*
