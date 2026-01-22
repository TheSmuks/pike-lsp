# Roadmap: Pike LSP v3.0 Performance Optimization

## Overview

This milestone delivers measurable performance improvements to Pike LSP by establishing baseline metrics, then systematically optimizing startup, request consolidation, caching, and responsiveness. Each optimization phase builds on previous work, with benchmarking at both ends to validate improvements.

## Milestones

- v1.0 Pike Refactoring (Phases 1-4) - Shipped 2026-01-20
- v2.0 LSP Modularization (Phases 5-9) - Shipped 2026-01-21
- v3.0 Performance Optimization (Phases 10-17) - In Progress

## Phases

- [ ] **Phase 10: Benchmarking Infrastructure** - Establish baseline metrics before optimization
- [ ] **Phase 11: Startup Optimization** - Reduce Pike subprocess startup time
- [ ] **Phase 12: Request Consolidation** - Combine multiple Pike calls into one
- [ ] **Phase 13: Pike-Side Compilation Caching** - Cache compiled programs in Pike subprocess
- [ ] **Phase 14: TypeScript-Side Caching** - Cache symbol positions and compilation results
- [ ] **Phase 15: Cross-File Caching** - Cache imported/inherited files with dependency tracking
- [ ] **Phase 16: Stdlib Performance** - Fix stdlib loading without crashes
- [ ] **Phase 17: Responsiveness Tuning** - Optimize debouncing and measure final improvements

## Phase Details

### Phase 10: Benchmarking Infrastructure
**Goal**: Establish baseline performance metrics to measure optimization impact
**Depends on**: Nothing (first phase of v3)
**Requirements**: BENCH-01, BENCH-02, BENCH-03, BENCH-04, BENCH-05, BENCH-06
**Success Criteria** (what must be TRUE):
  1. Developer can run benchmark suite and see latency numbers for validation, hover, and completion
  2. CI automatically runs benchmarks and fails if regression exceeds threshold
  3. Benchmark report shows before/after comparison when changes are made
  4. Cold start time is measured and reported
**Plans**: 3 plans

Plans:
- [ ] 10-01-PLAN.md — Pike Instrumentation & Mitata Setup
- [ ] 10-02-PLAN.md — LSP Core Benchmarks & Fixtures
- [ ] 10-03-PLAN.md — CI Regression Tracking
- [ ] 10-01: TBD

### Phase 11: Startup Optimization
**Goal**: Reduce Pike subprocess startup time to under 500ms
**Depends on**: Phase 10 (need baseline to measure improvement)
**Requirements**: START-01, START-02, START-03
**Success Criteria** (what must be TRUE):
  1. Pike subprocess starts in under 500ms (measured by benchmark)
  2. Module instantiation only occurs when needed (lazy loading verified)
  3. Module path setup happens exactly once per session
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

### Phase 12: Request Consolidation
**Goal**: Reduce Pike IPC calls from 3+ per validation to 1
**Depends on**: Phase 11 (startup optimization complete)
**Requirements**: CONS-01, CONS-02, CONS-03, CONS-04, CONS-05
**Success Criteria** (what must be TRUE):
  1. Single `analyze` method returns parse tree, symbols, and diagnostics together
  2. Validation pipeline makes exactly one Pike call per document change
  3. Existing JSON-RPC methods (introspect, parse, etc.) still work for backward compatibility
  4. Benchmark shows measurable latency reduction
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

### Phase 13: Pike-Side Compilation Caching
**Goal**: Avoid recompiling unchanged code in Pike subprocess
**Depends on**: Phase 12 (consolidated requests make caching more effective)
**Requirements**: PIKE-01, PIKE-02, PIKE-03, PIKE-04
**Success Criteria** (what must be TRUE):
  1. Second request for same unchanged file is faster than first (cache hit)
  2. Modified file triggers recompilation (cache invalidation works)
  3. Inherited/imported programs are reused from cache
  4. Cache persists within session but clears on VSCode restart
**Plans**: TBD

Plans:
- [ ] 13-01: TBD

### Phase 14: TypeScript-Side Caching
**Goal**: Cache symbol positions and compilation results in LSP server
**Depends on**: Phase 13 (Pike-side caching reduces what needs TypeScript caching)
**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-04, CACHE-05, CACHE-06
**Success Criteria** (what must be TRUE):
  1. Symbol position lookup uses cached data (no IPC call or regex fallback)
  2. Cache invalidates when document content changes
  3. Compilation results are reused for same content hash
  4. Cache respects memory limit and evicts least-recently-used entries
**Plans**: TBD

Plans:
- [ ] 14-01: TBD

### Phase 15: Cross-File Caching
**Goal**: Cache imported/inherited files with dependency tracking
**Depends on**: Phase 14 (builds on TypeScript caching infrastructure)
**Requirements**: CACHE-07, CACHE-08, CACHE-09
**Success Criteria** (what must be TRUE):
  1. Imported/inherited files are cached across document validations
  2. Changing a dependency file invalidates dependent files' caches
  3. Dependency graph accurately tracks import relationships
**Plans**: TBD

Plans:
- [ ] 15-01: TBD

### Phase 16: Stdlib Performance
**Goal**: Make stdlib types available without crashes or long delays
**Depends on**: Phase 15 (caching infrastructure helps with stdlib caching)
**Requirements**: STDLIB-01, STDLIB-02, STDLIB-03, STDLIB-04
**Success Criteria** (what must be TRUE):
  1. Stdlib modules load without "Parent lost" crashes
  2. Hover on common stdlib types (Stdio, String, Array) shows documentation
  3. First hover on stdlib type responds in under 500ms
  4. Alternative preload via .pmd parsing is available if introspection fails
**Plans**: TBD

Plans:
- [ ] 16-01: TBD

### Phase 17: Responsiveness Tuning
**Goal**: Optimize debouncing and validate overall performance improvement
**Depends on**: Phase 16 (all optimizations complete, ready for final tuning)
**Requirements**: RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. Default diagnostic delay is optimized based on benchmark measurements
  2. User can configure diagnostic delay via settings
  3. Rapid typing does not cause CPU thrashing (debouncing works)
  4. Final benchmark shows measurable improvement over Phase 10 baseline
**Plans**: TBD

Plans:
- [ ] 17-01: TBD

## Progress

**Execution Order:** Phases 10 through 17 in sequence.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 10. Benchmarking Infrastructure | 0/3 | Not started | - |
| 11. Startup Optimization | 0/TBD | Not started | - |
| 12. Request Consolidation | 0/TBD | Not started | - |
| 13. Pike-Side Compilation Caching | 0/TBD | Not started | - |
| 14. TypeScript-Side Caching | 0/TBD | Not started | - |
| 15. Cross-File Caching | 0/TBD | Not started | - |
| 16. Stdlib Performance | 0/TBD | Not started | - |
| 17. Responsiveness Tuning | 0/TBD | Not started | - |

---
*Roadmap created: 2026-01-22*
*Milestone: v3.0 Performance Optimization*
