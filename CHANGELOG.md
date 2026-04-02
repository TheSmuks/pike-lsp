# Changelog

All notable changes to the Pike LSP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Changelog Sections

- **Added** - New features
- **Changed** - Changes to existing functionality
- **Deprecated** - Features marked for removal
- **Removed** - Features removed in this release
- **Fixed** - Bug fixes
- **Optimization** - Performance improvements and technical optimizations (shown on benchmark page)
- **Security** - Security vulnerability fixes
- **Performance** - User-facing performance notes

## [0.1.0-alpha.43] - 2026-04-03

### Added

- **Query Engine v2 RFC ratification** - QE2 RFC and Protocol specs ratified to Active/Accepted v2.0.0 (#1118, PR #1126)
- **Edit-loop hardening** - rapid malformed edit scenario tests and diagnostic hardening for parse failures (#1119, PR #1127)
- **Protocol leakage removal** - removed vscode-languageserver imports from core types, added protocol mappers (#1120, PR #1133)
- **QE2 invariants CI enforcement** - 8 RFC invariants enforced in CI with property and stress tests (#1123, PR #1134)
- **Canary and rollback gates** - canary-gate.ts and rollback-gate.ts scripts for phased promotion (#1124, #1125, PR #1136)
- **Completion ranking parity tests** - deterministic ordering and query-engine vs fallback ranking tests (#1121, PR #1137)
- **Self-hosting configuration** - `.opencode.json` for Pike LSP development with opencode (#1121, PR #1137)

### Fixed

- **Completion stubbed responses** - replaced stubbed query-engine completion responses with enriched semantic data including kind and detail (#1121, PR #1137)
- **Flaky test assertions** - removed incorrect assertions from fault-bridge-crash and diagnostic-pipeline tests (#1132, PR #1135)
- **Pike strict_types comparison** - fixed string comparison errors in Completions.pike with strict_types pragma (#1121, PR #1137)
- **Request cancellation cleanup** - ensure cancelled requests properly clean up cache writes (#1114)
- **Cascade diagnostics suppression** - suppress cascade diagnostics when syntax errors exist (#1103)
- **SSL/connection.pike crash** - added to KNOWN_CRASHES and corrected Password.pmod path (#1105)
- **Uninitialized variable tracking** - recognize ::create() calls as initializers (#1097)
- **Preprocessor conditionals** - handle #if/#ifdef blocks correctly (#1095)
- **Switch/case fallthrough** - track initialization through switch/case fallthrough (#1096)
- **If-branch merging** - defer if-branch merge until after else body closes (#1094)

### Changed

- **Query Engine v2 implementation** - migrated completion to use handle_completion with symbol metadata
- **CI workflow** - added fail-fast dependencies on testing-pyramid job (#1130)
- **Contributing guide** - rewrote AGENTS.md as flat Contributing Guide (#1099)

**Full Changelog**: https://github.com/TheSmuks/pike-lsp/compare/v0.1.0-alpha.42...v0.1.0-alpha.43

## [0.1.0-alpha.42] - 2026-04-02

### Fixed

- **Stale syntax errors on changed lines** - diagnostics no longer persist stale errors on lines that were modified since the last validation (#1052, PR #1059)
- **Cache skip path diagnostics loss** - filtered diagnostics are now correctly persisted to cache when validation is skipped (#1066, PR #1067)
- **Re-validation on cached errors** - documents with cached error diagnostics are always re-validated, even when content hasn't changed (#1068, PR #1070)
- **False import errors on file open** - removed setTimeout hack from symbols.ts and added scenario tests verifying correct engine dispatch ordering (#1058, PR #1085)
- **Bridge crash resilience** - PikeBridge auto-restarts on unexpected exit and BridgePool replaces dead bridges mid-dispatch (#1074, #1075, PR #1086)
- **Corpus test false positives** - updated expected diagnostics and introspect fails for Pike stdlib modules (#1076, PR #1087)
- **Rehydrate error noise** - clarified rehydrate error log for expected ENOENT case (PR #1084)

### Added

- **Scenario test coverage** - added diagnostic pipeline, hover, completion, references, and document symbols scenario tests (#1061, PRs #1062–#1065)
- **False import errors scenario test** - scenario test verifying engine open and validation dispatch ordering (PR #1085)

### Performance

- **CI throughput** - removed duplicate CI steps, parallelized Pike from-source build, deduplicated lockfile checks, and shared build artifacts between jobs (#1078, PRs #1080–#1083)
- **Benchmark PR opt-in** - benchmark runs on PR are now opt-in via `run-benchmarks` label (#1078, PR #1082)
- **Parallel E2E tests** - corpus and source-tree E2E tests now use BridgePool for concurrent execution (#1073, PR #1077)

### Changed

- **Issue template alignment** - aligned issue template with enforcement workflow and documented architecture constraints (PR #1079)
- **CI workflow documentation** - added CI workflow modification rules and PR format requirements to AGENTS.md (PR #1081)

**Full Changelog**: https://github.com/TheSmuks/pike-lsp/compare/v0.1.0-alpha.41...v0.1.0-alpha.42

## [0.1.0-alpha.41] - 2026-03-31

### Fixed

- **Reverted stale diagnostics fix** - the fix in alpha.40 caused false error diagnostics on valid code. Reverted PR #1053 until a better solution is found by @TheSmuks in https://github.com/TheSmuks/pike-lsp/pull/1057

**Full Changelog**: https://github.com/TheSmuks/pike-lsp/compare/v0.1.0-alpha.40...v0.1.0-alpha.41
