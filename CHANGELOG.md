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
