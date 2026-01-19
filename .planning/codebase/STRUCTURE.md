# Codebase Structure

**Analysis Date:** 2025-01-19

## Directory Layout

```
pike-lsp/
├── .agent/                  # Agent workflow definitions
│   └── workflows/           # GSD agent workflow documentation
├── .github/                 # GitHub Actions CI/CD
│   └── workflows/           # Test automation workflows
├── .planning/               # Planning documents (this directory)
│   └── codebase/            # Architecture and structure docs
├── docs/                    # Project documentation
│   └── plans/               # Design documents and plans
├── images/                  # Documentation images (demo.gif)
├── packages/                # Monorepo packages (pnpm workspace)
│   ├── pike-analyzer/       # Symbol table utilities
│   ├── pike-bridge/         # TypeScript <-> Pike IPC layer
│   ├── pike-lsp-server/     # LSP server implementation
│   └── vscode-pike/         # VSCode extension
├── pike-scripts/            # Pike native analysis scripts
│   ├── analyzer.pike        # Main JSON-RPC analyzer (3,200+ lines)
│   └── type-introspector.pike # Type introspection script
├── scripts/                 # Build and test scripts
├── test/                    # Test fixtures and suites
│   ├── fixtures/            # Sample Pike files for testing
│   └── suite/               # Integration test suites
├── package.json             # Root package.json (workspace config)
├── pnpm-workspace.yaml      # PNPM workspace definition
├── tsconfig.json            # Root TypeScript config
└── tsconfig.base.json       # Shared TypeScript config
```

## Directory Purposes

**`packages/pike-bridge/`:**
- Purpose: TypeScript-to-Pike subprocess communication
- Contains: `PikeBridge` class, type definitions, constants
- Key files:
  - `src/bridge.ts` - Main bridge implementation (784 lines)
  - `src/types.ts` - Complete type definitions for Pike-LSP communication
  - `src/constants.ts` - Bridge configuration constants
  - `src/index.ts` - Public API exports
- Exports: `@pike-lsp/pike-bridge` package

**`packages/pike-analyzer/`:**
- Purpose: Symbol table and analysis utilities (currently minimal)
- Contains: `SymbolTable` class for managing extracted symbols
- Key files:
  - `src/symbols.ts` - Symbol table implementation
  - `src/index.ts` - Re-exports symbols
- Exports: `@pike-lsp/pike-analyzer` package
- Note: Currently light; most analysis happens in Pike scripts

**`packages/pike-lsp-server/`:**
- Purpose: Language Server Protocol server
- Contains: All LSP feature implementations
- Key files:
  - `src/server.ts` - Main LSP server (36,000+ tokens, primary entry point)
  - `src/workspace-index.ts` - Workspace symbol indexing
  - `src/type-database.ts` - Compiled program cache and type inference
  - `src/stdlib-index.ts` - Lazy stdlib module loading
  - `src/constants/` - Server-wide constants
  - `src/utils/` - Helper utilities (regex patterns, validation, code lens)
  - `src/tests/` - Node.js test suite (10 test files)
- Exports: `@pike-lsp/pike-lsp-server` package

**`packages/vscode-pike/`:**
- Purpose: VSCode extension host
- Contains: Extension activation, LSP client, syntax highlighting
- Key files:
  - `src/extension.ts` - Extension activation (244 lines)
  - `package.json` - Extension manifest (commands, configurations)
  - `syntaxes/pike.tmLanguage.json` - TextMate grammar
  - `language-configuration.json` - Language configuration
- Exports: VSIX package for VSCode Marketplace

**`pike-scripts/`:**
- Purpose: Native Pike code for parsing and introspection
- Contains: JSON-RPC servers running in Pike interpreter
- Key files:
  - `analyzer.pike` - Main analyzer (parse, tokenize, compile, resolve, etc.)
  - `type-introspector.pike` - Type introspection and stdlib resolution
- Note: These are standalone Pike scripts, not TypeScript

**`test/`:**
- Purpose: Test fixtures and test infrastructure
- Contains: Sample Pike files for testing parser behavior
- Key files:
  - `fixtures/test.pike` - Sample Pike code
  - `suite/` - Additional test suites

**`scripts/`:**
- Purpose: Build automation and testing utilities
- Key files:
  - `run-tests.sh` - Run all package tests
  - `test-extension.sh` - Launch VSCode with extension loaded

## Key File Locations

**Entry Points:**
- `packages/vscode-pike/src/extension.ts`: VSCode extension activation, creates LSP client
- `packages/pike-lsp-server/src/server.ts`: LSP server, handles all protocol requests
- `pike-scripts/analyzer.pike`: Pike subprocess, handles parsing/tokenization requests

**Configuration:**
- `package.json`: Root workspace config, pnpm scripts
- `pnpm-workspace.yaml`: Monorepo workspace definition
- `tsconfig.json` / `tsconfig.base.json`: TypeScript compilation settings
- `packages/*/package.json`: Individual package configs
- `packages/*/tsconfig.json`: Package-specific TypeScript settings

**Core Logic:**
- `packages/pike-bridge/src/bridge.ts`: Subprocess lifecycle and IPC
- `packages/pike-lsp-server/src/workspace-index.ts`: Symbol indexing
- `packages/pike-lsp-server/src/type-database.ts`: Type information cache
- `packages/pike-lsp-server/src/stdlib-index.ts`: Stdlib lazy loading

**Testing:**
- `packages/pike-bridge/src/bridge.test.ts`: Bridge tests
- `packages/pike-lsp-server/src/tests/*.ts`: Server test suite (10 files)
- `packages/pike-lsp-server/src/workspace-index.test.ts`: Index tests
- `test/fixtures/test.pike`: Test data

**Utilities:**
- `packages/pike-lsp-server/src/constants/index.ts`: Server constants (timeouts, limits)
- `packages/pike-lsp-server/src/utils/regex-patterns.ts`: Centralized regex patterns
- `packages/pike-lsp-server/src/utils/validation.ts`: Type guards for Pike responses
- `packages/pike-lsp-server/src/utils/code-lens.ts`: Code lens command builder

## Naming Conventions

**Files:**
- TypeScript source: `*.ts` (all packages use `.ts` extension)
- Test files: `*.test.ts` (Node.js native test runner)
- Pike source: `*.pike`
- Pike modules: `*.pmod`
- Config: `*.json` (package.json, tsconfig.json), `*.yaml` (pnpm-workspace.yaml)
- Documentation: `*.md`

**Directories:**
- `src/`: Source code for each package
- `dist/`: Compiled JavaScript output (gitignored)
- `tests/` or `src/tests/`: Test files
- `utils/`: Helper modules
- `constants/`: Configuration constants

**Functions/Classes:**
- Classes: `PascalCase` (e.g., `PikeBridge`, `WorkspaceIndex`, `TypeDatabase`)
- Functions: `camelCase` (e.g., `indexDocument`, `findSymbol`, `validatePikeResponse`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_STDLIB_MODULES`, `BATCH_PARSE_MAX_SIZE`)

**TypeScript Modules:**
- Imports use `.js` extension (ESM): `from './bridge.js'`
- All packages are ESM modules (type: "module" in package.json)

## Where to Add New Code

**New LSP Feature:**
- Primary code: `packages/pike-lsp-server/src/server.ts` (add handler in `onInitialize`)
- Tests: `packages/pike-lsp-server/src/tests/` (create `lsp-*-tests.ts`)

**New Bridge Method:**
- Implementation: `packages/pike-bridge/src/bridge.ts` (add async method)
- Type definitions: `packages/pike-bridge/src/types.ts` (add to `PikeRequest['method']` union)
- Pike handler: `pike-scripts/analyzer.pike` (add `handle_*` function and case in `handle_request`)

**New Utility:**
- Shared helpers: `packages/pike-lsp-server/src/utils/` (create new file)
- Constants: `packages/pike-lsp-server/src/constants/index.ts`

**New VSCode Command:**
- Registration: `packages/vscode-pike/src/extension.ts` (register in `activate()`)
- Package.json: `packages/vscode-pike/package.json` (add to `contributes.commands`)

**New Type:**
- Bridge types: `packages/pike-bridge/src/types.ts`
- Server types: Inline in `packages/pike-lsp-server/src/server.ts` or separate file

**Tests:**
- Bridge tests: `packages/pike-bridge/src/bridge.test.ts`
- Server tests: `packages/pike-lsp-server/src/tests/lsp-*-tests.ts`
- Unit tests: Co-locate with source as `*.test.ts`

## Special Directories

**`dist/` (Generated, Not Committed):**
- Purpose: Compiled JavaScript output from TypeScript
- Created by: `tsc` during build
- Patterns: Each package has `dist/` mirroring `src/` structure
- Ignored by: `.gitignore`

**`node_modules/` (Generated, Not Committed):**
- Purpose: Installed dependencies
- Created by: `pnpm install`
- Ignored by: `.gitignore`

**`.github/workflows/` (Generated, Committed):**
- Purpose: CI/CD automation
- Files: GitHub Actions workflow YAML files
- Committed: Yes

**`packages/vscode-pike/server/` (Generated, Bundled):**
- Purpose: Bundled LSP server for VSIX distribution
- Created by: Build process copies from `pike-lsp-server/dist/`
- Committed: No (generated during packaging)

**`.planning/` (Documentation, Committed):**
- Purpose: Architecture and planning documentation
- Files: This directory (ARCHITECTURE.md, STRUCTURE.md)
- Committed: Yes

---

*Structure analysis: 2025-01-19*
