# LSP Modularization Design v2 (Middle Ground)

**Date:** 2026-01-20
**Status:** Approved
**Approach:** Infrastructure-First with Pragmatic Implementation
**Previous:** [v1 Design](./2026-01-20-lsp-modularization-design.md)

---

## Philosophy: Safety Without Rigidity

This design accepts the **Infrastructure-First architecture** to solve the specific pain of silent failures, while relaxing **implementation rigidity** to avoid over-engineering and maintain development velocity.

**Core principle:** Solve the actual pain points without building more than we need.

---

## Goals (Unchanged)

1. **Debuggability** - Know where errors occur (bridge? parser? server?)
2. **Testability** - Test components in isolation
3. **Maintainability** - Navigate and modify without touching unrelated code
4. **Reliability** - Guardrails prevent broken code from reaching main

---

## Key Adjustments from v1

### 1. Opaque Fault Domains (Error Compromise)

**v1:** Rich error chains crossing TypeScript and Pike with full context.

**v2:** TypeScript maintains the chain to track *path*. Pike returns flat, simple data.

**Rationale:** Pike lacks stack context - pretending otherwise creates "leaky abstractions." We keep debuggability (knowing *where* it failed) without over-engineering Pike's error responses.

### 2. Capability-Based Grouping (Handler Compromise)

**v1:** 11 separate handler files (one per LSP method).

**v2:** Group by feature/capability - `navigation.ts` (hover, definition, references), `editing.ts` (completion, rename).

**Rationale:** Reduces cognitive load by keeping related logic collocated. Still splits the 4,715-line monolith.

### 3. Green Main, Not Green Commit (Git Compromise)

**v1:** Zero breaking changes per commit.

**v2:** Allow broken intermediate commits on feature branches. Enforce tests on **push/PR**, not local commits.

**Rationale:** Maintains defense in depth without strangling minute-by-minute workflow.

### 4. Asymmetric Logging (Log Compromise)

**v1:** Symmetric log levels between TypeScript and Pike.

**v2:** Structured logs in TypeScript only. Pike emits simple event strings to stderr. Bridge wraps Pike output into the TypeScript structure.

**Rationale:** Achieves unified log stream without over-engineering a logging library inside Pike.

---

## Revised Phases

### Phase 1: Lean Observability

**Goal:** See what's happening without complex cross-language infrastructure.

**TypeScript - `packages/pike-lsp-server/src/core/errors.ts`:**

```typescript
// Simple error with path tracking
class LSPError extends Error {
  constructor(
    message: string,
    public layer: 'server' | 'bridge' | 'pike',
    public cause?: Error
  ) {
    super(message);
  }

  // Builds path: "Hover failed -> Bridge timeout -> Pike error"
  get chain(): string {
    const parts = [this.message];
    let current = this.cause;
    while (current) {
      parts.push(current.message);
      current = (current as LSPError).cause;
    }
    return parts.join(' -> ');
  }
}

// Layer-specific errors
class BridgeError extends LSPError {
  constructor(message: string, cause?: Error) {
    super(message, 'bridge', cause);
  }
}

class PikeError extends LSPError {
  constructor(message: string, cause?: Error) {
    super(message, 'pike', cause);
  }
}
```

**Pike - Simple error dicts (no Errors.pike class needed yet):**

```pike
// Modules return flat error mappings when things fail
mapping make_error(string kind, string msg, int|void line) {
  return ([
    "error": 1,
    "kind": kind,      // "SYNTAX", "COMPILE", "RUNTIME"
    "msg": msg,
    "line": line
  ]);
}

// Example usage in any module
if (compilation_failed) {
  return make_error("COMPILE", "Failed to compile: " + error_msg, 42);
}
```

**TypeScript - `packages/pike-lsp-server/src/core/logging.ts`:**

```typescript
enum LogLevel { OFF, ERROR, WARN, INFO, DEBUG, TRACE }

class Logger {
  private static level: LogLevel = LogLevel.WARN;

  static setLevel(level: LogLevel) { this.level = level; }

  constructor(private component: string) {}

  private log(level: LogLevel, levelName: string, msg: string, ctx?: object) {
    if (Logger.level < level) return;
    const timestamp = new Date().toISOString();
    const context = ctx ? ' ' + JSON.stringify(ctx) : '';
    console.error(`[${timestamp}][${levelName}][${this.component}] ${msg}${context}`);
  }

  error(msg: string, ctx?: object) { this.log(LogLevel.ERROR, 'ERROR', msg, ctx); }
  warn(msg: string, ctx?: object) { this.log(LogLevel.WARN, 'WARN', msg, ctx); }
  info(msg: string, ctx?: object) { this.log(LogLevel.INFO, 'INFO', msg, ctx); }
  debug(msg: string, ctx?: object) { this.log(LogLevel.DEBUG, 'DEBUG', msg, ctx); }
  trace(msg: string, ctx?: object) { this.log(LogLevel.TRACE, 'TRACE', msg, ctx); }
}
```

**Pike stderr handling - Bridge wraps Pike output:**

```typescript
// In bridge - capture and wrap Pike stderr
pikeProcess.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg) {
    this.logger.debug('Pike stderr', { raw: msg });
  }
});
```

**No complex Pike logging library.** Pike just uses `werror()` as it always has. TypeScript captures and structures it.

---

### Phase 2: The Safety Net (CI/Tests)

**Goal:** Catch regressions on push/PR without slowing local development.

**Pre-push hook (`.husky/pre-push`):**

```bash
#!/bin/sh
# Runs on push, not every commit

# TypeScript compiles
pnpm -r build || exit 1

# Pike compiles
pike -e 'compile_file("pike-scripts/analyzer.pike");' || exit 1

# Fast smoke test
pnpm --filter pike-lsp-server test:smoke || exit 1
```

**No pre-commit hook.** Local commits can be broken - we fix on push.

**Smoke test (`packages/pike-lsp-server/src/tests/smoke.test.ts`):**

```typescript
describe('LSP Smoke', () => {
  let bridge: PikeBridge;

  beforeAll(async () => {
    bridge = new PikeBridge();
    await bridge.start();
  });

  afterAll(() => bridge.stop());

  it('responds to parse request', async () => {
    const result = await bridge.parse('int x;', 'test.pike');
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('responds to introspect request', async () => {
    const result = await bridge.introspect('int x = 1;', 'test.pike');
    expect(result).toBeDefined();
  });

  it('handles invalid Pike gracefully', async () => {
    const result = await bridge.parse('int x = ;', 'test.pike');
    // Should return error, not crash
    expect(result).toBeDefined();
  });
});
```

**CI pipeline (`.github/workflows/ci.yml`):**

Based on existing extension build CI (Rocky Linux, Pike 8.1116).

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest  # Adapt to Rocky Linux as needed
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install Pike
        run: |
          # Based on existing CI - adapt for Rocky Linux
          sudo apt-get update
          sudo apt-get install -y pike8.0

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm -r build

      - name: Test Pike compilation
        run: pike -e 'compile_file("pike-scripts/analyzer.pike");'

      - name: Run tests
        run: pnpm -r test

  vscode-e2e:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y xvfb pike8.0

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm -r build

      - name: Run VSCode E2E tests
        run: xvfb-run pnpm --filter vscode-pike test:e2e
```

---

### Phase 3: Bridge Extraction (Critical Refactor)

**Goal:** Isolate IPC mechanics from business logic. The stdin bug would be caught here.

**New structure:**

```
packages/pike-bridge/src/
  index.ts              # Public exports
  bridge.ts             # Orchestrator + policy (retries, timeouts) (~300 lines)
  process.ts            # Pure IPC mechanics (~200 lines)
  types.ts              # (existing) type definitions
  constants.ts          # (existing) config constants
```

**process.ts - Pure IPC, no business logic:**

```typescript
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

export class PikeProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;

  spawn(pikeScriptPath: string): void {
    this.process = spawn('pike', [pikeScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Line-by-line reading (prevents the stdin bug)
    this.rl = readline.createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity
    });

    this.rl.on('line', (line) => {
      this.emit('message', line);
    });

    this.process.stderr!.on('data', (data) => {
      this.emit('stderr', data.toString());
    });

    this.process.on('exit', (code) => {
      this.emit('exit', code);
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
    });
  }

  send(json: string): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('Pike process not running');
    }
    this.process.stdin.write(json + '\n');
  }

  kill(): void {
    this.rl?.close();
    this.process?.kill();
    this.process = null;
    this.rl = null;
  }

  isAlive(): boolean {
    return this.process !== null && !this.process.killed;
  }

  get pid(): number | null {
    return this.process?.pid ?? null;
  }
}
```

**bridge.ts - Policy and orchestration:**

```typescript
import { PikeProcess } from './process';
import { Logger } from '../core/logging';
import { BridgeError, PikeError } from '../core/errors';

export class PikeBridge {
  private process: PikeProcess;
  private logger: Logger;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }>;
  private nextId = 1;

  constructor() {
    this.process = new PikeProcess();
    this.logger = new Logger('bridge');
    this.pendingRequests = new Map();
  }

  async start(): Promise<void> {
    this.logger.info('Starting Pike process');
    this.process.spawn('pike-scripts/analyzer.pike');

    this.process.on('message', (line) => this.handleMessage(line));
    this.process.on('stderr', (msg) => this.logger.debug('Pike stderr', { raw: msg }));
    this.process.on('exit', (code) => this.handleExit(code));
    this.process.on('error', (err) => this.handleError(err));
  }

  private async call(method: string, params: object): Promise<any> {
    const id = this.nextId++;
    const request = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    this.logger.debug('Sending request', { method, id });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new BridgeError(`Timeout waiting for ${method}`));
        }
      }, 30000);

      this.process.send(request);
    });
  }

  private handleMessage(line: string): void {
    try {
      const response = JSON.parse(line);
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(new PikeError(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (err) {
      this.logger.error('Failed to parse response', { line });
    }
  }

  // Public API methods
  async parse(code: string, filename: string) {
    return this.call('parse', { code, filename });
  }

  async introspect(code: string, filename: string) {
    return this.call('introspect', { code, filename });
  }

  // ... other methods
}
```

**Why this split matters:**
- `process.ts` can be tested in isolation (does IPC work?)
- `bridge.ts` can be tested with a mock process (does policy work?)
- The stdin bug would be caught by `process.ts` tests alone

---

### Phase 4: Server Grouping

**Goal:** Split `server.ts` (4,715 lines) by capability, not by verb.

**New structure:**

```
packages/pike-lsp-server/src/
  server.ts                 # Entry point, wiring (~150 lines)

  core/
    errors.ts               # LSPError types
    logging.ts              # Logger
    types.ts                # Shared types

  features/
    navigation.ts           # hover, definition, references, documentHighlight
    editing.ts              # completion, rename, prepareRename
    symbols.ts              # documentSymbol, workspaceSymbol
    diagnostics.ts          # publishDiagnostics, validation
    semantic-tokens.ts      # semanticTokens (if complex enough to separate)

  services/
    bridge-manager.ts       # Bridge lifecycle, health
    document-cache.ts       # Parsed document cache
    type-database.ts        # (existing)
    workspace-index.ts      # (existing)
    stdlib-index.ts         # (existing)
```

**Capability grouping rationale:**

| Feature File | Contains | Why Together |
|--------------|----------|--------------|
| `navigation.ts` | hover, definition, references, highlight | All about "what is this symbol?" |
| `editing.ts` | completion, rename | All about "change this code" |
| `symbols.ts` | documentSymbol, workspaceSymbol | All about "show me symbols" |
| `diagnostics.ts` | publishDiagnostics | Error/warning generation |

**server.ts becomes wiring only:**

```typescript
import { createConnection, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerNavigationHandlers } from './features/navigation';
import { registerEditingHandlers } from './features/editing';
import { registerSymbolHandlers } from './features/symbols';
import { registerDiagnosticHandlers } from './features/diagnostics';
import { createServices } from './services';

const connection = createConnection();
const documents = new TextDocuments(TextDocument);

const services = createServices(connection);

registerNavigationHandlers(connection, services);
registerEditingHandlers(connection, services);
registerSymbolHandlers(connection, services);
registerDiagnosticHandlers(connection, documents, services);

documents.listen(connection);
connection.listen();
```

**Feature file pattern:**

```typescript
// features/navigation.ts
import { Connection } from 'vscode-languageserver/node';
import { Services } from '../services';

export function registerNavigationHandlers(
  connection: Connection,
  services: Services
) {
  const { bridge, logger, documentCache } = services;
  const log = logger.child('navigation');

  connection.onHover(async (params) => {
    log.debug('Hover request', { uri: params.textDocument.uri });
    try {
      const doc = documentCache.get(params.textDocument.uri);
      const result = await bridge.introspect(doc.getText(), doc.uri);
      return formatHover(result, params.position);
    } catch (err) {
      log.error('Hover failed', { error: err.message });
      return null;
    }
  });

  connection.onDefinition(async (params) => {
    log.debug('Definition request', { uri: params.textDocument.uri });
    // ... similar pattern
  });

  connection.onReferences(async (params) => {
    // ... similar pattern
  });

  connection.onDocumentHighlight(async (params) => {
    // ... similar pattern
  });
}

function formatHover(result: IntrospectionResult, position: Position): Hover | null {
  // ... formatting logic
}
```

---

### Phase 5: Pike Reorganization

**Goal:** Split large Pike files using `.pmod` idiom, but keep it to 3-4 files max per module.

**New structure:**

```
pike-scripts/LSP.pmod/
  module.pmod              # Top-level exports
  Parser.pike              # (existing, unchanged)
  Cache.pmod               # (existing, unchanged)
  Compat.pmod              # (existing, unchanged)

  Intelligence.pmod/
    module.pmod            # Shared helpers (type traversal, inheritance utils)
    Introspection.pike     # Symbol extraction, docstrings
    Resolution.pike        # Name resolution, go-to-definition
    TypeAnalysis.pike      # Type inference, inheritance chains
    # Note: StdlibResolver stays in Resolution.pike (not separate)

  Analysis.pmod/
    module.pmod            # Shared helpers (scope tracking, position utils)
    Diagnostics.pike       # Error/warning generation
    Completions.pike       # Completion context, suggestions
    Variables.pike         # Uninitialized detection, scope tracking
    # Note: Occurrences stays in Variables.pike (not separate)
```

**Why 3-4 files, not 8:**
- Avoids micro-modules that hurt grep-ability
- Related logic stays together (StdlibResolver with Resolution, Occurrences with Variables)
- Still splits the 1,660-line Intelligence.pike into ~400-500 line files

**module.pmod pattern:**

```pike
// Intelligence.pmod/module.pmod
// Shared helpers available to all classes in this .pmod

//! Traverse type hierarchy
array(program) get_inheritance_chain(program p) {
  array(program) chain = ({ p });
  foreach (Program.inherits(p), program parent) {
    chain += get_inheritance_chain(parent);
  }
  return chain;
}

//! Check if type is callable
int(0..1) is_callable(mixed type_info) {
  return functionp(type_info) || programp(type_info);
}
```

**Class pattern:**

```pike
// Intelligence.pmod/Introspection.pike

//! Extracts symbols and type information from Pike code
class Introspection {
  private object context;

  void create(object ctx) {
    context = ctx;
  }

  //! Introspect code and return symbol information
  mapping introspect(string code, string filename) {
    // Can use .Resolution for sibling class
    // Can use get_inheritance_chain() from module.pmod directly

    mixed err = catch {
      program p = compile_string(code, filename);
      return extract_symbols(p);
    };

    if (err) {
      return make_error("COMPILE", describe_error(err));
    }
  }

  private mapping extract_symbols(program p) {
    // ... extraction logic
  }
}
```

---

## Health Check (Simplified)

**VSCode command: `Pike LSP: Show Diagnostics`**

Simpler than v1 - just key status info:

```
Pike LSP Status
---------------
Server: Running (uptime: 2h 34m)
Bridge: Connected (PID: 12345)
Pike:   Healthy (v8.1116)

Recent errors: None
```

**Implementation in bridge-manager.ts:**

```typescript
interface HealthStatus {
  serverUptime: number;
  bridgeConnected: boolean;
  pikePid: number | null;
  pikeVersion: string | null;
  recentErrors: string[];
}

async getHealth(): Promise<HealthStatus> {
  return {
    serverUptime: Date.now() - this.startTime,
    bridgeConnected: this.bridge.isAlive(),
    pikePid: this.bridge.pid,
    pikeVersion: await this.bridge.getVersion(),
    recentErrors: this.errorLog.slice(-5)
  };
}
```

---

## Summary: What Changed from v1

| Aspect | v1 | v2 |
|--------|----|----|
| Error handling | Rich cross-language chains | TS chains, Pike flat dicts |
| Handler structure | 11 files (one per verb) | 4 files (by capability) |
| Git discipline | Pre-commit hooks | Pre-push hooks |
| Pike logging | Symmetric logging library | Just `werror()`, TS wraps |
| Pike modules | 8 files | 3-4 files per .pmod |
| Phases | 6 | 5 |

## What Stayed the Same

- **Infrastructure-first** - Observability before refactoring
- **Bridge extraction** - IPC isolation is critical
- **Zero tolerance on main** - Just relaxed to push/PR level
- **Pike `.pmod` idiom** - Proper language structure
- **Defense in depth testing** - Pre-push + CI + E2E

---

## Implementation Order

1. **Phase 1: Lean Observability** - `core/errors.ts`, `core/logging.ts`, simple Pike error dicts
2. **Phase 2: Safety Net** - `.husky/pre-push`, smoke tests, CI pipeline
3. **Phase 3: Bridge Extraction** - `process.ts` split from `bridge.ts`
4. **Phase 4: Server Grouping** - `features/` and `services/` directories
5. **Phase 5: Pike Reorganization** - `Intelligence.pmod/`, `Analysis.pmod/`

Each phase produces working code. Can pause at any phase without breaking the codebase.
