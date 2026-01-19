# Codebase Concerns

**Analysis Date:** 2025-01-19

## Tech Debt

**Large analyzer script:**
- Issue: `pike-scripts/analyzer.pike` is 3,221 lines, containing all parsing logic
- Files: `pike-scripts/analyzer.pike`
- Impact: Difficult to navigate, maintain, and test. Single file handles too many responsibilities.
- Fix approach: Split into modules by concern (parsing, tokenization, introspection, stdlib resolution, caching).

**TypeScript `as any` type assertions:**
- Issue: Multiple uses of `as any` bypass TypeScript type checking in `server.ts`
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts`
- Impact: Loses type safety, could cause runtime errors. Lines 717, 731, 1808, 2155, 2683, 2721 use this pattern.
- Fix approach: Define proper union types or type guards for symbol variants.

**LRU queue O(n) operations:**
- Issue: `touchModule()` in `stdlib-index.ts` uses `filter()` to remove from LRU queue, O(n) per operation
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/stdlib-index.ts`
- Impact: Performance degrades with many cached modules. Each access triggers linear scan.
- Fix approach: Use doubly-linked list or Map-based structure for O(1) LRU operations.

**Rough memory estimation:**
- Issue: Memory budgeting uses hardcoded estimates (1KB per symbol, 512 bytes per inheritance)
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/type-database.ts`
- Impact: Actual memory usage may exceed budget, causing unexpected evictions or OOM.
- Fix approach: Measure actual serialized size or use more accurate heuristics.

## Known Bugs

**Preprocessor conditional blocks skipped:**
- Symptoms: Symbols inside `#if`/`#else` blocks may not be indexed
- Files: `pike-scripts/analyzer.pike` (lines 107-129)
- Trigger: Opening any file with conditional preprocessor directives
- Workaround: Avoid complex preprocessor conditionals in code that needs indexing
- Note: Documented in README as known limitation

**Nested class parsing incomplete:**
- Symptoms: Go-to-definition may not work for deeply nested class members
- Files: `pike-scripts/analyzer.pike`
- Trigger: Classes defined within other classes
- Workaround: Use flattened class structures where possible
- Note: Documented in README as known limitation

**Conditional initialization detection skipped:**
- Symptoms: Dataflow analysis doesn't detect "maybe initialized" variables in if/else branches
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.test.ts` (line 248, `it.skip`)
- Trigger: Variables initialized in only one branch of conditional
- Workaround: Initialize variables before conditionals
- Fix approach: Implement branch-aware control flow analysis (annotated as TODO in test)

## Security Considerations

**Subprocess execution:**
- Risk: Pike executable path from user settings is executed without validation
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts`, `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts`
- Current mitigation: Uses `spawn()` which respects PATH, but no explicit path validation
- Recommendations: Validate executable path exists and is within allowed directories

**Environment variable passthrough:**
- Risk: User-provided environment variables passed to Pike subprocess
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts` (line 142)
- Current mitigation: Spreads user-provided env with process.env
- Recommendations: Whitelist allowed environment variable names

## Performance Bottlenecks

**Infinite loop protection limits:**
- Problem: Parser uses iteration limits (10,000 top-level, 500 block) to prevent infinite loops
- Files: `pike-scripts/analyzer.pike` (lines 26-27, constants `MAX_TOP_LEVEL_ITERATIONS`, `MAX_BLOCK_ITERATIONS`)
- Cause: Pike's parser may not terminate on malformed input
- Improvement path: Better parser error handling, reduce reliance on iteration limits as safety net

**Symbol position lookup:**
- Problem: Document cache uses `Map<string, Position[]>` for symbol positions (O(1) lookup by name, but linear scan for position queries)
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts` (line 102)
- Cause: Need fast reverse lookup from positions to symbols
- Improvement path: Consider interval tree or quadtree for position-based queries

**Batch request size limits:**
- Problem: `BATCH_PARSE_MAX_SIZE = 50` balances IPC overhead with memory constraints
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/constants.ts`
- Cause: Pike subprocess memory limits
- Improvement path: Implement streaming batch processing or adaptive chunk sizing

## Fragile Areas

**Bridge subprocess lifecycle:**
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts`
- Why fragile: JSON-RPC over stdin/stdout can fail silently; process may exit unexpectedly
- Safe modification: Always check `isRunning()` before sending requests; handle process exit events
- Test coverage: Good coverage in `bridge.test.ts`, but missing edge cases like stdin/stdout pipe closure

**Analyzer script path resolution:**
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts` (lines 147-169), `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts` (lines 64-89)
- Why fragile: Tries multiple possible paths; fails if none exist
- Safe modification: Add explicit error messages for each attempted path
- Test coverage: Lacks tests for bundling scenarios

**Extension activation without server:**
- Files: `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts` (lines 82-88)
- Why fragile: Extension degrades gracefully but provides no recovery mechanism
- Safe modification: Add retry logic or user-facing configuration wizard
- Test coverage: No automated tests for extension activation failure scenarios

**Type inference cache invalidation:**
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/type-database.ts` (lines 299-313)
- Why fragile: Cache invalidation uses string prefix matching on URI
- Safe modification: Use structured cache keys with explicit URI field
- Test coverage: No tests for cache invalidation edge cases

## Scaling Limits

**Memory budget enforcement:**
- Current capacity: `TYPE_DB_MAX_MEMORY_BYTES` (check constants/index.ts for value)
- Limit: Oldest programs evicted when budget exceeded; may lose needed type info
- Scaling path: Implement smarter cache policies (LFU for frequently-used types, size-aware eviction)

**Stdlib module cache:**
- Current capacity: 50 modules max, 20MB memory limit
- Limit: Large codebases with many stdlib dependencies may exceed cache
- Scaling path: Increase limits or implement external stdlib index pre-generation

**Workspace indexing:**
- Current capacity: No explicit limit, indexes all `.pike`/`.pmod` files recursively
- Limit: Very large workspaces may cause high memory usage during initial scan
- Scaling path: Implement incremental indexing and file watching rather than full scans

## Dependencies at Risk

**Pike 8.0 requirement:**
- Risk: Code specifically targets Pike 8.0; may break with Pike 8.1+
- Impact: `Tools.AutoDoc.PikeParser` API changes could break parsing
- Migration plan: Pin to Pike 8.0.x; add version detection and compatibility layer

**vscode-languageclient ^9.0.1:**
- Risk: Extension tightly coupled to this library's API
- Impact: Library major version changes would require extension rewrite
- Migration plan: Follow vscode-languageserver-node deprecation notices

## Missing Critical Features

**Extension test coverage:**
- Problem: `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/` has no test file
- Blocks: Confidence in extension behavior, regression prevention
- Files: `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/package.json` lacks test dependencies

**pike-analyzer tests:**
- Problem: `/home/smuks/OpenCode/pike-lsp/packages/pike-analyzer/` has no test file
- Blocks: Verification of semantic analysis logic
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-analyzer/`

**No linting/formatting configuration:**
- Problem: No `.eslintrc`, `.prettierrc`, or `biome.json` found
- Blocks: Consistent code style, automatic formatting, pre-commit checks
- Files: Project root and all packages

## Test Coverage Gaps

**Extension activation and configuration:**
- What's not tested: Extension activation failure, missing Pike executable, config changes triggering restart
- Files: `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts`
- Risk: Users may encounter activation failures with poor error messages
- Priority: High (user-facing)

**Type inference and caching:**
- What's not tested: TypeDatabase cache invalidation, cross-file type inference, memory budget enforcement
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/type-database.ts`
- Risk: Type information may become stale, incorrect completions
- Priority: Medium (core functionality)

**Stdlib lazy loading:**
- What's not tested: StdlibIndexManager LRU eviction, negative cache, memory tracking
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/stdlib-index.ts`
- Risk: Cache may not work correctly, memory leaks
- Priority: Medium (performance)

**LSP protocol edge cases:**
- What's not tested: Concurrent document changes, rapid open/close, malformed requests
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts`
- Risk: Server may crash or hang on edge cases
- Priority: Low (reported issues are minimal)

**Error recovery:**
- What's not tested: Bridge crash recovery, Pike subprocess restart, state restoration after failure
- Files: `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts`
- Risk: Requires manual restart on bridge failure
- Priority: Medium (reliability)

---

*Concerns audit: 2025-01-19*
