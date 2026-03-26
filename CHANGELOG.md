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

## [0.1.0-alpha.32] - 2026-03-26

### Added

- **Pull diagnostics and snapshot-driven editor tooling** - shipped pull-diagnostics handlers/capabilities, inline snapshot hover test infrastructure, runnable/test code lens commands, and workspace indexing progress reporting.
- **Structural search and replace command** - added command surface and extension wiring for structural search/replace workflows.

### Fixed

- **Language correctness in edge syntax contexts** - fixed references, inlay hints, semantic tokens, and folding behavior to ignore comments and string literals in tricky multiline and inline cases.
- **Formatting reliability and on-type behavior** - stabilized formatting context/on-type indentation behavior and added regression coverage around formatter depth handling.
- **CI/E2E throughput and merge gating** - parallelized VS Code E2E by category matrix, kept flaky reliability slice non-blocking when needed, and restored required `vscode-e2e` status gating compatibility.

### Changed

- **Contributor testing policy** - tightened docs to require regression-focused tests for all feature and bug-fix PRs.

## [0.1.0-alpha.31] - 2026-03-18

### Fixed

- **Live formatting stability** - replaced broken live formatting paths and stabilized Pike indentation behavior.

[0.1.0-alpha.32]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.32
[0.1.0-alpha.31]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.31
