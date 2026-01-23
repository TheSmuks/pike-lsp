# Requirements: Pike LSP v3.0 Performance Optimization

**Defined:** 2026-01-22
**Core Value:** Reduce intellisense latency for faster developer feedback

## v3 Requirements

Requirements for performance optimization milestone. Each maps to roadmap phases.

### Benchmarking

- [x] **BENCH-01**: Benchmark measures document validation latency (time from change to diagnostics)
- [x] **BENCH-02**: Benchmark measures hover response latency (time from hover to tooltip)
- [x] **BENCH-03**: Benchmark measures completion response latency
- [x] **BENCH-04**: Benchmark measures cold start time (extension activation to first response)
- [x] **BENCH-05**: Benchmark runs automatically in CI to track regressions
- [x] **BENCH-06**: Benchmark produces before/after comparison report

### Request Consolidation

- [x] **CONS-01**: Pike analyzer exposes unified `analyze` method combining introspect/parse/diagnostics
- [x] **CONS-02**: Unified analyze returns parse tree, symbols, and diagnostics in single response
- [x] **CONS-03**: LSP server uses single Pike call per document validation (not 3+)
- [x] **CONS-04**: JSON-RPC interface remains backward compatible for existing methods
- [x] **CONS-05**: Validation pipeline updated to use consolidated response

### Caching - Symbol Positions

- [x] **CACHE-01**: Symbol positions cached per document (avoid recalculation on each validation)
- [x] **CACHE-02**: Symbol position cache invalidated on document change
- [x] **CACHE-03**: Position lookup uses cached data instead of IPC call + regex fallback

### Caching - Compilation Results

- [x] **CACHE-04**: Compilation results reused across introspect/parse/analyze for same document
- [x] **CACHE-05**: Cache keyed by document content hash (not URI alone)
- [x] **CACHE-06**: Cache has configurable memory limit with LRU eviction

### Caching - Cross-File

- [x] **CACHE-07**: Imported/inherited files cached to avoid re-compilation
- [x] **CACHE-08**: Cross-file cache invalidated when dependency file changes
- [x] **CACHE-09**: Dependency graph tracks which files import which

### Stdlib Performance

- [x] **STDLIB-01**: Stdlib types load without triggering "Parent lost" crashes
- [x] **STDLIB-02**: Common stdlib modules (Stdio, String, Array) available for hover/completion
- [x] **STDLIB-03**: First hover on stdlib type responds in <500ms (not 1+ seconds)
- [x] **STDLIB-04**: Alternative preload strategy uses .pmd parsing instead of introspection

### Startup Optimization

- [x] **START-01**: Pike subprocess starts in <500ms (currently ~1000ms)
- [x] **START-02**: Module instantiation is lazy (only create what's needed)
- [x] **START-03**: Module path setup happens once (not on every request)

### Pike-Side Compilation Caching

(In-memory only - subprocess dies with VSCode, no persistence across restarts)

- [x] **PIKE-01**: Pike subprocess caches compiled programs between requests (within session)
- [x] **PIKE-02**: Cache keyed by file path + content hash (avoid recompiling unchanged code)
- [x] **PIKE-03**: Cache invalidated when file content changes
- [x] **PIKE-04**: Inherited/imported programs reused from cache

### Responsiveness

- [x] **RESP-01**: Default diagnostic delay optimized for typing speed (measure optimal value)
- [x] **RESP-02**: Diagnostic delay configurable via settings
- [x] **RESP-03**: Debouncing prevents CPU thrashing during rapid typing

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
| CONS-01 | Phase 12 | Complete |
| CONS-02 | Phase 12 | Complete |
| CONS-03 | Phase 12 | Complete |
| CONS-04 | Phase 12 | Complete |
| CONS-05 | Phase 12 | Complete |
| PIKE-01 | Phase 13 | Complete |
| PIKE-02 | Phase 13 | Complete |
| PIKE-03 | Phase 13 | Complete |
| PIKE-04 | Phase 13 | Complete |
| CACHE-01 | Phase 14 | Complete |
| CACHE-02 | Phase 14 | Complete |
| CACHE-03 | Phase 14 | Complete |
| CACHE-04 | Phase 14 | Complete |
| CACHE-05 | Phase 14 | Complete |
| CACHE-06 | Phase 14 | Complete |
| CACHE-07 | Phase 15 | Complete |
| CACHE-08 | Phase 15 | Complete |
| CACHE-09 | Phase 15 | Complete |
| STDLIB-01 | Phase 16 | Complete |
| STDLIB-02 | Phase 16 | Complete |
| STDLIB-03 | Phase 16 | Complete |
| STDLIB-04 | Phase 16 | Complete |
| RESP-01 | Phase 17 | Complete |
| RESP-02 | Phase 17 | Complete |
| RESP-03 | Phase 17 | Complete |

**Coverage:**
- v3 requirements: 34 total
- Complete: 34
- Pending: 0

**All v3 requirements satisfied.** Milestone complete.

---
*Requirements defined: 2026-01-22*
*Last updated: 2026-01-23 after v3.0 completion*
