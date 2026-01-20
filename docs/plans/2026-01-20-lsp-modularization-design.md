# LSP Modularization Design

**Date:** 2026-01-20
**Status:** Approved
**Approach:** Infrastructure-First (Approach A)

## Goals

1. **Debuggability** - Isolate where errors occur (bridge? parser? server?)
2. **Testability** - Test components in isolation with clear mocking boundaries
3. **Maintainability** - Navigate and modify without touching unrelated code
4. **Reliability** - Guardrails and E2E verification gates prevent broken commits

## Constraints

- **Zero breaking changes** - LSP must remain functional at every commit
- **Full VSCode E2E** - Tests launch VSCode, verify real user experience
- **Rocky Linux CI** - Pike 8.1116, base on existing extension build CI

## Phases

### Phase 1: Error Infrastructure

Structured error types with context chain across all layers.

**TypeScript - `packages/pike-lsp-server/src/core/errors.ts`:**

```typescript
class LSPError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public layer: 'server' | 'bridge' | 'pike',
    public cause?: Error
  ) { ... }

  // Builds: "Hover failed -> Bridge timeout -> Pike: syntax error"
  get chain(): string { ... }
}

class BridgeError extends LSPError { layer = 'bridge' }
class PikeError extends LSPError { layer = 'pike' }
class ProtocolError extends LSPError { layer = 'server' }

enum ErrorCode {
  PIKE_PROCESS_DIED = 'PIKE_PROCESS_DIED',
  PIKE_TIMEOUT = 'PIKE_TIMEOUT',
  PIKE_SYNTAX_ERROR = 'PIKE_SYNTAX_ERROR',
  BRIDGE_PARSE_ERROR = 'BRIDGE_PARSE_ERROR',
  // ...
}
```

**Pike - `LSP.pmod/Errors.pike`:**

```pike
// Errors.pike IS the error utility class
class Errors {
  // Factory function returns structured mapping
  mapping make_error(string code, string message, string|void context) {
    return ([
      "error": 1,
      "code": code,
      "message": message,
      "context": context
    ]);
  }

  // Error codes as constants
  constant SYNTAX_ERROR = "PIKE_SYNTAX_ERROR";
  constant COMPILE_ERROR = "PIKE_COMPILE_ERROR";
  constant TIMEOUT = "PIKE_TIMEOUT";
}
```

Modules return either a result mapping or an error mapping - bridge checks for `"error"` key.

---

### Phase 2: Logging Framework

Configurable verbosity across all layers, consistent format.

**TypeScript - `packages/pike-lsp-server/src/core/logging.ts`:**

```typescript
enum LogLevel { OFF, ERROR, WARN, INFO, DEBUG, TRACE }

class Logger {
  constructor(private layer: string) {}

  error(msg: string, context?: object) { ... }
  warn(msg: string, context?: object) { ... }
  info(msg: string, context?: object) { ... }
  debug(msg: string, context?: object) { ... }
  trace(msg: string, context?: object) { ... }
}

// Usage
const log = new Logger('bridge');
log.debug('Sending request', { method: 'introspect', id: 42 });
// Output: [DEBUG][bridge] Sending request {"method":"introspect","id":42}
```

**Configuration:** VSCode setting `pike.logLevel` or env `PIKE_LSP_LOG_LEVEL`. Default: `WARN`.

**Pike - `LSP.pmod/Logging.pike`:**

```pike
class Logging {
  int level = 2;  // WARN default

  constant OFF = 0, ERROR = 1, WARN = 2, INFO = 3, DEBUG = 4, TRACE = 5;

  void error(string msg, mixed ... args) {
    if (level >= ERROR) log("ERROR", msg, @args);
  }
  // ... warn, info, debug, trace

  private void log(string lvl, string msg, mixed ... args) {
    werror("[%s][pike] %s %O\n", lvl, msg, args);
  }
}
```

Pike logs to stderr (`werror`), bridge captures and forwards based on log level.

---

### Phase 3: Testing Infrastructure

Fast tests block commits, full E2E on CI.

**Pre-commit hooks (`.husky/pre-commit`):**

```bash
#!/bin/sh
# <30 seconds total

# 1. TypeScript compiles
pnpm -r build

# 2. Pike compiles
pike -e 'compile_file("pike-scripts/analyzer.pike");'

# 3. Fast LSP protocol smoke test
pnpm --filter pike-lsp-server test:smoke
```

**Smoke test (`packages/pike-lsp-server/src/tests/smoke.test.ts`):**

```typescript
describe('LSP Smoke', () => {
  it('initializes without error', async () => { ... });
  it('returns document symbols', async () => { ... });
  it('returns hover info', async () => { ... });
  it('handles invalid Pike gracefully', async () => { ... });
});
```

**CI pipeline (`.github/workflows/ci.yml`):**

Based on existing extension build CI. Rocky Linux, Pike 8.1116.

```yaml
jobs:
  fast-tests:
    runs-on: ubuntu-latest  # or rocky linux
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm -r build
      - run: pnpm -r test

  vscode-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get install -y xvfb
      # Pike installation per existing CI
      - run: pnpm install && pnpm -r build
      - run: xvfb-run pnpm --filter vscode-pike test:e2e
```

---

### Phase 4: Bridge Layer Refactor

Split `bridge.ts` (795 lines) into focused modules.

**New structure:**

```
packages/pike-bridge/src/
  index.ts              # Public exports
  bridge.ts             # Slim orchestrator (~150 lines)
  process.ts            # Pike subprocess lifecycle
  protocol.ts           # JSON-RPC encoding/decoding
  errors.ts             # Bridge-specific error types
  health.ts             # Health check: is Pike alive?
  types.ts              # (existing) type definitions
  constants.ts          # (existing) config constants
```

**Responsibilities:**

| Module | Does | Doesn't |
|--------|------|---------|
| `bridge.ts` | Coordinates calls, exposes public API | Manage process, parse JSON |
| `process.ts` | Spawn/kill Pike, handle stdin/stdout/stderr | Know about LSP methods |
| `protocol.ts` | Encode requests, decode responses, handle timeouts | Know about Pike process |
| `health.ts` | Ping Pike, report status, restart if needed | Business logic |
| `errors.ts` | Wrap errors with context, translate Pike errors | Handle errors |

**process.ts isolates IPC:**

```typescript
class PikeProcess {
  spawn(): void { ... }
  kill(): void { ... }
  send(json: string): void { ... }
  onMessage(callback: (json: string) => void): void { ... }
  onError(callback: (err: Error) => void): void { ... }
  isAlive(): boolean { ... }
}
```

---

### Phase 5: Pike Layer Refactor

Split `Intelligence.pike` (1,660 lines) and `Analysis.pike` (1,191 lines).

**New structure using Pike `.pmod` idioms:**

```
pike-scripts/LSP.pmod/
  module.pmod              # Top-level exports
  Errors.pike              # LSP.Errors
  Logging.pike             # LSP.Logging
  Parser.pike              # LSP.Parser (existing)
  Cache.pmod               # (existing)
  Compat.pmod              # (existing)

  Intelligence.pmod/
    module.pmod            # Shared code, exports
    Introspection.pike     # LSP.Intelligence.Introspection
    Resolution.pike        # LSP.Intelligence.Resolution
    TypeAnalysis.pike      # LSP.Intelligence.TypeAnalysis
    StdlibResolver.pike    # LSP.Intelligence.StdlibResolver

  Analysis.pmod/
    module.pmod            # Shared code, exports
    Diagnostics.pike       # LSP.Analysis.Diagnostics
    Completions.pike       # LSP.Analysis.Completions
    Variables.pike         # LSP.Analysis.Variables
    Occurrences.pike       # LSP.Analysis.Occurrences
```

**Pike module idioms:**

- Inside a `.pmod`, use `.ClassName` to reference siblings
- Contents of `module.pmod` are directly accessible (no prefix)

**Each module pattern:**

```pike
class ModuleName {
  private object logger;
  private object errors;

  void create(object ctx) {
    logger = ctx->logging;
    errors = ctx->errors;
  }

  mapping method_name(mapping params) {
    logger->debug("method_name called", params);
    // ... do work ...
    // return result mapping or errors->make_error(...)
  }
}
```

---

### Phase 6: Server Layer Refactor

Split `server.ts` (4,715 lines) into focused modules.

**New structure:**

```
packages/pike-lsp-server/src/
  server.ts               # Slim entry point (~200 lines)

  core/
    errors.ts             # LSPError types, error chain
    logging.ts            # Logger with configurable levels
    types.ts              # Shared type definitions

  handlers/
    initialize.ts         # onInitialize, onInitialized
    documents.ts          # didOpen, didChange, didClose
    hover.ts              # onHover
    completion.ts         # onCompletion, onCompletionResolve
    definition.ts         # onDefinition, onTypeDefinition
    references.ts         # onReferences, onDocumentHighlight
    symbols.ts            # onDocumentSymbol, onWorkspaceSymbol
    rename.ts             # onRename, onPrepareRename
    diagnostics.ts        # publishDiagnostics
    semantic-tokens.ts    # onSemanticTokens
    code-lens.ts          # onCodeLens

  services/
    document-cache.ts     # Parsed document cache
    type-database.ts      # (existing) compiled type cache
    workspace-index.ts    # (existing) symbol index
    stdlib-index.ts       # (existing) stdlib lazy loading
    bridge-manager.ts     # Bridge lifecycle, health checks
```

**server.ts becomes thin orchestrator:**

```typescript
const connection = createConnection();
const documents = new TextDocuments();

registerInitializeHandlers(connection, services);
registerDocumentHandlers(connection, documents, services);
registerHoverHandler(connection, services);
// ...

connection.listen();
```

**Handler pattern:**

```typescript
export function registerHoverHandler(
  connection: Connection,
  services: Services
) {
  connection.onHover(async (params) => {
    const log = services.logger.child('hover');
    log.debug('Hover request', { uri: params.textDocument.uri });

    try {
      const result = await services.bridge.introspect(...);
      return formatHoverResult(result);
    } catch (err) {
      throw services.errors.wrap(err, 'Hover failed');
    }
  });
}
```

---

### Health Checks & Diagnostics

**VSCode command: `Pike LSP: Show Diagnostics`**

```
═══════════════════════════════════════════════════
Pike LSP Diagnostics
═══════════════════════════════════════════════════

Server Status: ✓ Running
  - Uptime: 2h 34m
  - Documents open: 3
  - Log level: DEBUG

Bridge Status: ✓ Connected
  - Pike process PID: 12345
  - Requests sent: 142
  - Avg response time: 23ms

Pike Status: ✓ Healthy
  - Pike version: 8.1116
  - Modules loaded: Parser, Intelligence, Analysis
  - Cache entries: 47

Recent Errors (last 5):
  [14:32:01] WARN [bridge] Slow response (>500ms) for introspect
  [14:31:45] ERROR [pike] Compile error in /tmp/test.pike:42
═══════════════════════════════════════════════════
```

**Implementation:**

```typescript
// bridge-manager.ts
interface HealthStatus {
  alive: boolean;
  pid: number | null;
  requestCount: number;
  avgResponseMs: number;
  lastError: string | null;
}
```

```pike
// analyzer.pike - respond to "health" method
mapping handle_health() {
  return ([
    "version": __VERSION__,
    "modules": ({ "Parser", "Intelligence", "Analysis" }),
    "cache_size": sizeof(cache->entries),
  ]);
}
```

**Auto-recovery:** Bridge detects Pike death via health check, restarts automatically.

---

## Final Structure After Refactor

**TypeScript (~15-20 modules):**
- `pike-bridge/src/` - 6 modules
- `pike-lsp-server/src/core/` - 3 modules
- `pike-lsp-server/src/handlers/` - 11 modules
- `pike-lsp-server/src/services/` - 5 modules

**Pike (~10 modules):**
- `LSP.pmod/` - 4 top-level (Errors, Logging, Parser, module)
- `LSP.pmod/Intelligence.pmod/` - 4 classes + module
- `LSP.pmod/Analysis.pmod/` - 4 classes + module

**Testing:**
- Pre-commit: <30s smoke tests
- CI: Full test suite + VSCode E2E with xvfb

---

## Implementation Notes

- Each phase produces a working LSP
- Zero tolerance for breaking changes
- Existing CI on Rocky Linux with Pike 8.1116 as reference
- Use git worktrees for isolation during refactor
