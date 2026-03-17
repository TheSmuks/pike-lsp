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

## [0.1.0-alpha.30] - 2026-03-17

### Fixed

- **Runtime settings propagation consistency** - initialization and config-change flows now sync mutable runtime settings through shared services state, and diagnostics consumes the same live settings source.
- **Workspace-folder analyzer sync** - workspace folder add/remove events now propagate deltas into query-engine workspace state to keep analyzer roots aligned with scanner/index state.
- **Interactive snapshot consistency and safe fallbacks** - navigation/completion queries now prefer fixed snapshots when available, and uncached workspace text-search fallbacks were removed for references/rename to avoid blind symbol-unsafe results.

### Added

- **Regression coverage for workspace/runtime consistency** - added tests for runtime workspace-folder delta forwarding and navigation snapshot selection behavior.

## [0.1.0-alpha.29] - 2026-03-16

### Fixed

- **References completeness across files** - `textDocument/references` now merges query-engine and fallback sources, restores cross-file `.pike` scanning, and deduplicates merged locations to avoid missed usages.
- **QE2 incremental document state** - `engine_change_document` now applies ordered range edits into stored document text instead of storing change metadata only.
- **QE2 fixed snapshot resolution** - fixed-snapshot queries now validate snapshot existence and resolve against pinned snapshot state; unknown snapshot IDs return `SNAPSHOT_NOT_FOUND` payloads.

### Added

- **Regression coverage for snapshot/edit correctness** - added bridge-level tests for ranged incremental edits, fixed snapshot pinning across later edits, and unknown fixed snapshot behavior.

[0.1.0-alpha.30]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.30
[0.1.0-alpha.29]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.29
