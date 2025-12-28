# Changelog

All notable changes to the Pike LSP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-26

### 🎉 Initial Release

A full-featured Language Server Protocol implementation for Pike.

### Features

#### Core LSP Features
- **Document Symbols** - Outline view with classes, methods, variables, constants
- **Workspace Symbols** - Search symbols across entire project (Ctrl+T)
- **Hover** - Type information and documentation on mouse hover
- **Completions** - Intelligent autocomplete with snippets
- **Signature Help** - Parameter hints while typing function calls
- **Diagnostics** - Real-time syntax error detection via Pike compiler

#### Navigation
- **Go to Definition** (F12) - Jump to symbol definitions
- **Go to Declaration** - Navigate to declarations
- **Go to Type Definition** - Navigate to type definitions
- **Find References** (Shift+F12) - Find all usages of a symbol
- **Find Implementations** - Find interface implementations

#### Refactoring
- **Rename Symbol** (F2) - Safely rename across files
- **Code Actions** - Quick fixes and organize imports

#### Hierarchy
- **Call Hierarchy** - View incoming/outgoing function calls
- **Type Hierarchy** - Explore class inheritance

#### Advanced Features
- **Code Lens** - Reference counts above functions/classes
- **Document Links** - Clickable paths in inherit statements
- **Inlay Hints** - Parameter name hints
- **Semantic Tokens** - Enhanced syntax highlighting
- **Selection Ranges** - Smart selection expansion
- **Folding Ranges** - Code folding for classes and functions
- **Document Formatting** - Format entire document or selection

### Performance
- **Batch Parsing** - Process multiple files in single request
- **Stdlib Caching** - Pre-warm cache for common Pike modules
- **Token-based Symbol Finding** - 5x faster than regex approach
- **Conditional Debug Logging** - Zero overhead in production

### Quality
- **Type Guards** - Runtime validation for Pike responses
- **Centralized Constants** - No magic numbers
- **Consolidated Regex** - Reusable patterns

### Testing
- **10 test suites** with 2,977 lines of test code
- **100% Pike stdlib compatibility** - All 546+ files parse
- **Performance benchmarks** - Verified speed metrics
- **CI/CD** - GitHub Actions for automated testing

### Technical
- Built with TypeScript and vscode-languageserver-node
- Uses Pike's native Parser.Pike and Tools.AutoDoc
- JSON-RPC over stdio for reliable IPC
- Monorepo structure with pnpm workspaces

---

## [0.1.0] - 2024-XX-XX (Pre-release)

### Added
- Initial LSP server implementation
- Pike bridge for TypeScript ↔ Pike communication
- Basic syntax highlighting and tokenization
- VS Code extension scaffold
- Support for `.pike` and `.pmod` files

---

[1.0.0]: https://github.com/pike-lsp/pike-lsp/releases/tag/v1.0.0
[0.1.0]: https://github.com/pike-lsp/pike-lsp/releases/tag/v0.1.0
