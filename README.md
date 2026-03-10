# Pike LSP - Language Server for Pike

[![CI Tests](https://github.com/TheSmuks/pike-lsp/workflows/Test/badge.svg)](https://github.com/TheSmuks/pike-lsp/actions/workflows/test.yml)
[![Benchmarks](https://img.shields.io/badge/Benchmark-GitHub%20Pages-24292f.svg)](https://thesmuks.github.io/pike-lsp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![Pike](https://img.shields.io/badge/Pike-8.0+-orange.svg)](https://pike.lysator.liu.se/)
[![Status](https://img.shields.io/badge/Status-Alpha-yellow.svg)](https://github.com/TheSmuks/pike-lsp/releases)

Pike LSP provides modern Language Server Protocol features for Pike development in VS Code and other LSP-capable editors.

![Pike LSP Demo](docs/images/demo.gif)

## Current Status

- Project maturity: **Alpha** (actively developed, API and behavior may still evolve; see releases badge)
- Stability: functional for daily use, but breaking changes can happen between alpha releases
- CI and benchmarks: published publicly via the badges above

## Key Features

- Smart completion, hover, diagnostics, signature help, and formatting
- Navigation and refactoring tools: go to definition, references, rename, symbols
- Advanced language tooling: call hierarchy, type hierarchy, code lens, code actions
- Roxen-oriented support for `.pike`, `.inc`, `.html`, `.xml`, and `.rjs`

## Requirements

- [Pike](https://pike.lysator.liu.se/) 8.0+
- [Node.js](https://nodejs.org/) 18+
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

## Development

```bash
# Run all tests
./scripts/run-tests.sh

# Run targeted package tests
bun run --filter @pike-lsp/pike-bridge test
bun run --filter @pike-lsp/pike-lsp-server test
```

Additional docs:

- API reference: [`docs/api.md`](docs/api.md)
- Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Roxen roadmap: [`docs/roxen-roadmap.md`](docs/roxen-roadmap.md)

## CLA and Contributions

Contributions are welcome. By submitting a contribution, you agree to the project's Contributor License Agreement:

- CLA: [`docs/CLA.md`](docs/CLA.md)
- Contribution workflow: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE) for details.
