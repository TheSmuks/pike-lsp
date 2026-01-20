# Phase 4: Server Grouping - Context

## Goal

Split `server.ts` (4,715 lines) by capability, not by verb. Group related handlers: navigation (hover, definition, references), editing (completion, rename), etc.

## Philosophy

**Capability-Based Grouping:** Reduces cognitive load by keeping related logic collocated. "What is this symbol?" (navigation) is different from "change this code" (editing). Still splits the monolith but avoids 11 micro-files.

## Requirements Mapped

- SRV-01: Create `packages/pike-lsp-server/src/core/errors.ts` with LSPError types
- SRV-02: Create `packages/pike-lsp-server/src/core/logging.ts` with Logger
- SRV-03: Create `packages/pike-lsp-server/src/core/types.ts` with shared types
- SRV-04: Create `packages/pike-lsp-server/src/features/navigation.ts` (hover, definition, references, highlight)
- SRV-05: Create `packages/pike-lsp-server/src/features/editing.ts` (completion, rename)
- SRV-06: Create `packages/pike-lsp-server/src/features/symbols.ts` (documentSymbol, workspaceSymbol)
- SRV-07: Create `packages/pike-lsp-server/src/features/diagnostics.ts` (publishDiagnostics)
- SRV-08: Create `packages/pike-lsp-server/src/services/bridge-manager.ts` (bridge lifecycle, health)
- SRV-09: Create `packages/pike-lsp-server/src/services/document-cache.ts` (parsed document cache)
- SRV-10: Refactor `server.ts` to wiring-only (~150 lines)
- SRV-11: Feature files use `registerXHandlers(connection, services)` pattern
- SRV-12: Each feature handler has try/catch with logger.error fallback
- SRV-13: Services interface bundles bridge, logger, documentCache
- HLT-01: Implement `Pike LSP: Show Diagnostics` VSCode command
- HLT-02: Health status shows server uptime
- HLT-03: Health status shows bridge connection and Pike PID
- HLT-04: Health status shows Pike version
- HLT-05: Health status shows recent errors (last 5)
- HLT-06: BridgeManager implements getHealth() returning HealthStatus interface

## Success Criteria

1. `core/` directory exists with errors.ts, logging.ts, types.ts
2. `features/` directory exists with navigation.ts, editing.ts, symbols.ts, diagnostics.ts
3. `services/` directory exists with bridge-manager.ts, document-cache.ts
4. server.ts reduced to ~150 lines (wiring only)
5. Feature files use `registerXHandlers(connection, services)` pattern
6. Health check command shows server uptime, bridge status, Pike version, recent errors

## Deliverables

### New Structure

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

### Capability Grouping

| Feature File | Contains | Why Together |
|--------------|----------|--------------|
| `navigation.ts` | hover, definition, references, highlight | All about "what is this symbol?" |
| `editing.ts` | completion, rename | All about "change this code" |
| `symbols.ts` | documentSymbol, workspaceSymbol | All about "show me symbols" |
| `diagnostics.ts` | publishDiagnostics | Error/warning generation |

### server.ts - Wiring Only

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

### Feature File Pattern

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
    // ... similar pattern
  });
}
```

### Health Check

**VSCode command: `Pike LSP: Show Diagnostics`**

```
Pike LSP Status
---------------
Server: Running (uptime: 2h 34m)
Bridge: Connected (PID: 12345)
Pike:   Healthy (v8.1116)

Recent errors: None
```

**bridge-manager.ts:**
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

## Dependencies

- Phase 1: core/errors.ts, core/logging.ts
- Phase 3: bridge-manager depends on refactored bridge

## Notes

- Keep existing services (type-database, workspace-index, stdlib-index)
- Feature files follow same pattern: register handlers, use services
- Health check is simplified from v1 design - just key status info
