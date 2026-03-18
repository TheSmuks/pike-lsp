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

## [0.1.0-alpha.31] - 2026-03-18

### Fixed

- **Live formatting stability and indentation correctness** - replaced broken live-formatting paths and stabilized Pike indentation handling around sensitive token pairs during incremental edits.

## [0.1.0-alpha.30] - 2026-03-17

### Fixed

- **Runtime settings propagation consistency** - initialization and config-change flows now sync mutable runtime settings through shared services state, and diagnostics consumes the same live settings source.
- **Workspace-folder analyzer sync** - workspace folder add/remove events now propagate deltas into query-engine workspace state to keep analyzer roots aligned with scanner/index state.
- **Interactive snapshot consistency and safe fallbacks** - navigation/completion queries now prefer fixed snapshots when available, and uncached workspace text-search fallbacks were removed for references/rename to avoid blind symbol-unsafe results.

### Added

- **Regression coverage for workspace/runtime consistency** - added tests for runtime workspace-folder delta forwarding and navigation snapshot selection behavior.

[0.1.0-alpha.31]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.31
[0.1.0-alpha.30]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.30
