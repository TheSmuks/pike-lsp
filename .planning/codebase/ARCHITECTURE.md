# Architecture

**Analysis Date:** 2025-01-23

## Pattern Overview

**Overall:** Multi-language microkernel with JSON-RPC bridges

**Key Characteristics:**
- Layered architecture with clear separation of concerns
- Language boundaries crossed via well-defined IPC protocols
- Service-oriented design with dependency injection
- Event-driven communication with observable patterns

## Layers

**VSCode Extension Layer:**
- Purpose: VSCode integration, UI presentation, and extension lifecycle
- Location: `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts`
- Contains: Extension activation, configuration management, command registration
- Depends on: LSP client library (`vscode-languageclient`)
- Used by: VSCode host application

**LSP Server Layer:**
- Purpose: Language Server Protocol implementation, request routing
- Location: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts`
- Contains: LSP connection management, capability declaration, feature handler registration
- Depends on: Feature handlers, PikeBridge, workspace indexers
- Used by: VSCode extension (via LSP client)

**Feature Handlers Layer:**
- Purpose: Individual LSP capability implementations
- Location: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/`
- Contains: Symbols, navigation, diagnostics, completion, hierarchy handlers
- Depends on: Services bundle (bridge, cache, indices)
- Used by: LSP server

**Services Layer:**
- Purpose: Shared services and state management
- Location: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/`
- Contains: Bridge manager, document cache, type database, workspace index, stdlib index
- Depends on: PikeBridge, core utilities
- Used by: Feature handlers

**Bridge Layer:**
- Purpose: TypeScript to Pike subprocess communication
- Location: `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts`
- Contains: JSON-RPC client, process management, request deduplication
- Depends on: PikeProcess, core utilities
- Used by: LSP server services

**Pike Analysis Layer:**
- Purpose: Pike language parsing, compilation, and introspection
- Location: `/home/smuks/OpenCode/pike-lsp/pike-scripts/analyzer.pike` and `LSP.pmod/`
- Contains: Parser, intelligence (introspection), analysis (diagnostics), caching
- Depends on: Pike stdlib (Parser.Pike, Tools.AutoDoc, etc.)
- Used by: Bridge via JSON-RPC

## Data Flow

**Language Feature Request (e.g., go-to-definition):**

1. User triggers action in VSCode (F12 on symbol)
2. VSCode extension receives action via command or LSP client
3. LSP client sends `textDocument/definition` request to LSP server
4. LSP server routes to `registerNavigationHandlers` -> definition handler
5. Handler calls `services.bridge.analyze()` with `['parse', 'introspect']`
6. BridgeManager forwards to PikeBridge
7. PikeBridge sends JSON-RPC request to Pike subprocess
8. `analyzer.pike` receives request, routes to `Parser.pike` and `Intelligence.pike`
9. Pike modules compile code and extract type information
10. Response travels back: Pike -> Bridge -> Handler -> LSP Server -> VSCode
11. VSCode displays location

**Document Change and Diagnostics:**

1. User edits file in VSCode
2. VSCode sends `textDocument/didChange` notification
3. LSP server `diagnostics.ts` handler receives change
4. Handler schedules debounced validation (configurable delay)
5. On trigger, calls `services.bridge.analyze()` with `['diagnostics', 'parse']`
6. Bridge compiles code and returns syntax errors
7. Diagnostics published via `connection.sendDiagnostics()`
8. VSCode displays red squiggles

**Workspace Indexing:**

1. LSP server initializes and detects workspace folders
2. `WorkspaceIndex.indexDirectory()` walks workspace recursively
3. Uses `bridge.batchParse()` for efficient multi-file parsing
4. Extracted symbols stored in nested Map structure (URI -> symbols)
5. Symbol lookup index built (name -> URI -> entry)
6. Workspace symbol queries search the flattened index

**State Management:**
- Documents: `DocumentCache` stores LSP TextDocuments by URI
- Types: `TypeDatabase` caches compiled Pike programs with LRU eviction
- Workspace: `WorkspaceIndex` maintains in-memory symbol index
- Stdlib: `StdlibIndexManager` lazy-loads and caches stdlib modules
- Settings: `globalSettings` object mutated by configuration changes

## Key Abstractions

**Services Bundle:**
- Purpose: Dependency injection container for feature handlers
- Examples: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/index.ts`
- Pattern: Singleton services passed via `Services` interface to handlers

**PikeBridge:**
- Purpose: JSON-RPC client with automatic request deduplication
- Examples: `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts`
- Pattern: In-flight request Map prevents duplicate concurrent calls

**AnalyzeResponse:**
- Purpose: Unified response structure for multi-operation requests
- Examples: Parse + introspect + diagnostics in single round-trip
- Pattern: `result` object + `failures` object + `_perf` timing metadata

**Context (Pike side):**
- Purpose: Service container for Pike modules
- Examples: `/home/smuks/OpenCode/pike-lsp/pike-scripts/analyzer.pike`
- Pattern: Singleton instances created once at startup, passed to handlers

## Entry Points

**VSCode Extension:**
- Location: `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts`
- Triggers: VSCode loads extension on `.pike` file open
- Responsibilities: Create LSP client, register commands, manage configuration

**LSP Server:**
- Location: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts`
- Triggers: Spawned by VSCode extension as subprocess
- Responsibilities: Initialize connection, register feature handlers, start Pike bridge

**Pike Analyzer:**
- Location: `/home/smuks/OpenCode/pike-lsp/pike-scripts/analyzer.pike`
- Triggers: Spawned by PikeBridge as persistent subprocess
- Responsibilities: JSON-RPC routing, Pike compilation, symbol extraction

**Feature Handlers:**
- Location: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/*.ts`
- Triggers: Called by LSP server on protocol requests
- Responsibilities: Implement individual LSP capabilities

## Error Handling

**Strategy:** Graceful degradation with detailed error propagation

**Patterns:**
- PikeBridge: Emits `stderr` events, rejects pending requests on process exit
- BridgeManager: Caches recent errors for health reporting, logs with Logger
- Feature handlers: Return empty results (not null) on bridge failure
- LSP Server: Logs to `connection.console` for debugging
- VSCode Extension: Shows warning messages but keeps syntax highlighting working

## Cross-Cutting Concerns

**Logging:**
- TypeScript: `@pike-lsp/core` Logger with levels (error, warn, info, debug, trace)
- Pike: Conditional debug mode (disabled by default for performance)
- VSCode: OutputChannel captures all server communication

**Validation:**
- Input: LSP validators in feature handlers check parameters
- Pike: Compilation errors caught and returned as diagnostics
- Configuration: Schema validation in VSCode package.json

**Authentication:** Not applicable (local development tool)

**Caching:**
- Pike: `LSP.CompilationCache` with LRU eviction and memory budget
- TypeScript: `TypeDatabase` for compiled programs, `StdlibIndexManager` for stdlib
- Requests: In-flight request deduplication in PikeBridge

---

*Architecture analysis: 2025-01-23*
