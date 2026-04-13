---
id: KB-ARCH-MONOREPO
domain: ARCHITECTURE
date: 2026-04-13
authors: [dga-coder]
summary: Monorepo structure and package boundaries for pike-lsp
---

# Monorepo Structure

Four packages under `packages/`, managed as a pike-lsp monorepo.

## Packages

| Package                     | Role                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@pike-lsp/core`            | Shared utilities: Logger, PikeError/BridgeError/LSPError hierarchy, PathSanitizer, StackTraceSanitizer, IdentifierHasher, JsonRpcRedactor, AnonymizerPipeline                                          |
| `@pike-lsp/pike-bridge`     | TypeScript-Pike IPC layer over JSON-RPC stdin/stdout. PikeProcess handles subprocess lifecycle; PikeBridge exposes typed business methods. Includes rate-limiter, response-validator, constants, types |
| `@pike-lsp/pike-lsp-server` | LSP implementation using vscode-languageserver. Orchestrates PikeBridge with services and features                                                                                                     |
| `vscode-pike`               | VS Code extension providing IntelliSense, go-to-definition, references, diagnostics, hover, signature help, completion, semantic tokens, call hierarchy, workspace symbols                             |

## Dependency Graph

```
vscode-pike --> pike-lsp-server --> pike-bridge --> core
                pike-lsp-server --> core
```

No package depends on vscode-pike. Core is leaf; vscode-pike is root.

## pike-lsp-server Source Layout

- `core/` — server startup, connection bootstrap
- `features/` — LSP feature handlers (completion, hover, definition, etc.)
- `services/` — BridgeManager, DocumentCache, IncludeResolver, ModuleContext, WorkspaceScanner, FormattingService, PikeIntrospectionService
- `runtime/` — Pike process lifecycle management
- `query-engine/` — query construction for bridge calls
- `utils/`, `types/`, `constants/` — shared server utilities
- `testing/`, `scenarios/`, `tests/` — test infrastructure and integration scenarios

## pike-bridge Modules

- `bridge.ts` — PikeBridge class, typed business logic over PikeProcess
- `process.ts` — PikeProcess class, JSON-RPC IPC with Pike subprocess
- `types.ts` — PikeSymbol hierarchy, PikeType discriminated union, request/response types
- `rate-limiter.ts` — request throttling to Pike subprocess
- `response-validator.ts` — validates and normalizes Pike responses
- `constants.ts` — shared bridge constants
- `benchmark-corpus.ts` — performance benchmarking support

## Core Modules

- `logging.ts` — Logger class, anonymizeSensitivePaths
- `errors.ts` — LSPError, PikeError, BridgeError (typed by ErrorLayer)
- `crash-report-anonymizer.ts` — PathSanitizer, StackTraceSanitizer, IdentifierHasher, JsonRpcRedactor, EnvironmentScrubber, CatchAllScanner, AnonymizerPipeline
