# Technology Stack

**Analysis Date:** 2026-01-19

## Languages

**Primary:**
- TypeScript 5.3.0 - All packages and server implementation (`packages/*/src/**/*.ts`)

**Secondary:**
- Pike 8.0+ - Backend analyzer script (`pike-scripts/analyzer.pike`, `pike-scripts/type-introspector.pike`)

## Runtime

**Environment:**
- Node.js >=18.0.0 - JavaScript runtime for LSP server and extension
- Pike 8.0+ - Required system dependency for parsing Pike source code

**Package Manager:**
- pnpm >=8.0.0 (8.15.0 specified)
- Lockfile: `pnpm-lock.yaml` (present)
- Workspace: `pnpm-workspace.yaml` with monorepo pattern `packages/*`

## Frameworks

**Core:**
- vscode-languageserver 9.0.1 - LSP server protocol implementation
- vscode-languageserver-textdocument 1.0.11 - Text document handling for LSP
- vscode-languageclient 9.0.1 - VSCode extension client for LSP communication

**Testing:**
- Node.js built-in test runner (`node --test`) - Native Node.js test framework
- No external test framework dependency (uses `node:test` and `node:assert/strict`)

**Build/Dev:**
- TypeScript 5.3.0 - Type checking and compilation
- esbuild 0.20.0 - Bundling for VSCode extension
- @vscode/vsce 2.22.0 - VSIX packaging for VSCode extension
- @types/node 20.10.0 - Node.js type definitions
- @types/vscode 1.85.0 - VSCode API type definitions

## Key Dependencies

**Critical:**
- @pike-lsp/pike-bridge (workspace:*) - TypeScript <-> Pike subprocess communication layer
- @pike-lsp/pike-analyzer (workspace:*) - Semantic analysis utilities using pike-bridge
- @pike-lsp/pike-lsp-server (workspace:*) - LSP server implementation

**Infrastructure:**
- child_process (Node.js built-in) - Spawning Pike subprocess via `spawn()`
- readline (Node.js built-in) - JSON-RPC communication over stdin/stdout
- events (Node.js built-in) - EventEmitter for bridge lifecycle events
- fs/fs/promises (Node.js built-in) - File system operations for workspace indexing

## Configuration

**Environment:**
- `PIKE_MODULE_PATH` - Colon-separated paths for Pike module resolution
- `PIKE_INCLUDE_PATH` - Colon-separated paths for Pike include resolution
- `pikePath` - VSCode setting for path to Pike executable (default: "pike")
- `pikeModulePath` - VSCode array setting for module paths
- `pikeIncludePath` - VSCode array setting for include paths
- `pike.trace.server` - LSP communication tracing ("off" | "messages" | "verbose")

**Build:**
- `tsconfig.base.json` - Shared TypeScript configuration with strict mode enabled
- `tsconfig.json` - Project references for monorepo packages
- `packages/*/tsconfig.json` - Per-package TypeScript configuration
- `esbuild` bundle config in `packages/vscode-pike/package.json`

## Platform Requirements

**Development:**
- Node.js 18+ (tested on 20.x)
- pnpm 8+ (8.15.0 specified)
- Pike 8.0+ (installed via `sudo apt-get install pike8.0` on Ubuntu)

**Production:**
- VSCode 1.85+ (extension requirement)
- Pike 8.0+ system dependency (must be available in PATH)
- Node.js 18+ runtime

---

*Stack analysis: 2026-01-19*
