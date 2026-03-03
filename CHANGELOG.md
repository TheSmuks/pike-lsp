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

## [0.1.0-alpha.26] - 2026-03-03

### Fixed

- **Restored session LSP startup** - Start the language server during extension activation when Pike documents are already open (restored VS Code sessions).
- **Anonymize path logs** - Anonymize user-specific absolute paths in logger output and extension error messages.
- **Import content in autocomplete** - Augment query-engine completion results with imported/include symbols so import content appears in autocomplete.
- **Workspace scan performance** - Limit waterfall dependency completion fetches to contexts with a typed prefix to avoid expensive broad scans during edit flows.

### Changed

- **Centralized language IDs** - Moved supported Pike language IDs to a shared constant.

## [0.1.0-alpha.25] - 2026-02-26

### Chore

- **CLAUDE.md cleanup** - Streamlined CLAUDE.md and updated hover.ts for improved code quality

## [0.1.0-alpha.24] - 2026-02-25

### Added

- **End-to-end stale diagnostics race coverage** - Added regression tests for rapid invalid->valid edit/save bursts so stale syntax diagnostics cannot persist after the document is corrected.

### Fixed

- **Stale diagnostics publishing** - Dropped out-of-date diagnostics when analysis completes for an older document version than the currently open text document.
- **Debounced validation staleness** - Validation now resolves against the latest live document state before classify/validate, preventing false error leftovers during fast editing.
- **Change classification false skips** - Removed over-aggressive comment-only skip behavior that could suppress needed revalidation after semantic edits.

### Changed

- **Diagnostics stress mocks** - Updated query-engine cancellation stress mocks to track live document state (`get`/`all`) for more realistic diagnostics lifecycle testing.

## [0.1.0-alpha.23] - 2026-02-22

### Added

- **Switch/case statement support** - Implement switch/case statement support with semantic token highlighting for control flow keywords
- **Range operator context detection** - Implement range operator (..) context detection for code completion (array slicing, case ranges, type expressions)

### Chore

- **Branch cleanup workflow** - Add workflow to automatically delete branches when PRs are merged
- **Security workflow** - Add workflow_dispatch trigger for manual Gitleaks runs

[0.1.0-alpha.25]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.25
[0.1.0-alpha.24]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.24
[0.1.0-alpha.23]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.23
