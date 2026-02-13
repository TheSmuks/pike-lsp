# Pike LSP - Language Server for Pike

[![CI Tests](https://github.com/TheSmuks/pike-lsp/workflows/Test/badge.svg)](https://github.com/TheSmuks/pike-lsp/actions/workflows/test.yml)
[![Benchmarks](https://img.shields.io/badge/Benchmark-GitHub%20Pages-24292f.svg)](https://thesmuks.github.io/pike-lsp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![Pike](https://img.shields.io/badge/Pike-8.0+-orange.svg)](https://pike.lysator.liu.se/)
[![Status](https://img.shields.io/badge/Status-Alpha-yellow.svg)](https://github.com/TheSmuks/pike-lsp/releases)

## Table of Contents

- [Features](#features)
- [Performance](#performance)
- [Requirements](#requirements)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Development](#development)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

A comprehensive Language Server Protocol (LSP) implementation for the [Pike programming language](https://pike.lysator.liu.se/), providing modern IDE features for VS Code and other LSP-compatible editors.

> **Note:** This project is in alpha. While functional for everyday use, some features may be incomplete or subject to change. This software is provided "as is" without warranty. See [LICENSE](LICENSE) for details.

![Pike LSP Demo](images/demo.gif)

## Features

### Core Language Features

| Feature | Description |
|---------|-------------|
| **Syntax Highlighting** | Full semantic token-based highlighting |
| **Code Completion** | Intelligent autocomplete with snippets |
| **Go to Definition** | Navigate to symbol definitions (F12) |
| **Find References** | Find all usages of a symbol |
| **Hover Information** | Type info, documentation, deprecation warnings |
| **Diagnostics** | Real-time syntax error detection |
| **Signature Help** | Parameter hints while typing |

### Advanced Features

| Feature | Description |
|---------|-------------|
| **Rename Symbol** | Safely rename across files (F2) |
| **Call Hierarchy** | View incoming/outgoing calls |
| **Type Hierarchy** | Explore class inheritance |
| **Code Lens** | Reference counts above functions |
| **Document Links** | Clickable paths in comments |
| **Inlay Hints** | Parameter name hints |
| **Workspace Symbols** | Search symbols project-wide |
| **Code Actions** | Quick fixes and organize imports |
| **Formatting** | Document and range formatting |
| **Smart Completion** | Scope operator (`::`, `->`) completion with deprecated tag support |
| **Linked Editing** | Multi-cursor editing for linked ranges |
| **Rate Limiting** | Configurable rate limiter for LSP requests |
| **AutoDoc Rendering** | Full AutoDoc tag support (@returns, @mapping, @member) |
| **Nested Classes** | Recursive extraction up to depth 5 with full symbol resolution |
| **Preprocessor Extraction** | Token-based symbol extraction from conditional blocks |

### Performance

- Parses 1000+ line files in ~15ms
- Batch parsing for fast workspace indexing
- Smart caching for stdlib modules
- 100% Pike 8 stdlib compatibility
- Modular architecture (TypeScript + Pike 8.1116)
- Runtime path discovery for cross-installation compatibility
- Hash-based cache eviction (7.2% faster on cache-intensive workloads)

> **View live benchmarks:** [thesmuks.github.io/pike-lsp](https://thesmuks.github.io/pike-lsp)

### Roxen Framework Support

Pike LSP provides comprehensive LSP support for the [Roxen WebServer](https://roxen.com/) framework across all file types and development scenarios.

#### Supported File Types

| File Type | Extension | Support Level |
|-----------|-----------|---------------|
| Pike Modules | `.pike` | ✅ Full LSP |
| RXML Templates | `.inc`, `.html`, `.xml` | ✅ Full LSP |
| Roxen JavaScript | `.rjs` | ✅ Full LSP |
| Mixed Content | `.pike` with embedded RXML | ✅ Full LSP |

#### Roxen-Specific Features

| Feature | Description |
|---------|-------------|
| **Module Detection** | Auto-detects Roxen modules via `inherit "module"`, `#include <module.h>`, or `constant module_type` |
| **defvar Extraction** | Extracts and groups module variables (defvars) in document outline |
| **RXML Tag Detection** | Identifies `simpletag_*`, `container_*`, and `RXML.Tag` class-based tags |
| **Lifecycle Callbacks** | Detects `create()`, `start()`, `stop()`, and other lifecycle methods |
| **Validation Diagnostics** | Warns about missing required callbacks (e.g., `query_location` for `MODULE_LOCATION`) |
| **Constant Completions** | Auto-completes `MODULE_*`, `TYPE_*`, `VAR_*` constants with correct bit-shifted values |
| **RequestID Completions** | Provides 23+ RequestID member completions (properties, methods) |
| **Tag Catalog Integration** | Integrates with Roxen's tag catalog for enhanced RXML support |

#### Custom File Extensions

For non-standard extensions, add file associations in VSCode settings:

```json
{
  "files.associations": {
    "*.rjs": "pike",
    "*.inc": "pike"
  }
}
```

#### Implementation Status

All 6 phases of Roxen framework support are complete:

- **Phase 1 (Pike Module Support)**: Module detection, defvar extraction, RXML tags, lifecycle callbacks, diagnostics
- **Phase 2 (RXML Template Support)**: `.inc`, `.html`, `.xml` files with pure RXML content (92 tests)
- **Phase 3 (.rjs Support)**: Roxen JavaScript files with template literal parsing (10 tests)
- **Phase 4 (Mixed Content)**: Files with both Pike and RXML embedded (31 tests)
- **Phase 5 (Tag Catalog Integration)**: Dynamic tag loading from running Roxen server (16 tests)
- **Phase 6 (Advanced LSP Features)**: Go-to-definition, find references, rename, hover, code actions (provider implementations complete)

**Total:** 223 Roxen-specific tests passing

See [ROXEN_SUPPORT_ROADMAP.md](ROXEN_SUPPORT_ROADMAP.md) for complete implementation details.

## Requirements

- [Pike](https://pike.lysator.liu.se/) 8.0 or higher
- [Node.js](https://nodejs.org/) 18 or higher
- [VS Code](https://code.visualstudio.com/) 1.85+

## Compatibility

### Supported Pike Versions

| Version | Status | Notes |
|---------|--------|-------|
| Pike 8.1116 | Required | Primary development target |
| Pike 8.x latest | Best-effort | Forward compatibility tested in CI |
| Pike 7.x | Not supported | Use Pike 8.1116 or later |

### Version Testing

This project uses a two-tier version support model:

- **CI tests** run on multiple Pike versions using a matrix strategy
- **Required version** (8.1116) must pass to merge
- **Latest version** failures don't block merge but are documented

### Version Detection

The analyzer detects and reports the Pike version at runtime. This information is available in the VS Code "Pike Language Server" output channel and via the "Pike: Show Health" command.

### Local Development

- Contributors can develop on Pike 8.1116
- CI handles the full version matrix automatically

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Pike Language Support"
4. Click Install

### From VSIX File
```bash
code --install-extension vscode-pike-1.0.0.vsix
```

### Build from Source
```bash
# Clone the repository
git clone https://github.com/TheSmuks/pike-lsp.git
cd pike-lsp

# Install dependencies (requires pnpm)
npm install -g pnpm
pnpm install

# Build all packages
pnpm build

# Package the VS Code extension
cd packages/vscode-pike
pnpm package
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Go to Definition | `F12` |
| Find References | `Shift+F12` |
| Rename Symbol | `F2` |
| Trigger Completion | `Ctrl+Space` |
| Signature Help | `Ctrl+Shift+Space` |
| Go to Symbol | `Ctrl+Shift+O` |
| Workspace Symbol | `Ctrl+T` |

## Configuration

Add these settings to your VS Code `settings.json`:

```json
{
    // Path to Pike executable (default: "pike")
    "pike.pikePath": "/usr/local/bin/pike",

    // LSP trace level for debugging
    "pike.trace.server": "off"  // "off" | "messages" | "verbose"
}
```

## Project Structure

```
pike-lsp/
├── packages/
│   ├── core/                # Shared utilities (errors, logging)
│   ├── pike-bridge/         # TypeScript ↔ Pike IPC layer
│   ├── pike-lsp-server/     # LSP server implementation
│   └── vscode-pike/         # VS Code extension
├── pike-scripts/
│   ├── analyzer.pike        # Pike parsing entry point
│   └── LSP.pmod/            # Pike modular analyzer logic
├── scripts/
│   ├── run-tests.sh         # Automated test runner
│   └── test-extension.sh    # Extension testing
└── test/                    # Test fixtures
```

## Testing

```bash
# Run all tests
./scripts/run-tests.sh

# Run specific test suites
pnpm --filter @pike-lsp/pike-bridge test
pnpm --filter @pike-lsp/pike-lsp-server test

# Run smoke tests
pnpm --filter @pike-lsp/pike-lsp-server test:smoke

# Run VSCode E2E tests (requires display or xvfb)
cd packages/vscode-pike && pnpm run test:e2e
```

### Pike Stdlib Source Paths

The stdlib parsing tests default to `../Pike` relative to this repo. Override as needed:

```bash
PIKE_SOURCE_ROOT=/path/to/Pike ./scripts/run-tests.sh
# or
PIKE_STDLIB=/path/to/Pike/lib/modules PIKE_TOOLS=/path/to/Pike/lib/include ./scripts/run-tests.sh
```

### Test Coverage

- Automated CI via GitHub Actions
- E2E feature tests verify symbols, hover, definition, and completion
- Smoke tests verify bridge stability and basic parsing

## Development

### Prerequisites

```bash
# Install pnpm globally
npm install -g pnpm

# Install Pike 8
# Ubuntu/Debian:
sudo apt-get install pike8.0

# macOS (if available via Homebrew):
brew install pike
```

### Building

```bash
pnpm install
pnpm build
```

### Testing the Extension

```bash
# Launch VS Code with extension loaded
./scripts/test-extension.sh
```

### Creating a Release

```bash
# 1. Update version in packages/vscode-pike/package.json
# 2. Update CHANGELOG.md
# 3. Build and package
pnpm build
cd packages/vscode-pike
pnpm package

# 4. The .vsix file is created in packages/vscode-pike/
```

## Known Limitations

While Pike LSP provides comprehensive IDE support, there are some known limitations:

| Limitation | Description | Impact |
|------------|-------------|--------|
| **Preprocessor Directives** | Symbols inside `#if`/`#else`/`#endif` blocks are now indexed using token-based extraction. Conditional symbols appear with metadata (e.g., `[#if DEBUG]`). | **Improved**: Conditional symbols are now visible in outline, completion, and hover. Limitation: Syntactically incomplete branches use best-effort token extraction (may miss complex patterns). |
| **Nested Classes** | Nested class declarations and their members are now recursively extracted up to depth 5. Document outline shows full hierarchy. | **Improved**: Go-to-definition, hover, and completion work for nested class members at all levels. Limitation: Very deep nesting (>5 levels) is capped for performance. |
| **Type Inference** | Basic types from literals and signatures work. Flow-sensitive analysis and generic type resolution are not implemented. | Explicit types show correctly. Complex scenarios like `if (cond) x = 1; else x = "str"` show `mixed` instead of a narrowed type. |
| **Dynamic Modules** | Runtime-loaded modules cannot be analyzed. | Completion won't show symbols from dynamically loaded code. |
| **Deep Nesting** | Nested classes deeper than 5 levels are capped for performance. | Very deep nesting (>5 levels) may have limited symbol extraction. |

## Troubleshooting

**Pike not found:**
```
Pike executable not found at "pike"
```
Ensure Pike 8.0+ is installed and in your PATH, or configure `pike.pikePath` in VS Code settings.

**Extension not activating:**
- Check that you have a `.pike` or `.pmod` file open
- Check the Output panel (View > Output > Pike Language Server) for errors

**Slow indexing on large projects:**
- Workspace indexing runs in the background and shouldn't block editing
- Initial indexing of large projects may take a few seconds

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`./scripts/run-tests.sh`)
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node) - LSP framework
- [Pike](https://pike.lysator.liu.se/) - The Pike programming language
- [Tools.AutoDoc](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Tools/AutoDoc.html) - Pike's documentation parser
