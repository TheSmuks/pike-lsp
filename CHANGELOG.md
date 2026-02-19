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

## [0.1.0-alpha.21] - 2026-02-19

### Added
- **Unlimited nested class depth** - Support unlimited nested class depth
- **Dynamic module resolution** - Add support for dynamic module resolution via load_module and compile_file
- **On-type formatting tests** - Add tests for on-type formatting feature
- **Moniker provider tests** - Add moniker provider tests
- **RXML hover provider tests** - Add RXML hover provider tests
- **Document links tests** - Add document links tests
- **Code actions tests** - Add code actions tests
- **Symbol resolution tests** - Add symbol resolution tests
- **Navigation edge case tests** - Add navigation edge case tests
- **Completion feature tests** - Add completion feature tests
- **Integration tests for document sync** - Add integration tests for document sync
- **Unhandled LSP method tests** - Add tests for unhandled LSP methods
- **Pike API reference documentation** - Add Pike API reference documentation
- **Pike installation guide** - Add detailed Pike installation guide
- **Docker support** - Add docker support for remote development and production
- **Docker development environment** - Add Docker development environment
- **CI workflow** - Add CI workflow with robust template enforcement

### Fixed
- **Preprocessor directive parsing** - Improve preprocessor directive parsing with custom tokenizer
- **String.is_whitespace** - Replace non-existent String.is_whitespace with trim_whites check
- **On-type formatting** - Use correct LSP method for on-type formatting
- **ESLint migration** - Migrate from deprecated .eslintignore to eslint.config.mjs
- **Stray backup files** - Remove stray backup files
- **Stray .new files** - Remove stray .new files from test directories
- **Legacy .eslintrc.js** - Remove legacy .eslintrc.js file
- **Generated server.js** - Exclude generated server.js from ESLint
- **VSCode extension activation** - Improve VSCode extension activation
- **Issue template enforcement** - Enforce issue templates, block npm references
- **Worker tracking** - Fix worker tracking issues
- **Document sync** - Fix document sync optimization
- **VSCode-pike root test** - Exclude vscode-pike from root bun test
- **Hover provider** - Cache hasDocumentation results in hover provider
- **Logging in LSP server** - Improve logging in LSP server
- **Error messages** - Improve error messages in LSP server
- **TypeScript any types** - Reduce 'any' type usage in pike-lsp-server
- **Diagnostic performance** - Optimize diagnostic performance for large files
- **Lint warnings** - Resolve lint warnings in pike-lsp-server
- **Source file reading** - Read source file instead of dist in showReferences test
- **Docker build** - Resolve Docker build failures
- **SSH host keys** - Generate SSH host keys at container runtime
- **Dockerfile** - Set correct Claude CLI PATH in Dockerfile
- **Global package install** - Use bun instead of npm for global package install

### Optimization
- **LRU cache for workspace symbols** - Add LRU cache for workspace symbol search results
- **Symbol cache** - Optimize symbol cache
- **Hover provider** - Cache hasDocumentation results

### Performance
- **Diagnostic performance** - Optimize diagnostic performance for large files

### Changed
- **README.md** - Update README.md to use bun instead of pnpm
- **CLAUDE.md** - Update CLAUDE.md
- **VSCode marketplace metadata** - Add VSCode marketplace metadata
- **Dependencies** - Update dependencies to latest versions
- **GitHub Actions** - Upgrade GitHub Actions to latest versions
- **Workflow triggers** - Remove duplicate workflow trigger

### Removed
- **Duplicate validation code** - Removed ~270 lines of duplicate validation logic from server.ts (alpha.5)

### Refactor
- **Server startup** - Clean up server startup
- **Completion logic** - Simplify completion logic
- **Diagnostic code** - Clean up diagnostic code
- **Hover.ts** - Extract common utilities from hover.ts
- **Keyword lookup** - Simplify keyword lookup in hover provider
- **Type inference** - Improve type inference
- **Error handling** - Improve error handling in server.ts

### Documentation
- **Pike API reference** - Add Pike API reference documentation
- **Pike installation guide** - Add detailed Pike installation guide

## [0.1.0-alpha.20] - 2026-02-16

### Added
- **Pike autodoc** - Add Pike autodoc parsing and extraction for documentation support
- **Parser error recovery** - Add tokenization fallback for error recovery in parser
- **On-type formatting** - Add on-type formatting support with color provider
- **Inline value provider** - Add debug mode inline values for variable display
- **Local module symbol extraction** - Extract symbols from local modules for completion
- **Roxen module skeleton generator** - Generate Roxen module skeletons
- **Smart rename** - Smart rename for Pike modules
- **Semantic tokens delta** - Implement incremental semantic token updates
- **Document changes format** - Use documentChanges format for workspaceEdit in rename
- **Docusaurus docs** - Add documentation website setup
- **Lead autonomous mode** - Make Lead fully autonomous
- **Roxen E2E tests** - Add Roxen framework test coverage
- **Multi-line string folding** - Add multi-line string folding for Pike
- **Deprecated symbol diagnostics** - Add deprecated symbol diagnostic detection
- **Workspace import caching** - Cache workspace import symbols

### Fixed
- **E2E test stability** - Improve headless script stability
- **Code lens reference counts** - Add variable and constant to reference counts
- **TypeScript cleanup** - Remove @ts-ignore from production code
- **Lead/executor protocol** - Various protocol fixes for autonomous operation
- **Worktree workflow** - Enforce worktree workflow for workers

### Optimization
- **LRU cache** - Add Pike-side LRU cache for symbol introspection
- **Symbol indexing** - Optimize symbol indexing for large Pike projects
- **Hover lookups** - Index symbols for O(1) hover lookups
- **Completion caching** - Cache waterfall symbols for completion
- **RXML providers** - Cache glob results in RXML providers

## [0.1.0-alpha.19] - 2026-02-09

### Added
- **Runtime path discovery** - Replace hardcoded Pike lib paths with runtime discovery using `master()->pike_include_path` and `master()->pike_module_path`, making LSP work across different Pike installations
- **Bridge response validation** - Add optional validator functions to `sendRequest()` to prevent silent type mismatches from Pike (which returns 0 for undefined properties)
- **ADR-012** - Document the decision to enforce runtime response validation at bridge boundary

### Fixed
- **Pike path APIs** - Use `master()->pike_include_path` and `pike_module_path` instead of `master()->include_path/module_path` (which return 0 in Pike 8.0)
- **ModuleResolution.pike** - Replace hardcoded system paths with runtime discovery, fix off-by-one string slice
- **Directive navigation** - Add `handleDirectiveNavigation()` to handle `#include`, `import`, `inherit`, and `#require` as whole-line directives before expression extraction
- **URI handling** - Convert `file://` URIs to filesystem paths before passing to bridge resolve methods
- **Contract tests** - Add 3 bridge tests verifying `getPikePaths` returns real Pike runtime paths (would have caught the `master()->include_path` bug)

## [0.1.0-alpha.18] - 2026-02-08

### Added
- **Roxen module LSP support** - Phase 1: Complete LSP support for Roxen WebServer Pike modules
  - Roxen module detection (inherit "module", #include <module.h>)
  - defvar variable extraction and symbol grouping
  - RXML tag function detection (simpletag_*, container_*, RXML.Tag classes)
  - Lifecycle callback detection (create(), start(), stop(), etc.)
  - Diagnostics: Missing required callbacks (e.g., query_location for MODULE_LOCATION)
  - Document symbols: "Roxen Module" container with variables, tags, and callbacks
  - Completions: MODULE_*, TYPE_*, VAR_* constants with correct bit-shifted values
  - Real source positions (line/column tracking) instead of hardcoded values
  - 16 Roxen-specific tests (detect, defvar, tags, integration)

- **Roadmap document** - ROXEN_SUPPORT_ROADMAP.md outlines Phases 2-7 for full framework support (RXML templates, .rjs files, embedded RXML, etc.)

### Fixed
- TypeScript build errors in Roxen feature (null handling, import paths)
- Removed unused imports and parameters in roxen/index.ts and symbols.ts

### Changed
- Removed junk .md files (IMPLEMENTATION_COMPLETE.md, IMPORT_INHERIT_IMPLEMENTATION_SPEC.md, IMPORT_INHERIT_TEST_SUMMARY.md, MODULE_RESOLUTION_AUDIT.md)

**Note:** This is Phase 1 of Roxen framework support, focusing on `.pike` Roxen modules only. Future phases will add RXML template support (.inc, .html, .xml files), Roxen JavaScript (.rjs) support, and advanced features. See ROXEN_SUPPORT_ROADMAP.md for the complete implementation plan.

## [0.1.0-alpha.17] - 2026-02-07

### Optimization
- **Hash-based cache eviction** - Replace LRU tracking with hash-based eviction for zero overhead (7.2% faster on cache-intensive workloads)

### Added
- **Agent workflow automation** - Carlini Protocol for parallel agent coordination with worktrees
- **Branch protection** - GitHub ruleset enforcing PR workflow and required status checks
- **Seed-based test subsampling** - Deterministic test subset selection for parallel agent testing

### Fixed
- **ParamOrder performance** - Replace O(n²) array append with O(1) mapping insert
- **Benchmark accuracy** - Improve regression detection with rolling averages
- **Test infrastructure** - Enhanced test-agent script with quality reporting

### Changed
- **Test coverage** - Converted 286 placeholder tests to real assertions (symbols, config, hierarchy, diagnostics, advanced features)
- **Agent protocols** - Standardized workflow, TDD, and Pike code style guidelines

## [0.1.0-alpha.16] - 2026-02-06

### Fixed
- **Completion tests** - Fixed E2E test skips for scope operator features
- **Signature help** - Added complex_function call test for signature help
- **Test script path** - Corrected npm test script path in pike-lsp-server package

## [0.1.0-alpha.15] - 2026-02-05

### Added
- **Scope operator completion** - Implement `this_program::` and `this::` scope operator completion for class members
- **Member access completion** - Implement `obj->` member access completion with deprecated tag support
- **Module resolution** - Actual module resolution with waterfall loading for workspace symbols

### Fixed
- **Completion fallbacks** - Improve completion heuristics for edge cases
- **Rate limiter** - Make rate limiter opt-in (disabled by default)
- **Code review findings** - Address codebase review findings and add pre-commit guards

## [0.1.0-alpha.14] - 2026-02-03

### Added
- **Linked editing** - VSCode linked ranges for multi-cursor editing
- **Rate limiting** - Configurable rate limiter for LSP requests
- **AutoDoc coverage** - 100% AutoDoc tag coverage with robust parsing
- **AutoDoc tags** - Render `@returns`, `@mapping`, `@member` tags in hover

### Fixed
- **Import/inherit resolution** - Improve with workspace symbol caching
- **Import vs include** - Distinguish `#include` directives from module imports for proper navigation
- **Reference counting** - Exclude definitions from reference counts and prioritize main signatures
- **ESM compatibility** - Remove CJS fallback for ESM compatibility
- **Duplicate code** - Consolidate duplicate code in Pike LSP modules
- **Code review guards** - Add pre-commit hooks to enforce quality standards

### Changed
- **Install script** - Make install script non-interactive and exclude bloat from VSIX
- **Build warnings** - Suppress esbuild import.meta warnings when bundling to CJS

## [0.1.0-alpha.13] - 2026-02-01

### Optimization
- **Benchmark regression detection** - Raise absolute diff floor to 2ms for fast benchmarks (<10ms average) to properly absorb CI timing jitter while still catching real regressions

### Added
- **Smart Completion** - E2E tests for VSCode extension smart completion feature
- **TDD Coverage** - 100% test coverage for smart completion implementation

### Fixed
- **Benchmark thresholds** - Use proportional thresholds (50% for fast, 10% for medium benchmarks) instead of fixed percentage
- **TDD workflow** - Enforce test-first development in project guidelines
- **ESM compatibility** - Handle import.meta.url in bundled CJS code

### Test
- **TDD Test Suites** - Complete Phases 7-10 with 100% passing tests (550+ tests total)
- **Navigation Features** - Phase 1 TDD tests for go-to-definition, find references, hierarchy
- **Include Resolution** - Detect and resolve #include directives by checking source line text

## [0.1.0-alpha.12] - 2026-01-26

### Added
- **Benchmark Automation** - Release workflow now automatically generates and deploys benchmark page to gh-pages
- **generate-benchmark-page.js** - Script parses CHANGELOG Optimization sections and creates HTML dashboard with Chart.js visualizations

### Changed
- Release workflow fetches gh-pages branch to retrieve historical benchmark data
- pike-lsp-release skill converted from user scope to local project scope

### Removed
- Obsolete benchmarks.html file (now auto-generated by release workflow)

## [0.1.0-alpha.11] - 2026-01-26

### Added
- **Workspace References** - Find References now searches across the entire workspace, not just the current file
- **Include Navigation** - IntelliSense and navigation support for `#include` statements and included symbols
- **AutoDoc Support** - Template support for variable declarations in documentation
- Detailed logging for document symbols debugging

### Fixed
- **Diagnostics** - Resolved false positives for key-value pairs in `foreach` loops
- **Formatter** - Corrected indentation for `switch`/`case` statements
- **Testing** - E2E tests now prefer Xvfb over Weston for better headless stability

### Optimization
- **Tokenization reuse** - Cache and reuse tokenized results across analysis pipeline
- **Line splitting reuse** - Share computed line boundaries between operations
- **Variables analysis buffering** - Use string buffering for variables analysis
- **Incremental indexing** - Changed document classification identifies affected files for partial re-parsing

## [0.1.0-alpha.10] - 2026-01-26

### Fixed
- CI smoke test path updated for refactored Intelligence module (now at `Intelligence.pmod/Intelligence.pike`)

## [0.1.0-alpha.9] - 2026-01-26

### Fixed
- Constructor snippets for built-in classes (e.g. `Stdio.File`) now correctly include arguments by parsing program type signatures
- `Intelligence.pike` refactored to resolve circular dependency issues during compilation
- `Introspection.pike` dependencies made dynamic to prevent load-order issues

## [0.1.0-alpha.8] - 2026-01-24

### Added
- **Import IntelliSense** - Go-to-definition support for module paths (e.g., `Stdio.File`)
- **Member access navigation** - Navigate to definitions via `->` operator (e.g., `file->read`)
- **Expression utilities** - New `extractExpressionAtPosition()` for parsing Pike expressions at cursor
- `ExpressionInfo` type for structured expression representation (base, member, operator, isModulePath)
- Module path resolution for Pike stdlib modules (e.g., `Parser.Pike.split`)
- E2E tests for inlay hints, folding ranges, document links, and selection ranges

### Changed
- Converted dynamic `require()` calls to static ES6 `import` statements for better module resolution
- LSP server now sets proper working directory for correct module resolution
- Selection ranges hierarchy fixed (parent now points to larger enclosing range)

### Fixed
- Performance test assertions now count symbols recursively (including nested children)
- E2E test stability improvements for server-side features
- Benchmark false positives - Rolling average analysis replaces single-run comparison to reduce CI noise

### Technical
- Added `expression-utils.ts` with comprehensive expression parsing for Pike syntax
- Updated test infrastructure to run previously skipped E2E tests
- Added `apply-rolling-average.js` for z-score based benchmark regression detection

## [0.1.0-alpha.7] - 2026-01-24

### Added
- Code lens references now use standard VSCode peek view instead of custom QuickPick menu
- CTRL+CLICK on symbol definition shows references peek view (context-aware navigation)
- Comprehensive E2E LSP feature tests
- Document cache unit tests
- Stdlib index unit tests

### Changed
- References navigation now uses VSCode's native `vscode.openLocations` command
- Definition handler provides context-aware behavior (references when on definition, navigation when on usage)

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

[0.1.0-alpha.8]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.8
[0.1.0-alpha.7]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.7
[0.1.0-alpha.6]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.6
[0.1.0-alpha.5]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.5
[0.1.0-alpha.4]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.4
[0.1.0-alpha.2]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/TheSmuks/pike-lsp/releases/tag/v0.1.0-alpha.1

