# Pike LSP Architecture

This document describes the architecture of the Pike Language Server implementation.

## LSP Architecture Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VSCode Extension                                │
│                       (packages/vscode-pike)                            │
│                                                                         │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐                 │
│  │ Pike        │   │ Extension    │   │ LSP Client   │                 │
│  │ Detector    │   │ Commands     │   │ (vscode-     │                 │
│  │             │   │              │   │  language-   │                 │
│  │ - Auto      │   │ - Show       │   │  client)     │                 │
│  │   detect    │   │   Diagnostics│   │              │                 │
│  │ - Find      │   │ - Detect     │   │ - IPC        │                 │
│  │   paths     │   │   Pike       │   │ - Transport  │                 │
│  └─────────────┘   └──────────────┘   └──────────────┘                 │
│         │                  │                    │                      │
│         └──────────────────┴────────────────────┘                      │
│                            ▼                                            │
└────────────────────────────┼────────────────────────────────────────────┘
                             │ LSP Protocol
┌────────────────────────────┼────────────────────────────────────────────┐
│                             ▼                                            │
│                    ┌───────────────┐                                     │
│                    │  Pike LSP     │   packages/pike-lsp-server          │
│                    │  Server       │   --------------------------------   │
│                    │               │   - server.ts (entry point)          │
│                    │  Features     │   - services/                       │
│                    │  - Diagnostics│   - features/                       │
│                    │  - Hover      │                                     │
│                    │  - Completion │                                     │
│                    │  - Navigation │                                     │
│                    │  - Symbols    │                                     │
│                    │  - Roxen      │                                     │
│                    │  - RXML       │                                     │
│                    └───────┬───────┘                                     │
│                            │ JSON-RPC over stdin/stdout                   │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────────────┐
│                             ▼                                            │
│                    ┌───────────────┐                                     │
│                    │  PikeBridge   │   packages/pike-bridge               │
│                    │               │   --------------------------------   │
│                    │  - Process    │   - bridge.ts (main)                 │
│                    │    Manager    │   - process.ts                      │
│                    │  - Request    │   - types.ts                        │
│                    │    Deduping   │   - rate-limiter.ts                 │
│                    │  - Token      │   - response-validator.ts           │
│                    │    Caching    │                                     │
│                    └───────┬───────┘                                     │
│                            │ Subprocess                                   │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────────────┐
│                             ▼                                            │
│                    ┌───────────────┐                                     │
│                    │  Pike         │   pike-scripts/                     │
│                    │  Analyzer     │   --------------------------------   │
│                    │               │   - analyzer.pike (JSON-RPC router)  │
│                    │  LSP Modules  │   - LSP.pmod/                       │
│                    │  - Parser     │     - Parser.pike                    │
│                    │  - Intelligen-│     - Intelligence.pmod/            │
│                    │    ce         │     - Analysis.pmod/                │
│                    │  - Analysis   │     - Cache.pmod                    │
│                    │  - Roxen      │     - Compat.pmod                   │
│                    │  - RXML       │     - Roxen.pmod/                   │
│                    │               │     - RoxenStubs.pmod/              │
│                    └───────────────┘                                     │
│                                                                         │
│  Uses Pike stdlib:                                                      │
│  - Parser.Pike.split() / tokenize()  (NOT regex - ADR-001)              │
│  - master()->resolv() for module resolution                             │
│  - String.trim_all_whites() (Pike 8.0 compat - ADR-002)                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Directories and Module Responsibilities

### `/packages/vscode-pike` - VSCode Extension
**Purpose:** User-facing VSCode extension that activates the LSP server.

**Key Files:**
- `src/extension.ts` - Extension activation, LSP client startup, commands
- `src/pike-detector.ts` - Auto-detects Pike installation paths (Windows/Linux/macOS)
- `package.json` - Extension manifest, configuration schema

**Configuration Settings (passed to LSP server via initializationOptions):**
- `pike.pikePath` - Path to Pike executable (default: "pike")
- `pike.pikeModulePath` - Array of module search paths
- `pike.pikeIncludePath` - Array of include search paths
- `pike.roxenPath` - Path to Roxen installation (for Roxen module support)

**Commands:**
- `pike.detectPike` - Manual Pike detection trigger
- `pike.showReferences` - Show all references to a symbol
- `pike.lsp.showDiagnostics` - Show diagnostics for current document

### `/packages/pike-lsp-server` - TypeScript LSP Server
**Purpose:** Implements LSP protocol, manages workspace state, orchestrates features.

**Directory Structure:**
```
src/
├── server.ts              # Entry point, connection setup, feature registration
├── core/                  # Core types and interfaces
│   └── types.ts          # PikeSettings, LSP types
├── services/             # Shared services for feature modules
│   ├── bridge-manager.ts # Manages PikeBridge lifecycle
│   ├── document-cache.ts # Caches parsed document data
│   ├── include-resolver.ts # Resolves #include paths
│   ├── module-context.ts # Tracks module-level state
│   └── workspace-scanner.ts # Scans workspace for Pike files
├── features/             # LSP feature implementations
│   ├── diagnostics.ts    # Real-time error/warning diagnostics
│   ├── symbols.ts        # Document symbols, workspace symbols
│   ├── navigation/       # Go-to-definition, hover, references
│   │   ├── definition.ts
│   │   ├── hover.ts
│   │   └── references.ts
│   ├── editing/          # Completion, rename, signature help
│   │   ├── completion.ts
│   │   ├── rename.ts
│   │   └── signature-help.ts
│   ├── hierarchy/        # Call/type hierarchy
│   ├── advanced/         # Code actions, formatting, semantic tokens
│   ├── roxen/            # Roxen module support
│   │   ├── detector.ts   # Detects Roxen modules
│   │   ├── completion.ts # Roxen-aware completions
│   │   └── diagnostics.ts # Roxen-specific validation
│   ├── rxml/             # RXML tag support in mixed content
│   │   ├── parser.ts     # RXML tag parser
│   │   ├── completion.ts # RXML tag completion
│   │   └── symbols.ts    # RXML symbol extraction
│   └── utils/            # Shared utilities
│       └── hover-builder.ts
└── tests/                # Unit tests
```

**Key Services:**
- **WorkspaceIndex** - Fast symbol search across workspace (O(1) lookup)
- **TypeDatabase** - Caches compiled programs with inheritance graph
- **StdlibIndexManager** - Lazy-loads stdlib modules with LRU caching (20MB budget)
- **DocumentCache** - Caches parsed document data
- **BridgeManager** - Manages PikeBridge lifecycle and health monitoring

### `/packages/pike-bridge` - TypeScript ↔ Pike IPC
**Purpose:** Manages Pike subprocess and JSON-RPC communication.

**Key Files:**
- `src/bridge.ts` - Main PikeBridge class, subprocess management
- `src/process.ts` - PikeProcess wrapper (spawn, stdin/stdout handling)
- `src/types.ts` - TypeScript types for all Pike protocol messages
- `src/constants.ts` - Timeout, buffer size, rate limiting configs
- `src/rate-limiter.ts` - Token bucket rate limiter (optional)
- `src/response-validator.ts` - Runtime response validation (ADR-012)

**Key Features:**
- **Request Deduping:** Identical in-flight requests share the same promise
- **Token Cache:** Caches tokenization results for completion context (PERF-003)
- **Batch Parse:** Processes multiple files in single IPC call (PERF-007)
- **Error Handling:** Graceful subprocess recovery, pending request cleanup
- **Performance Timing:** All responses include `_perf` metadata

**Protocol:** JSON-RPC 2.0 over stdin/stdout
- Request: `{ "jsonrpc": "2.0", "id": 1, "method": "parse", "params": {...} }`
- Response: `{ "jsonrpc": "2.0", "id": 1, "result": {...} }`
- Error Response: `{ "jsonrpc": "2.0", "id": 1, "error": {...} }`

### `/pike-scripts` - Pure Pike Analyzer
**Purpose:** All Pike language analysis happens here using Pike's stdlib.

**Entry Point:**
- `analyzer.pike` - JSON-RPC router with dispatch table pattern
  - Line-by-line stdin reading (CRITICAL: uses `Stdio.stdin.gets()`, NOT `read()`)
  - Lazy Context initialization (defers module loading until first request)
  - Dispatch table: O(1) method lookup

**LSP Modules (`LSP.pmod/`):**
```
LSP.pmod/
├── Parser.pike          # parse(), tokenize(), compile(), batch_parse()
├── Intelligence.pmod/   # Type resolution and module introspection
│   ├── Intelligence.pike
│   ├── Resolution.pike
│   ├── TypeAnalysis.pike
│   └── ModuleResolution.pike
├── Analysis.pmod/       # Diagnostics, completions, occurrences
│   ├── Analysis.pike
│   ├── Diagnostics.pike
│   ├── Variables.pike
│   └── Completions.pike
├── Cache.pmod           # LRU cache utilities
├── Compat.pmod          # Pike version compatibility (ADR-002)
├── CompilationCache.pmod # Compiled program caching
├── Roxen.pmod/          # Roxen framework support
│   ├── Roxen.pike       # Module detection, tag/variable parsing
│   └── MixedContent.pike # RXML extraction from Pike strings
└── RoxenStubs.pmod/     # Roxen API stubs for type checking
    ├── Roxen.pike
    └── RXML.pike
```

**Critical Architecture Invariants:**
1. **Use Pike stdlib first** (ADR-001): `Parser.Pike.split()` not regex
2. **Pike 8.0.1116 target** (ADR-002): `String.trim_all_whites()` not `String.trim()`
3. **Line-by-line stdin reading**: `Stdio.stdin.gets()` in loop, never `Stdio.stdin->read()`

**JSON-RPC Methods (dispatched from `analyzer.pike`):**
- `parse` - Parse and extract symbols (DEPRECATED: use `analyze`)
- `tokenize` - Tokenize using Pike's tokenizer
- `compile` - Compile and get compiler diagnostics
- `batch_parse` - Parse multiple files at once
- `resolve` - Resolve module path to file location
- `resolve_stdlib` - Resolve and introspect stdlib module
- `analyze` - Unified analyze method (parse + introspect + diagnostics)
- `get_completion_context` - Get completion context at position
- `find_occurrences` - Find all identifier occurrences
- `extract_imports` - Extract import/include/inherit/require directives
- `resolve_import` - Resolve import directive to file path
- `check_circular` - Detect circular dependencies
- `get_waterfall_symbols` - Transitive dependency resolution
- `roxen_detect` - Detect Roxen module information
- `roxen_parse_tags` - Parse RXML tag definitions
- `roxen_parse_vars` - Parse defvar() calls
- `roxen_get_callbacks` - Get lifecycle callback info
- `roxen_validate` - Validate Roxen module API compliance
- `get_pike_paths` - Query Pike's include and module paths

## Roxen Detection

### Roxen Framework Support

The LSP provides specialized support for Roxen WebServer module development.

**Detection Flow:**
1. **Fast Path Check** (`detector.ts:hasMarkers()`):
   - Check for Roxen-specific markers in code:
     - `inherit "module"`, `inherit "filesystem"`, `inherit "roxen"`
     - `#include <module.h>`
     - `constant module_type = MODULE_*`
     - `defvar(` calls

2. **Pike Analysis** (if fast path passes):
   - Call `bridge.roxenDetect(code, uri)` → `LSP.Roxen.detect_module()`
   - Parses module type constants, inheritance, tags, variables
   - Returns structured `RoxenModuleInfo`

3. **Enable Roxen Features** (if detected):
   - Roxen-aware completions (RXML tags, defvar names)
   - Roxen-specific diagnostics (missing callbacks, defvar validation)
   - RXML symbol extraction in mixed content

**Configuration:**
- `pike.roxenPath` setting (optional) - Path to Roxen installation
- Used for resolving Roxen-specific includes and modules
- Falls back to pure Pike analysis if not configured

**Pure Pike Fallback:**
- If `roxenPath` is not set, the LSP uses pure Pike analysis
- Roxen API stubs (`LSP.pmod/RoxenStubs.pmod`) provide type information
- Works without Roxen installed, but with limited Roxen-specific features

## Important Files and Their Purposes

### Configuration and Entry Points
| File | Purpose |
|------|---------|
| `packages/vscode-pike/src/extension.ts` | VSCode extension activation, LSP client startup |
| `packages/pike-lsp-server/src/server.ts` | LSP server entry point, feature registration |
| `packages/pike-bridge/src/bridge.ts` | Pike subprocess management, JSON-RPC client |
| `pike-scripts/analyzer.pike` | JSON-RPC server, dispatches to LSP modules |

### Core Services
| File | Purpose |
|------|---------|
| `packages/pike-lsp-server/src/workspace-index.ts` | O(1) symbol search across workspace |
| `packages/pike-lsp-server/src/type-database.ts` | Compiled program cache with inheritance |
| `packages/pike-lsp-server/src/stdlib-index.ts` | Lazy stdlib loading with LRU caching |
| `packages/pike-lsp-server/src/services/bridge-manager.ts` | Bridge lifecycle and health monitoring |

### Feature Implementations
| File | Purpose |
|------|---------|
| `packages/pike-lsp-server/src/features/diagnostics.ts` | Real-time error/warning diagnostics |
| `packages/pike-lsp-server/src/features/navigation/hover.ts` | Hover information |
| `packages/pike-lsp-server/src/features/navigation/definition.ts` | Go-to-definition |
| `packages/pike-lsp-server/src/features/navigation/references.ts` | Find all references |
| `packages/pike-lsp-server/src/features/editing/completion.ts` | Code completion |
| `packages/pike-lsp-server/src/features/roxen/detector.ts` | Roxen module detection |
| `packages/pike-lsp-server/src/features/roxen/completion.ts` | Roxen-aware completions |

### Pike Modules
| File | Purpose |
|------|---------|
| `pike-scripts/LSP.pmod/Parser.pike` | Parsing and tokenization |
| `pike-scripts/LSP.pmod/Intelligence.pmod/Intelligence.pike` | Introspection, resolution |
| `pike-scripts/LSP.pmod/Analysis.pmod/Analysis.pike` | Diagnostics, completions |
| `pike-scripts/LSP.pmod/Roxen.pmod/Roxen.pike` | Roxen module analysis |
| `pike-scripts/LSP.pmod/Compat.pmod` | Pike version compatibility |

### Testing
| Directory | Purpose |
|----------|---------|
| `packages/vscode-pike/src/test/integration/` | E2E LSP feature tests |
| `packages/pike-lsp-server/src/tests/` | Unit tests for LSP server |
| `packages/pike-bridge/src/` | Bridge unit tests (colocated) |

## Architectural Decisions

This architecture is governed by the ADRs in `.claude/decisions/`:

| ADR | Decision | Impact |
|-----|----------|--------|
| ADR-001 | Use `Parser.Pike` over regex | All Pike parsing uses native parser |
| ADR-002 | Target Pike 8.0.1116 | No `String.trim()`, use `String.trim_all_whites()` |
| ADR-003 | JSON-RPC over stdin/stdout | Bridge protocol |
| ADR-004 | Version sync across 5 packages | Release process |
| ADR-005 | Feature branch workflow | Git workflow |
| ADR-006 | TDD mandatory | All features tested first |
| ADR-007 | Release via skill only | No direct pushes to main |
| ADR-008 | Test integrity enforced | No placeholder tests allowed |
| ADR-009 | Agent-oriented testing | Carlini protocol |
| ADR-010 | Project-specific agent roles | Builder, Pike Critic, etc. |
| ADR-011 | Carlini quality standards | Code quality requirements |

## Performance Optimizations

| Optimization | Location | Description |
|-------------|----------|-------------|
| PERF-003 | Token cache | `PikeBridge` caches tokenization for completion context |
| PERF-007 | Batch parsing | `batchParse()` processes multiple files in single IPC call |
| Lazy Context | `analyzer.pike` | Defers module loading until first request |
| LRU Caching | `StdlibIndexManager` | 20MB memory budget for stdlib cache |
| Request Deduping | `PikeBridge` | Identical in-flight requests share promise |
| Workspace Index | `WorkspaceIndex` | O(1) symbol lookup with nested Map structure |

## Error Handling Strategy

1. **Bridge Level** (`PikeBridge`):
   - Graceful subprocess recovery on crash
   - Pending request rejection on exit
   - Rate limiting (optional)
   - Timeout enforcement (default: 30s)

2. **Server Level** (`pike-lsp-server`):
   - Try/catch around all feature handlers
   - Error callbacks to `WorkspaceIndex`
   - Health monitoring via `BridgeManager`

3. **Pike Level** (`analyzer.pike`):
   - All handlers wrapped in `catch {}`
   - Error mappings returned via JSON-RPC `error` field
   - Performance timing in `_perf` metadata

## Development Workflow

See `.claude/CLAUDE.md` for complete development guidelines:

1. **Read decisions first** - Check `.claude/decisions/INDEX.md`
2. **Use Pike stdlib** - Search `/usr/local/pike/8.0.1116/lib/` before implementing
3. **Follow TDD** - Write failing test, then implement
4. **Feature branches** - All work on `feat/`, `fix/`, etc. branches
5. **Verify E2E** - Run `cd packages/vscode-pike && bun run test:features` before commit

## Testing Commands

```bash
# Unit tests (pike-lsp-server)
cd packages/pike-lsp-server && bun run test

# Unit tests (pike-bridge)
cd packages/pike-bridge && bun run test

# E2E tests (vscode-pike, headless)
cd packages/vscode-pike && bun run test:features

# Pike compilation check
pike -e 'compile_file("pike-scripts/analyzer.pike");'

# Smoke test
echo '{"jsonrpc":"2.0","id":1,"method":"introspect","params":{"code":"int x;","filename":"test.pike"}}' | \
  pike pike-scripts/analyzer.pike
```
