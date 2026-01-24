# Changelog

All notable changes to the Pike LSP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.6] - 2026-01-24

### Fixed
- Build order issue where TypeScript test compilation was overwriting the esbuild-bundled extension.js
- Extension activation failure caused by incomplete bundle (13KB instead of expected 785KB)
- CI workflow bundle-server and benchmark configuration issues
- Multiple CI test path and configuration problems
- TypeScript module resolution for CI builds

### Changed
- Reversed build script order to build tests before main extension
- Migrated from pnpm to bun package manager

### Refactor
- Phase 3 code quality improvements
- Split large feature files into modules
- Simplified handleResponse implementation

## [0.1.0-alpha.5] - 2026-01-23

### Fixed
- Server crash on syntax errors - LSP server no longer crashes when opening files with compilation errors
- Diagnostics error handling - Improved graceful degradation when introspection fails
- Duplicate validation code - Removed ~270 lines of duplicate validation logic from server.ts
- CI benchmark workflow - Fixed Mitata output transformation and regression checks
- Bundle and integration test failures

### Added
- Comprehensive test coverage for syntax error handling
- Diagnostics from Pike compiler - Syntax errors now displayed via red squiggles
- Version sync script for monorepo package management

## [0.1.0-alpha.4] - 2026-01-XX

### Performance
- Responsiveness tuning with typing simulation benchmarks
- Updated default diagnostic delay to 250ms
- Improved stdlib introspection benchmarks

### Fixed
- Builtin types handling without source path

### Changed
- Completed v3.0 Performance Optimization milestone
- Added benchmark regression checks with custom thresholds

## [0.1.0-alpha.2] - 2025-XX-XX

### Fixed
- Resolved 'Parent lost' error by unwrapping delegating classes in Pike module introspection

## [0.1.0-alpha.1] - 2025-XX-XX

### Initial Alpha Release

A full-featured Language Server Protocol implementation for Pike.

#### Core LSP Features
- Document Symbols - Outline view with classes, methods, variables, constants
- Workspace Symbols - Search symbols across entire project (Ctrl+T)
- Hover - Type information and documentation on mouse hover
- Completions - Intelligent autocomplete with snippets
- Signature Help - Parameter hints while typing function calls
- Diagnostics - Real-time syntax error detection via Pike compiler

#### Navigation
- Go to Definition (F12) - Jump to symbol definitions
- Go to Declaration - Navigate to declarations
- Go to Type Definition - Navigate to type definitions
- Find References (Shift+F12) - Find all usages of a symbol
- Find Implementations - Find interface implementations

#### Refactoring
- Rename Symbol (F2) - Safely rename across files
- Code Actions - Quick fixes and organize imports

#### Hierarchy
- Call Hierarchy - View incoming/outgoing function calls
- Type Hierarchy - Explore class inheritance

#### Advanced Features
- Code Lens - Reference counts above functions/classes
- Document Links - Clickable paths in inherit statements
- Inlay Hints - Parameter name hints
- Semantic Tokens - Enhanced syntax highlighting
- Selection Ranges - Smart selection expansion
- Folding Ranges - Code folding for classes and functions
- Document Formatting - Format entire document or selection

#### Performance
- Batch Parsing - Process multiple files in single request
- Stdlib Caching - Pre-warm cache for common Pike modules
- Token-based Symbol Finding - 5x faster than regex approach
- Conditional Debug Logging - Zero overhead in production

#### Testing
- 10 test suites with comprehensive coverage
- 100% Pike stdlib compatibility - All 546+ files parse
- Performance benchmarks with CI/CD integration

[0.1.0-alpha.6]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.6
[0.1.0-alpha.5]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.5
[0.1.0-alpha.4]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.4
[0.1.0-alpha.2]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.1
