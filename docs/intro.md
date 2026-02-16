---
id: index
title: Introduction
sidebar_label: Welcome
description: Pike LSP - Language Server Protocol implementation for Pike
slug: /
---

# Pike LSP - Language Server for Pike

[![CI Tests](https://github.com/TheSmuks/pike-lsp/workflows/Test/badge.svg)](https://github.com/TheSmuks/pike-lsp/actions/workflows/test.yml)
[![Benchmarks](https://img.shields.io/badge/Benchmark-GitHub%20Pages-24292f.svg)](https://thesmuks.github.io/pike-lsp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/TheSmuks/pike-lsp/blob/main/LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![Pike](https://img.shields.io/badge/Pike-8.0+-orange.svg)](https://pike.lysator.liu.se/)
[![Status](https://img.shields.io/badge/Status-Alpha-yellow.svg)](https://github.com/TheSmuks/pike-lsp/releases)

A comprehensive Language Server Protocol (LSP) implementation for the [Pike programming language](https://pike.lysator.liu.se/), providing modern IDE features for VS Code and other LSP-compatible editors.

:::note
This project is in alpha. While functional for everyday use, some features may be incomplete or subject to change. This software is provided "as is" without warranty.
:::

## Requirements

- [Pike](https://pike.lysator.liu.se/) 8.0 or higher
- [Node.js](https://nodejs.org/) 18 or higher
- [VS Code](https://code.visualstudio.com/) 1.85+

## Quick Start

1. Install the extension from VS Code Marketplace
2. Open a `.pike` or `.pmod` file
3. Start coding with full LSP support!

## Project Structure

```
pike-lsp/
├── packages/
│   ├── pike-bridge/         # TypeScript ↔ Pike IPC layer
│   ├── pike-lsp-server/     # LSP server implementation
│   └── vscode-pike/        # VS Code extension
├── pike-scripts/
│   ├── analyzer.pike        # Pike parsing entry point
│   └── LSP.pmod/           # Pike modular analyzer logic
└── docs/                   # Documentation
```

## License

MIT License - see [LICENSE](https://github.com/TheSmuks/pike-lsp/blob/main/LICENSE) for details.

## Acknowledgments

- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node) - LSP framework
- [Pike](https://pike.lysator.liu.se/) - The Pike programming language
- [Tools.AutoDoc](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Tools/AutoDoc.html) - Pike's documentation parser
