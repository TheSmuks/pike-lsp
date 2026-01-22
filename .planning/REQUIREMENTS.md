# Requirements: Pike LSP v3.0 Performance Optimization

**Defined:** 2026-01-22
**Core Value:** Reduce intellisense latency for faster developer feedback

## v3 Requirements

Requirements for performance optimization milestone. Each maps to roadmap phases.

### Benchmarking

- [ ] **BENCH-01**: Benchmark measures document validation latency (time from change to diagnostics)
- [ ] **BENCH-02**: Benchmark measures hover response latency (time from hover to tooltip)
- [ ] **BENCH-03**: Benchmark measures completion response latency
- [ ] **BENCH-04**: Benchmark measures cold start time (extension activation to first response)
- [ ] **BENCH-05**: Benchmark runs automatically in CI to track regressions
- [ ] **BENCH-06**: Benchmark produces before/after comparison report

### Request Consolidation

- [ ] **CONS-01**: Pike analyzer exposes unified `analyze` method combining introspect/parse/diagnostics
- [ ] **CONS-02**: Unified analyze returns parse tree, symbols, and diagnostics in single response
- [ ] **CONS-03**: LSP server uses single Pike call per document validation (not 3+)
- [ ] **CONS-04**: JSON-RPC interface remains backward compatible for existing methods
- [ ] **CONS-05**: Validation pipeline updated to use consolidated response

### Caching - Symbol Positions

- [ ] **CACHE-01**: Symbol positions cached per document (avoid recalculation on each validation)
- [ ] **CACHE-02**: Symbol position cache invalidated on document change
- [ ] **CACHE-03**: Position lookup uses cached data instead of IPC call + regex fallback

### Caching - Compilation Results

- [ ] **CACHE-04**: Compilation results reused across introspect/parse/analyze for same document
- [ ] **CACHE-05**: Cache keyed by document content hash (not URI alone)
- [ ] **CACHE-06**: Cache has configurable memory limit with LRU eviction

### Caching - Cross-File

- [ ] **CACHE-07**: Imported/inherited files cached to avoid re-compilation
- [ ] **CACHE-08**: Cross-file cache invalidated when dependency file changes
- [ ] **CACHE-09**: Dependency graph tracks which files import which

### Stdlib Performance

- [ ] **STDLIB-01**: Stdlib types load without triggering "Parent lost" crashes
- [ ] **STDLIB-02**: Common stdlib modules (Stdio, String, Array) available for hover/completion
- [ ] **STDLIB-03**: First hover on stdlib type responds in <500ms (not 1+ seconds)
- [ ] **STDLIB-04**: Alternative preload strategy uses .pmd parsing instead of introspection

### Startup Optimization

- [x] **START-01**: Pike subprocess starts in <500ms (currently ~1000ms)
- [x] **START-02**: Module instantiation is lazy (only create what's needed)
- [x] **START-03**: Module path setup happens once (not on every request)

### Pike-Side Compilation Caching

(In-memory only - subprocess dies with VSCode, no persistence across restarts)

- [ ] **PIKE-01**: Pike subprocess caches compiled programs between requests (within session)
- [ ] **PIKE-02**: Cache keyed by file path + content hash (avoid recompiling unchanged code)
- [ ] **PIKE-03**: Cache invalidated when file content changes
- [ ] **PIKE-04**: Inherited/imported programs reused from cache

### Responsiveness

- [ ] **RESP-01**: Default diagnostic delay optimized for typing speed (measure optimal value)
- [ ] **RESP-02**: Diagnostic delay configurable via settings
- [ ] **RESP-03**: Debouncing prevents CPU thrashing during rapid typing

## Future Requirements

Deferred to later milestone. Tracked but not in v3 roadmap.

### Advanced Caching

- **CACHE-F01**: Persistent cache across server restarts (file-based or embedded DB)
- **CACHE-F02**: Cache statistics/telemetry for tuning

### Advanced Startup

- **START-F01**: Pre-warm Pike subprocess before first request
- **START-F02**: Parallel workspace indexing

### Advanced Responsiveness

- **RESP-F01**: Adaptive debouncing based on file size
- **RESP-F02**: Adaptive debouncing based on typing patterns

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Worker thread parallelization | High complexity, defer to v4 if needed |
| Incremental parsing | Would require parser rewrite, not worth ROI |
| Request deduplication key redesign | Medium impact, defer to v4 |
| Memory management tuning | Lower priority than latency |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BENCH-01 | Phase 10 | Complete |
| BENCH-02 | Phase 10 | Complete |
| BENCH-03 | Phase 10 | Complete |
| BENCH-04 | Phase 10 | Complete |
| BENCH-05 | Phase 10 | Complete |
| BENCH-06 | Phase 10 | Complete |
| START-01 | Phase 11 | Complete |
| START-02 | Phase 11 | Complete |
| START-03 | Phase 11 | Complete |
| CONS-01 | Phase 12 | Pending |
| CONS-02 | Phase 12 | Pending |
| CONS-03 | Phase 12 | Pending |
| CONS-04 | Phase 12 | Pending |
| CONS-05 | Phase 12 | Pending |
| PIKE-01 | Phase 13 | Pending |
| PIKE-02 | Phase 13 | Pending |
| PIKE-03 | Phase 13 | Pending |
| PIKE-04 | Phase 13 | Pending |
| CACHE-01 | Phase 14 | Pending |
| CACHE-02 | Phase 14 | Pending |
| CACHE-03 | Phase 14 | Pending |
| CACHE-04 | Phase 14 | Pending |
| CACHE-05 | Phase 14 | Pending |
| CACHE-06 | Phase 14 | Pending |
| CACHE-07 | Phase 15 | Pending |
| CACHE-08 | Phase 15 | Pending |
| CACHE-09 | Phase 15 | Pending |
| STDLIB-01 | Phase 16 | Pending |
| STDLIB-02 | Phase 16 | Pending |
| STDLIB-03 | Phase 16 | Pending |
| STDLIB-04 | Phase 16 | Pending |
| RESP-01 | Phase 17 | Pending |
| RESP-02 | Phase 17 | Pending |
| RESP-03 | Phase 17 | Pending |

**Coverage:**
- v3 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-01-22*
*Last updated: 2026-01-22 after roadmap creation*
