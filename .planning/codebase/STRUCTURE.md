# Codebase Structure

**Analysis Date:** 2025-01-23

## Directory Layout

```
[project-root]/
├── packages/                    # Monorepo packages
│   ├── core/                    # Shared TypeScript utilities
│   ├── pike-bridge/             # TypeScript <-> Pike IPC
│   ├── pike-lsp-server/         # LSP server implementation
│   └── vscode-pike/             # VSCode extension
├── pike-scripts/                # Pike language implementation
│   └── LSP.pmod/                # Pike modules
├── scripts/                     # Build and test scripts
├── test/                        # Integration test fixtures
├── .github/workflows/           # CI/CD pipelines
└── .planning/                   # GSD planning documents
```

## Directory Purposes

**packages/core:**
- Purpose: Shared TypeScript utilities and error types
- Contains: Logger, PikeError custom error class
- Key files: `packages/core/src/logging.ts`, `packages/core/src/errors.ts`

**packages/pike-bridge:**
- Purpose: JSON-RPC client for communicating with Pike subprocess
- Contains: PikeBridge class, PikeProcess wrapper, type definitions
- Key files: `packages/pike-bridge/src/bridge.ts`, `packages/pike-bridge/src/process.ts`, `packages/pike-bridge/src/types.ts`

**packages/pike-lsp-server:**
- Purpose: LSP protocol implementation and feature handlers
- Contains: Server entry point, feature modules, services, tests
- Key files: `packages/pike-lsp-server/src/server.ts`, `packages/pike-lsp-server/src/features/*.ts`, `packages/pike-lsp-server/src/services/*.ts`

**packages/vscode-pike:**
- Purpose: VSCode extension integration
- Contains: Extension activation, LSP client configuration, test suites
- Key files: `packages/vscode-pike/src/extension.ts`, `packages/vscode-pike/src/test/`

**pike-scripts:**
- Purpose: Pike language analyzer implementation
- Contains: JSON-RPC server, Pike modules for parsing/introspection
- Key files: `pike-scripts/analyzer.pike`, `pike-scripts/LSP.pmod/*.pike`, `pike-scripts/LSP.pmod/*.pmod`

**scripts:**
- Purpose: Build automation and test utilities
- Contains: Test runners, bundling scripts, CI helpers
- Key files: `scripts/run-tests.sh`, `scripts/bundle-server.sh`, `scripts/test-headless.sh`

## Key File Locations

**Entry Points:**
- `packages/vscode-pike/src/extension.ts`: VSCode extension activation
- `packages/pike-lsp-server/src/server.ts`: LSP server main entry
- `pike-scripts/analyzer.pike`: Pike subprocess entry point

**Configuration:**
- `package.json`: Root monorepo configuration (pnpm workspace)
- `packages/*/package.json`: Individual package configurations
- `tsconfig.json`, `tsconfig.base.json`: TypeScript compilation settings
- `packages/vscode-pike/language-configuration.json`: Pike language rules
- `.github/workflows/*.yml`: CI/CD pipeline definitions

**Core Logic:**
- `packages/pike-bridge/src/bridge.ts`: JSON-RPC client implementation
- `packages/pike-lsp-server/src/features/`: LSP capability handlers
- `packages/pike-lsp-server/src/services/`: Shared services (cache, index, bridge manager)
- `pike-scripts/LSP.pmod/Parser.pike`: Pike parsing and tokenization
- `pike-scripts/LSP.pmod/Intelligence.pike`: Type introspection and resolution
- `pike-scripts/LSP.pmod/Analysis.pike`: Diagnostics and code analysis

**Testing:**
- `packages/vscode-pike/src/test/integration/`: E2E LSP feature tests
- `packages/pike-lsp-server/src/tests/`: Server unit and integration tests
- `packages/pike-bridge/src/*.test.ts`: Bridge unit tests
- `test/`: Shared test fixtures and sample Pike code

## Naming Conventions

**Files:**
- TypeScript: `camelCase.ts` (e.g., `bridge-manager.ts`, `document-cache.ts`)
- Tests: `*.test.ts` or `*.test.js` (e.g., `bridge.test.ts`, `smoke.test.js`)
- Pike: `PascalCase.pike` or `lowercase.pmod` (e.g., `Parser.pike`, `Cache.pmod`)
- Config: `kebab-case.json` or `kebab-case.yml` (e.g., `package.json`, `release.yml`)

**Directories:**
- TypeScript: `kebab-case` (e.g., `pike-lsp-server`, `vscode-pike`)
- Pike modules: `PascalCase.pmod` (e.g., `Intelligence.pmod`, `Analysis.pmod`)

**Functions/Methods:**
- TypeScript: `camelCase` (e.g., `indexDocument`, `getCompletionContext`)
- Pike: `snake_case` (e.g., `parse_request`, `resolve_module`)

**Classes/Interfaces:**
- TypeScript: `PascalCase` (e.g., `PikeBridge`, `WorkspaceIndex`, `Services`)
- Pike: `PascalCase` (e.g., `class Context`, `class Parser`)

## Where to Add New Code

**New LSP Feature:**
- Primary code: `packages/pike-lsp-server/src/features/[feature-name].ts`
- Tests: `packages/pike-lsp-server/src/tests/[feature-name]-tests.ts`
- Integration: Add to `packages/pike-lsp-server/src/features/index.ts`

**New LSP Capability Handler:**
- Implementation: `packages/pike-lsp-server/src/features/[category].ts`
- Export: Add to `packages/pike-lsp-server/src/features/index.ts`
- Register: Call `register[Category]Handlers()` in `server.ts`

**New Service:**
- Implementation: `packages/pike-lsp-server/src/services/[service-name].ts`
- Export: Add to `packages/pike-lsp-server/src/services/index.ts`
- Inject: Add to `Services` interface in `services/index.ts`
- Access: Pass via `services` parameter to feature handlers

**New Pike Analysis Function:**
- Implementation: `pike-scripts/LSP.pmod/[Module].pike` or `pike-scripts/LSP.pmod/[Module]/handler.pike`
- Register: Add handler to `HANDLERS` mapping in `analyzer.pike`
- Bridge method: Add to `packages/pike-bridge/src/types.ts` and `bridge.ts`

**New VSCode Command:**
- Handler: `packages/vscode-pike/src/extension.ts` (register in `activateInternal`)
- Contribution: Add to `contributes.commands` in `packages/vscode-pike/package.json`

**Utilities:**
- Shared helpers: `packages/core/src/[utility].ts`
- Bridge utilities: `packages/pike-bridge/src/[utility].ts`
- LSP utilities: `packages/pike-lsp-server/src/utils/[utility].ts`

## Special Directories

**dist/:**
- Purpose: Compiled JavaScript output (not in version control)
- Generated: Yes
- Committed: No (gitignored)

**node_modules/:**
- Purpose: npm package dependencies
- Generated: Yes
- Committed: No (gitignored)

**.vscode-test/:**
- Purpose: Downloaded VSCode binaries for testing
- Generated: Yes
- Committed: No (gitignored)

**packages/pike-lsp-server/pike-scripts:**
- Purpose: Copy of `pike-scripts/` for server distribution
- Generated: Yes (symlinked or copied during build)
- Committed: Yes (for standalone server package)

**packages/pike-lsp-server/packages:**
- Purpose: Nested package structure (build artifact)
- Generated: Yes
- Committed: No (development artifact)

**test-workspace/:**
- Purpose: VSCode test fixture directory
- Generated: Yes
- Committed: Yes (test fixtures)

**LSP.pmod/ (Pike modules):**
- Purpose: Pike module namespace for LSP implementation
- Generated: No (source code)
- Committed: Yes
- Note: Uses `.pmod` extension for Pike modules

---

*Structure analysis: 2025-01-23*
