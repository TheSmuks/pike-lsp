# Codebase Concerns

**Analysis Date:** 2025-01-23

## Tech Debt

**Deprecated LSP Methods:**
- Issue: Pike analyzer maintains deprecated method endpoints (`parse`, `introspect`, `analyze_uninitialized`) that route to the unified `analyze` method with warnings
- Files: `pike-scripts/analyzer.pike` (lines 201-301)
- Impact: Code clutter, potential confusion for API consumers, maintenance burden
- Fix approach: Set deprecation timeline, add migration guide for consumers, remove deprecated methods after 2-3 release cycles

**Branch-Aware Control Flow Analysis Missing:**
- Issue: Uninitialized variable detection lacks branch-aware analysis (e.g., conditional initialization detection)
- Files: `packages/pike-bridge/src/bridge.test.ts` (line 249, skipped test), `pike-scripts/LSP.pmod/Analysis.pmod/Diagnostics.pike`
- Impact: False negatives for conditionally initialized variables, reduced diagnostic quality
- Fix approach: Implement control flow graph analysis with path-sensitive variable initialization tracking

**Stdlib Preloading Disabled:**
- Issue: Stdlib module preloading crashes when introspecting bootstrap modules (Stdio, String, Array, Mapping)
- Files: `packages/pike-lsp-server/src/server.ts` (lines 277-281)
- Impact: Modules loaded lazily on-demand, causing potential latency for first-time stdlib symbol requests
- Fix approach: Implement safe introspection pattern that excludes bootstrap modules or uses whitelist-based preloading

**No Linting Configuration:**
- Issue: Project lacks ESLint, Prettier, or Biome configuration for code style enforcement
- Files: Project root, all packages
- Impact: Inconsistent code style across contributors, manual code review burden, potential bugs from inconsistent patterns
- Fix approach: Add ESLint + TypeScript ESLint with rules matching observed conventions, configure Prettier for formatting

## Known Bugs

**Bootstrap Module Circular Resolution:**
- Symptoms: 30-second timeout when resolving bootstrap modules (Stdio, String, Array, Mapping)
- Files: `pike-scripts/LSP.pmod/Intelligence.pike` (lines 23-34, BOOTSTRAP_MODULES constant)
- Trigger: Any introspection or resolution attempt on bootstrap modules
- Workaround: Bootstrap modules hardcoded in exclusion set, skipped during resolution
- Impact: Cannot provide type information for core Pike stdlib modules used internally by resolver

**Pike Subprocess Crash on Stdlib Introspection:**
- Symptoms: Pike subprocess crashes when introspecting bootstrap modules during preloading
- Files: `pike-scripts/analyzer.pike`, `packages/pike-lsp-server/src/server.ts`
- Trigger: Attempting to compile/resolve bootstrap modules used by master()->resolv()
- Workaround: Stdlib preloading disabled, modules loaded on-demand instead
- Impact: Slower first-time stdlib completions, but server remains stable

## Security Considerations

**No Request Rate Limiting:**
- Risk: Malicious client could send rapid requests causing resource exhaustion or DoS
- Files: `packages/pike-bridge/src/bridge.ts`, `packages/pike-lsp-server/src/server.ts`
- Current mitigation: Request timeout (30s default), inflight request deduplication
- Recommendations: Add per-client rate limiting, circuit breaker pattern for repeated timeouts

**No Request Validation:**
- Risk: Malformed or malicious requests could cause unexpected behavior
- Files: `packages/pike-bridge/src/bridge.ts` (sendRequest method)
- Current mitigation: Basic JSON-RPC parsing, timeout handling
- Recommendations: Add input validation for all params, sanitize file paths, add max payload size limits

**Subprocess Command Injection:**
- Risk: Pike executable path or analyzer path could be manipulated if not properly validated
- Files: `packages/pike-bridge/src/process.ts`, `packages/pike-bridge/src/bridge.ts`
- Current mitigation: Path validation in PikeProcess.spawn()
- Recommendations: Add explicit whitelist validation for executable paths, add unit tests for path sanitization

**Unvalidated Environment Variables:**
- Risk: Process environment variables passed to Pike subprocess without validation
- Files: `packages/pike-bridge/src/process.ts` (spawn method), `packages/pike-bridge/src/types.ts` (PikeBridgeOptions env)
- Current mitigation: None
- Recommendations: Validate env var names and values, provide explicit allowlist

## Performance Bottlenecks

**Synchronous File I/O in Workspace Indexing:**
- Problem: Workspace indexing uses file-by-file synchronous operations
- Files: `packages/pike-lsp-server/src/workspace-index.ts` (indexDirectory method)
- Cause: Sequential file processing without batching or parallelization
- Improvement path: Implement batch indexing, parallel file reading with worker pool, add incremental indexing for changed files only

**No Pike-Side Result Caching:**
- Problem: Compilation and introspection results not cached across requests in Pike subprocess
- Files: `pike-scripts/analyzer.pike`, Pike LSP modules
- Cause: Stateless design in Intelligence/Analysis modules, relies only on LSP.CompilationCache
- Improvement path: Expand CompilationCache usage to all expensive operations (introspection, resolution), add cache warming for common stdlib modules

**O(n) Symbol Lookups:**
- Problem: Linear search through symbol arrays for position-based lookups
- Files: `packages/pike-lsp-server/src/features/symbols.ts`, `packages/pike-lsp-server/src/features/navigation.ts`
- Cause: Array iteration without index structures
- Improvement path: Build binary search index or Map for O(log n) position lookups, cache indexed structures per document

**Large Build Artifacts:**
- Problem: Bundled extension.js is 786KB, server.js is 249KB (unminified)
- Files: `packages/vscode-pike/dist/extension.js`, `packages/vscode-pike/server/server.js`
- Cause: No minification or tree-shaking in build process
- Improvement path: Enable esbuild minification, add code splitting for LSP server, analyze bundle for unused dependencies

## Fragile Areas

**Bridge Process State Management:**
- Files: `packages/pike-bridge/src/bridge.ts`, `packages/pike-bridge/src/process.ts`
- Why fragile: Manual process lifecycle management, timeout-based startup detection (100ms hardcoded), race conditions between start() and isRunning()
- Safe modification: Add explicit state machine with enums (STARTING, RUNNING, STOPPING, STOPPED), use child process events instead of setTimeout for startup detection, add integration tests for lifecycle edge cases
- Test coverage: Unit tests cover happy path; missing tests for crash recovery, stale process, double-start scenarios

**JSON-RPC IPC Protocol:**
- Files: `pike-scripts/analyzer.pike` (main loop line 400), `packages/pike-bridge/src/process.ts`
- Why fragile: Line-based JSON parsing assumes no newlines in JSON, manual error recovery, no framing protocol
- Safe modification: Add length-prefix framing or base64 encoding for payloads, add protocol version negotiation, implement request queuing with backpressure
- Test coverage: Integration tests verify basic requests; missing tests for malformed JSON, partial messages, concurrent requests

**Memory Budget Enforcement:**
- Files: `packages/pike-lsp-server/src/type-database.ts` (enforceMemoryBudget method, line 318)
- Why fragile: Heuristic memory estimation (1KB per symbol), LRU eviction triggered after budget exceeded (not proactively), no per-cache limits
- Safe modification: Replace heuristics with actual measurement using Buffer.byteLength(), add watermark-based pre-eviction, implement separate budgets per cache (programs, symbols, types)
- Test coverage: Unit tests verify eviction logic; missing stress tests for memory pressure scenarios

**Pike Module Resolution:**
- Files: `pike-scripts/LSP.pmod/Intelligence.pike` (handle_resolve_stdlib method), master()->resolv() calls
- Why fragile: Relies on Pike's dynamic module loading which can fail, circular dependencies in bootstrap modules, platform-specific paths
- Safe modification: Add fallback resolution paths, cache resolved modules per platform, implement module path allowlist
- Test coverage: Tests cover stdlib resolution; missing tests for failure cases, missing modules, cross-platform differences

**Error Handling in LSP Feature Handlers:**
- Files: `packages/pike-lsp-server/src/features/*.ts` (editing.ts, navigation.ts, symbols.ts, hierarchy.ts)
- Why fragile: Extensive try-catch blocks returning null on any error, no error classification, silent failures mask real issues
- Safe modification: Distinguish between recoverable errors (return empty result) and fatal errors (propagate), add error logging with context, implement circuit breaker for repeated failures
- Test coverage: Missing tests for error paths; focus only on happy paths

## Scaling Limits

**Single Pike Subprocess:**
- Current capacity: One Pike subprocess handles all requests serially
- Limit: CPU-bound during parsing/compilation, no parallelization, single point of failure
- Scaling path: Implement worker pool with N subprocesses, add request queue with load balancing, consider fork-based parallelism for CPU-bound tasks

**In-Memory Caches:**
- Current capacity: TypeDatabase limited to 50MB (TYPE_DB_MAX_MEMORY_BYTES), StdlibIndexManager 20MB, DocumentCache 500 files
- Limit: All caches in-process memory, no persistent storage, full cache invalidation on server restart
- Scaling path: Implement disk-backed cache (LMDB or SQLite), add cache persistence across restarts, implement sharding for multi-workpace scenarios

**Workspace Index Scanning:**
- Current capacity: Scans entire workspace on startup, no incremental updates
- Limit: Large workspaces (>10K files) cause startup delay, file system watching can miss changes, no throttling
- Scaling path: Implement incremental indexing with file watching, add indexing throttling with progress reporting, support workspace-level excludes/filters

## Dependencies at Risk

**Pike 8.0.x Dependency:**
- Risk: Code uses Pike 8.0-specific APIs (String.trim_all_whites() not String.trim()), may break on Pike 8.1+
- Impact: Extension will fail if user has newer Pike version
- Migration plan: Version detection in analyzer.pike, polyfills for newer API differences, add CI testing matrix for multiple Pike versions (partial: test.yml has Pike 8.1116 and latest)

**vscode-languageclient@9.0.1:**
- Risk: pinned to specific major version, LSP protocol features may lag
- Impact: Missing newer LSP capabilities (inline completion, semantic tokens refresh)
- Migration plan: Quarterly version review, test upgrades against VS Code Insiders, monitor LSP spec changes

**Node.js 18 Target:**
- Risk: Build targets node18, extension may not work on older VS Code versions
- Impact: Users on VS Code < 1.85 cannot use extension
- Migration plan: Drop support for older VS Code versions (already at 1.85 minimum), document system requirements clearly

## Missing Critical Features

**Incremental Document Analysis:**
- Problem: Full document re-analysis on every change, no incremental parsing
- Blocks: Real-time diagnostics for large files, responsive completion on rapid edits
- Impact: High latency for documents >1000 lines, noticeable lag during typing

**Type Inference for Complex Expressions:**
- Problem: Type inference limited to simple symbols, no expression-level types (e.g., result of function call, array element access)
- Blocks: Accurate hover info for chained calls, completion for complex expressions
- Impact: Type information often "unknown" for non-trivial code

**Cross-File Symbol Indexing:**
- Problem: Global symbol index exists but not populated or used for cross-file references
- Blocks: Go-to-definition across files, find all references workspace-wide
- Impact: Navigation limited to current file, poor understanding of codebase relationships

**Rename Symbol Support:**
- Problem: No rename refactoring capability
- Blocks: Basic IDE refactoring workflow
- Impact: Manual rename required, error-prone for multi-file changes

## Test Coverage Gaps

**Error Path Testing:**
- What's not tested: Bridge process crashes, malformed JSON-RPC requests, timeout scenarios, Pike subprocess failures
- Files: `packages/pike-bridge/src/*.ts`, `packages/pike-lsp-server/src/services/bridge-manager.ts`
- Risk: Production failures not caught in CI, poor error messages for users
- Priority: High

**Concurrent Request Handling:**
- What's not tested: Multiple simultaneous requests, inflight request deduplication, race conditions in start/stop
- Files: `packages/pike-bridge/src/bridge.ts`
- Risk: Deadlocks or data races under load, state corruption
- Priority: Medium

**Memory Limit Scenarios:**
- What's not tested: Cache eviction under memory pressure, large workspace performance, symbol count limits
- Files: `packages/pike-lsp-server/src/type-database.ts`, `packages/pike-lsp-server/src/stdlib-index.ts`
- Risk: Server crashes or becomes unresponsive with large codebases
- Priority: Medium

**Platform-Specific Behavior:**
- What's not tested: Windows file paths, case-sensitive filesystems, different Pike installations
- Files: `packages/pike-bridge/src/process.ts`, `pike-scripts/LSP.pmod/*.pike`
- Risk: Extension works on Linux but fails on Windows/macOS
- Priority: High (Windows support)

**LSP Protocol Compliance:**
- What's not tested: LSP specification edge cases, cancellation semantics, version negotiation
- Files: `packages/pike-lsp-server/src/features/*.ts`
- Risk: Non-compliant behavior causes issues with LSP clients
- Priority: Low (current implementation works with VS Code)

---

*Concerns audit: 2025-01-23*
