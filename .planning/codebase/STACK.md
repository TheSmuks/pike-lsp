# Technology Stack

**Analysis Date:** 2026-01-23

## Languages

**Primary:**
- TypeScript 5.3.0 - All TypeScript packages (bridge, LSP server, VSCode extension, core)
- Pike 8.0+ - Pike language analyzer subprocess (`pike-scripts/analyzer.pike`, `LSP.pmod/*`)

**Secondary:**
- Bash - Git hooks, CI/CD scripts, build scripts
- JSON - Configuration files, TextMate grammar
- YAML - GitHub Actions workflows

## Runtime

**Environment:**
- Node.js >=18.0.0 (CI uses Node 20.x)
- Pike 8.0+ ( Pike 8.0.1116 tested, Pike 8.1116 target)

**Package Manager:**
- pnpm >=8.0.0 (8.15.0 specified in root `package.json`)
- Lockfile: pnpm-lock.yaml (present, committed)

## Frameworks

**Core:**
- vscode-languageserver 9.0.1 - LSP protocol implementation in `packages/pike-lsp-server`
- vscode-languageclient 9.0.1 - VSCode extension client in `packages/vscode-pike`
- vscode-languageserver-textdocument 1.0.11 - Text document handling
- @vscode/test-electron 2.5.2 - VSCode extension E2E testing
- @vscode/vsce 2.22.0 - VSIX packaging

**Testing:**
- Node.js native test runner (`node --test`) - Bridge and LSP server tests
- Mocha 11.7.5 - VSCode extension unit tests
- @vscode/test-cli 0.0.12 - VSCode test runner

**Build/Dev:**
- esbuild 0.20.0 - Extension bundling (`packages/vscode-pike`)
- TypeScript 5.3.0 - All TypeScript packages
- mitata 1.0.34 - Benchmarking framework
- tsx 4.21.0 - TypeScript execution for benchmarks
- husky 9.1.7 - Git hooks

## Key Dependencies

**Critical:**
- @pike-lsp/core - Shared utilities (logging, errors)
- @pike-lsp/pike-bridge - TypeScript <-> Pike subprocess IPC
- @pike-lsp/pike-lsp-server - LSP server implementation
- workspace:* protocol - Monorepo workspace dependencies

**Infrastructure:**
- Pike stdlib modules (Parser.Pike, Tools.AutoDoc, String, Stdio) - Used by `pike-scripts/analyzer.pike`

## Configuration

**Environment:**
- TypeScript project references - Root `tsconfig.json` references all packages
- Composite builds - TypeScript builds in dependency order
- Strict mode enabled - All compiler strict options

**Build:**
- esbuild for VSCode extension bundle
- TypeScript compiler (tsc) for all packages
- pnpm workspace with `packages/*` pattern

**Platform Requirements:**

**Development:**
- Node.js 18+ / 20.x
- pnpm 8+
- Pike 8.0+ (for running analyzer)
- Linux/Unix-like environment (Pike installation)

**Production:**
- VSCode 1.85.0+
- Node.js 18+ (extension runtime)
- Pike 8.0+ (user's system for language analysis)

---

*Stack analysis: 2026-01-23*
