# Architecture

**Analysis Date:** 2025-01-19

## Pattern Overview

**Overall:** Multi-process Client-Server with IPC Bridge

The Pike LSP implements a hybrid architecture combining a Node.js Language Server Protocol (LSP) server with a Pike subprocess bridge. This design allows TypeScript-based LSP features to leverage Pike's native parsing and introspection capabilities through JSON-RPC over stdin/stdout.

**Key Characteristics:**
- **Separation of concerns**: LSP protocol handling in Node.js, Pike analysis in native Pike
- **IPC communication**: JSON-RPC protocol between bridge and Pike subprocess
- **Monorepo structure**: Four interdependent TypeScript packages plus Pike scripts
- **Lazy loading**: Stdlib modules loaded on-demand with LRU caching
- **Event-driven**: Uses EventEmitter for subprocess lifecycle events

## Layers

**Presentation Layer (VSCode Extension):**
- Purpose: VSCode integration, language activation, client configuration
- Location: `packages/vscode-pike/src/`
- Contains: Extension activation, command registration, LSP client startup
- Depends on: `vscode-languageclient/node`, `pike-lsp-server`
- Used by: VSCode editor host

**LSP Server Layer:**
- Purpose: Implements Language Server Protocol, handles all LSP requests
- Location: `packages/pike-lsp-server/src/`
- Contains: Protocol handlers, document management, feature implementations
- Depends on: `@pike-lsp/pike-bridge`, `@pike-lsp/pike-analyzer`, `vscode-languageserver`
- Used by: VSCode extension via IPC

**Bridge Layer:**
- Purpose: TypeScript-to-Pike IPC communication layer
- Location: `packages/pike-bridge/src/`
- Contains: Subprocess management, request/response handling, serialization
- Depends on: Node.js `child_process`, `events`, Pike analyzer script
- Used by: LSP server, type database, workspace indexer

**Analysis Layer (Pike Scripts):**
- Purpose: Native Pike parsing, tokenization, and introspection
- Location: `pike-scripts/`
- Contains: `analyzer.pike` (parsing), `type-introspector.pike` (type analysis)
- Depends on: Pike 8.0+ standard library (Parser.Pike, Tools.AutoDoc)
- Used by: Bridge layer via subprocess communication

**Data Layer:**
- Purpose: Indexing, caching, and type information storage
- Location: `packages/pike-lsp-server/src/workspace-index.ts`, `type-database.ts`, `stdlib-index.ts`
- Contains: Symbol indices, compiled program cache, inheritance graphs
- Depends on: Bridge layer for data, LSP layer for coordination
- Used by: LSP server for fast lookups

## Data Flow

**LSP Request Flow:**

1. VSCode sends LSP request (e.g., `textDocument/completion`) to extension
2. Extension forwards to `pike-lsp-server` via LanguageClient IPC
3. LSP server checks local caches (document cache, type database, workspace index)
4. On cache miss, server calls `PikeBridge` method (e.g., `parse()`, `introspect()`)
5. Bridge serializes request to JSON, writes to Pike subprocess stdin
6. Pike subprocess (`analyzer.pike` or `type-introspector.pike`) processes request
7. Pike subprocess writes JSON response to stdout
8. Bridge deserializes response, returns typed result to server
9. Server processes result, formats as LSP response
10. Response flows back through client to VSCode

**Document Change Flow:**

1. User edits file in VSCode
2. `didChange` notification sent to LSP server
3. Server updates document cache, debounces validation
4. After delay, `validateDocument()` calls `bridge.compile()` or `bridge.introspect()`
5. Diagnostics published via `connection.sendDiagnostics()`
6. Document re-indexed in workspace index for workspace symbol search

**Workspace Indexing Flow:**

1. On server initialization, workspace folders enumerated
2. `workspaceIndex.indexDirectory()` finds all `.pike` and `.pmod` files
3. Files batched (up to 50) for `bridge.batchParse()`
4. Results stored in nested Map structure for O(1) lookup
5. Symbol lookup index built: `{lowercaseName: Map<uri, SymbolEntry>}`

**State Management:**

- **Document cache**: `Map<uri, DocumentCache>` - symbols and diagnostics per open document
- **Type database**: `TypeDatabase` class - compiled programs, global symbol index, inheritance graph
- **Workspace index**: `WorkspaceIndex` class - symbol index across all files
- **Stdlib cache**: `StdlibIndexManager` class - lazy-loaded stdlib modules with LRU eviction
- **Bridge process**: Single long-lived Pike subprocess for entire session

## Key Abstractions

**PikeBridge:**
- Purpose: Manages Pike subprocess lifecycle and JSON-RPC communication
- Examples: `packages/pike-bridge/src/bridge.ts`
- Pattern: EventEmitter-based subprocess wrapper with request deduplication
- Key methods: `parse()`, `compile()`, `introspect()`, `resolveModule()`, `batchParse()`

**PikeSymbol hierarchy:**
- Purpose: Represents all Pike language constructs
- Examples: `packages/pike-bridge/src/types.ts` (PikeSymbol, PikeMethod, PikeClass, PikeVariable)
- Pattern: Discriminated union with `kind` field
- Used throughout: All symbol manipulation flows through this type

**LSP Request Handlers:**
- Purpose: Individual LSP protocol handlers
- Examples: `connection.onDefinition()`, `connection.onCompletion()` in `packages/pike-lsp-server/src/server.ts`
- Pattern: Register handlers during initialization, return LSP-compatible types
- Access shared: Document cache, bridge, workspace index, type database

**Index Managers:**
- Purpose: Fast symbol lookup across documents
- Examples: `WorkspaceIndex`, `TypeDatabase`, `StdlibIndexManager`
- Pattern: Map-based indices with LRU eviction, memory budgets
- Thread safety: Single-threaded (Node.js event loop)

## Entry Points

**VSCode Extension Activation:**
- Location: `packages/vscode-pike/src/extension.ts`
- Triggers: VSCode opens a `.pike` or `.pmod` file
- Responsibilities:
  - Locate LSP server bundle
  - Create `LanguageClient` with server options
  - Register commands (`pike-module-path.add`, `pike.showReferences`)
  - Handle configuration changes
  - Start LSP server via IPC

**LSP Server Initialization:**
- Location: `packages/pike-lsp-server/src/server.ts` - `connection.onInitialize()`
- Triggers: VSCode LanguageClient connects to server
- Responsibilities:
  - Find `analyzer.pike` script path
  - Create and start `PikeBridge` instance
  - Initialize `WorkspaceIndex`, `TypeDatabase`, `StdlibIndexManager`
  - Return server capabilities (23+ LSP features)

**Pike Analyzer Script:**
- Location: `pike-scripts/analyzer.pike`
- Triggers: Bridge subprocess starts with this script
- Responsibilities:
  - JSON-RPC request handler dispatch
  - Pike source parsing via `Tools.AutoDoc.PikeParser`
  - Tokenization via `Parser.Pike.tokenize()`
  - Module resolution via master `Pike.__locate_module()`

**Type Introspector Script:**
- Location: `pike-scripts/type-introspector.pike`
- Triggers: `introspect`, `resolve_stdlib`, `get_inherited` requests
- Responsibilities:
  - Compile Pike code with `compile_string()`
  - Extract type info via `_typeof()` operator
  - Build inheritance hierarchy
  - LRU cache for compiled programs

## Error Handling

**Strategy:** Multi-level with graceful degradation

**Bridge Level:**
- Subprocess crashes detected via `'close'` event
- Pending requests rejected with descriptive error
- Auto-restart on next request (lazy restart)
- stderr captured and forwarded to connection console

**LSP Server Level:**
- Bridge unavailable mode: Server continues with limited features
- Document parse failures: Logged, don't block other operations
- Type guard validation (`isPikeSymbol`, `isPikeParseResult`) prevents crashes
- Diagnostics clipped to `maxNumberOfProblems` setting

**VSCode Extension Level:**
- Server not found: Warning shown, syntax highlighting still works
- Extension activation failures: Logged to Output panel
- Configuration errors: Validated before restart

**Patterns:**
- Try-catch around all bridge calls
- Default return values on failures (empty arrays, null)
- User-facing messages via `window.showWarningMessage()`
- Console logging via `connection.console.log/error/warn()`

## Cross-Cutting Concerns

**Logging:** Multi-destination
- VSCode Output panel: "Pike Language Server" channel
- LSP console: `connection.console.log()` for server-side
- Bridge stderr: Forwarded to connection console
- Pike subprocess: Conditional debug mode (disabled by default for performance)

**Validation:** Type guards from `packages/pike-lsp-server/src/utils/validation.ts`
- Runtime validation of all Pike subprocess responses
- Prevents malformed data from crashing server
- `validatePikeResponse()` throws descriptive errors
- `safeArray()` filters invalid array items

**Authentication:** Not applicable (local tool)

**Configuration:**
- VSCode settings: `pike.pikePath`, `pike.pikeModulePath`, `pike.pikeIncludePath`
- Environment variables: `PIKE_MODULE_PATH`, `PIKE_INCLUDE_PATH`
- Constants: `packages/pike-lsp-server/src/constants/index.ts`
- Restart required on configuration changes

**Performance Optimizations:**
- Request deduplication: Identical inflight requests reused
- Batch parsing: Up to 50 files in single IPC call
- LRU eviction: Stdlib and compiled program caches bounded
- Debounced validation: Document changes batched (200-250ms delay)
- Lazy stdlib loading: Common modules preloaded on startup

---

*Architecture analysis: 2025-01-19*
