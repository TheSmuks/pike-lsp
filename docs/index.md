---
id: index
title: Introduction
sidebar_label: Welcome
description: Pike LSP - Language Server Protocol implementation for Pike
---

# Pike LSP - Language Server for Pike

[![CI Tests](https://github.com/TheSmuks/pike-lsp/workflows/Test/badge.svg)](https://github.com/TheSmuks/pike-lsp/actions/workflows/test.yml)
[![Benchmarks](https://img.shields.io/badge/Benchmark-GitHub%20Pages-24292f.svg)](https://thesmuks.github.io/pike-lsp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/TheSmuks/pike-lsp/blob/main/LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![Pike](https://img.shields.io/badge/Pike-8.0+-orange.svg)](https://pike.lysator.liu.se/)
[![Status](https://img.shields.io/badge/Status-Alpha-yellow.svg)](https://github.com/TheSmuks/pike-lsp/releases)

A comprehensive Language Server Protocol (LSP) implementation for the [Pike programming language](https://pike.lysator.liu.se/), providing modern IDE features for VS Code and other LSP-capable editors.

## Current Status

:::note Project Status
**Alpha** - The project is actively developed and functional for daily use. APIs and behavior may evolve between releases.
:::

- **Stability**: Functional for daily use
- **Test Coverage**: Comprehensive test suite including unit, integration, and E2E tests
- **CI/CD**: Automated testing and benchmarking via GitHub Actions
- **Documentation**: API docs auto-generated from TypeDoc and Pike autodoc

## Features

Pike LSP provides a full suite of language features:

### Core Language Features

- **Syntax Highlighting** - Semantic token-based highlighting
- **Code Completion** - Intelligent autocomplete with context-aware suggestions
- **Go to Definition** - Navigate to symbol definitions (F12)
- **Find References** - Find all usages of a symbol (Shift+F12)
- **Hover Information** - Type info and documentation on hover
- **Diagnostics** - Real-time syntax error detection
- **Signature Help** - Parameter hints while typing

### Advanced Features

- **Rename Symbol** - Safely rename across files (F2)
- **Call Hierarchy** - View incoming/outgoing calls
- **Type Hierarchy** - Explore class inheritance
- **Code Lens** - Reference counts above functions
- **Document Links** - Clickable paths in comments
- **Workspace Symbols** - Search symbols project-wide (Ctrl+T)
- **Code Actions** - Quick fixes and refactorings
- **Formatting** - Document and range formatting
- **Smart Completion** - Scope operator completion with deprecated tag support

### Roxen Framework Support

- **Module Detection** - Automatic detection of Roxen modules
- **RXML Completion** - Tag and attribute completion for RXML templates
- **Defvar Support** - Variable extraction and completions
- **Lifecycle Callbacks** - Detection and validation of module callbacks

## Requirements

- [Pike](https://pike.lysator.liu.se/) 8.0.1116 or higher
- [Node.js](https://nodejs.org/) 18 or higher
- [VS Code](https://code.visualstudio.com/) 1.85+ (for the extension)

## Quick Start

### Install from VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **Pike Language Support**
4. Install

### Build from Source

```bash
git clone https://github.com/TheSmuks/pike-lsp.git
cd pike-lsp
bun install
bun run build
```

## Project Structure

```
pike-lsp/
├── packages/
│   ├── pike-bridge/         # TypeScript ↔ Pike IPC layer
│   ├── pike-lsp-server/     # LSP server implementation
│   └── vscode-pike/          # VS Code extension
├── pike-scripts/
│   ├── analyzer.pike        # Pike parsing entry point
│   └── LSP.pmod/            # Pike modular analyzer logic
└── docs/                     # Documentation
```

## Next Steps

- [Getting Started](/docs/getting-started) - Installation and setup instructions
- [Features](/docs/features) - Complete feature list and usage
- [Configuration](/docs/configuration) - VS Code settings and options
- [API Reference](/docs/api) - TypeScript and Pike API documentation
- [Contributing](/docs/contributing) - How to contribute to the project

## License

MIT License - see [LICENSE](https://github.com/TheSmuks/pike-lsp/blob/main/LICENSE) for details.

## Acknowledgments

- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node) - LSP framework
- [Pike](https://pike.lysator.liu.se/) - The Pike programming language
- [Tools.AutoDoc](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Tools/AutoDoc.html) - Pike's documentation parser
