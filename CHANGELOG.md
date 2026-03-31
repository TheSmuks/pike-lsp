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

## [0.1.0-alpha.41] - 2026-03-31

### Fixed

- **Reverted stale diagnostics fix** - the fix in alpha.40 caused false error diagnostics on valid code. Reverted PR #1053 until a better solution is found by @TheSmuks in https://github.com/TheSmuks/pike-lsp/pull/1057

**Full Changelog**: https://github.com/TheSmuks/pike-lsp/compare/v0.1.0-alpha.40...v0.1.0-alpha.41

## [0.1.0-alpha.40] - 2026-03-31

### Fixed

- **Stale syntax errors** - fixed issue where error diagnostics remained visible after fixing the underlying code by @TheSmuks in https://github.com/TheSmuks/pike-lsp/pull/1053

**Full Changelog**: https://github.com/TheSmuks/pike-lsp/compare/v0.1.0-alpha.39...v0.1.0-alpha.40

## [0.1.0-alpha.39] - 2026-03-31

### Added

- **Color presentation** - added `colorProvider` capability with hex color detection (#RGB, #RRGGBB, #RRGGBBAA) and color picker integration by @TheSmuks in https://github.com/TheSmuks/pike-lsp/pull/1049

### Fixed

- **Nested switch/case formatting** - fixed indentation for nested switch/case blocks by @TheSmuks in https://github.com/TheSmuks/pike-lsp/pull/1044

### Changed

- **Type safety** - enabled `noImplicitAny` in pike-lsp-server for stricter type checking by @TheSmuks in https://github.com/TheSmuks/pike-lsp/pull/1050

**Full Changelog**: https://github.com/TheSmuks/pike-lsp/compare/v0.1.0-alpha.38...v0.1.0-alpha.39

## [0.1.0-alpha.38] - 2026-03-30

### Added

- **Test coverage expansion** - added tests for definition-utils (+31), getters-setters (+16), module-scanner (+20), catalog-manager (+15), glob-cache (+15), and request-id (+10) modules. Total: +107 new tests.

## [0.1.0-alpha.37] - 2026-03-30

### Added

- **Test coverage expansion** - added tests for keywords.ts (+26), symbol-index.ts (+12), inline-values (+5), and on-type-formatting (+54).

### Fixed

- **Flaky test fix** - replaced fixed timeout with polling loop in "sendDiagnostics on skip path" test for more reliable CI.

## [0.1.0-alpha.36] - 2026-03-29

### Added

- **Completion item resolving** - added `onCompletionResolve` handler with `additionalTextEdits` for auto-import support.
- **Test discovery** - added automatic test file detection for Pike test files with code lens integration.
- **Settings toggle** - added `pike.organizeImports.removeUnused` setting to control unused import removal.

### Fixed

- **Flaky skip path test** - improved polling mechanism for more reliable test execution.

## [0.1.0-alpha.35] - 2026-03-29

### Added

- **Organize imports with unused removal** - implemented goimports-style unused import detection and removal.
- **vscode-go architectural patterns** - adopted vscode-go patterns for better code organization.
- **Scenario-driven development framework** - added anti-cheat test verification and standardized test helpers.

### Fixed

- **Syntax error diagnostics persistence** - added regression tests for diagnostics behavior.

## [0.1.0-alpha.34] - 2026-03-26

### Added

- **Repository policy enforcement guards** - added lockfile/package-manager guardrails, eslint-disable reason checks, strict Pike `#pragma strict_types` coverage checks, and pre-push strict-types validation with explicit non-compliance listing.

### Fixed

- **Strict typing and runtime capability registration** - fixed strict-mode regressions around on-type formatting, linked editing, and VS Code reference result normalization.
- **CI throughput and merge safety defaults** - enabled fail-fast behavior across test matrices used by PR validation and stabilized workflow execution order for policy checks.

### Changed

- **Formatting governance for packages** - enforced package-scoped Prettier formatting checks in pre-commit and standardized package source formatting to keep `.prettierrc` policy-compliant and reproducible.

## [0.1.0-alpha.33] - 2026-03-26

### Added

- **Analyzer runtime foundations** - implemented typed LRU and compilation cache layers, Pike compatibility runtime checks, and control-flow definite-assignment/uninitialized analysis coverage.

### Fixed

- **Diagnostics lifecycle and cancellation robustness** - fixed close-time rehydration races, stale in-flight diagnostics cleanup, debounce validation version cleanup, and surfaced cancellation/queue failure paths with explicit logging.
- **Workspace index and URI correctness** - standardized URI-to-fs decoding in document links, added guarded workspace-symbol line normalization, targeted search-cache invalidation, and orphan prefix-index cleanup.
- **Server/runtime observability and startup reliability** - made initialize fail fast on bridge startup failure, made debug log path configurable via `PIKE_LSP_LOG_FILE`, and surfaced log write failures via `window/logMessage` warnings.
- **Type hierarchy and hover behavior** - completed recursive type hierarchy traversal coverage and grouped overload variants under primary hover signatures.

### Changed

- **Regression coverage expansion** - converted placeholder-heavy and skip-heavy suites into executable behavioral tests for scheduler, bridge health, analyzer caching, compatibility, and control-flow diagnostics.

[0.1.0-alpha.34]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.34
[0.1.0-alpha.33]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.33
