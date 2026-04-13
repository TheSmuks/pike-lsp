---
id: KB-WORKFLOW-STARTUP
domain: WORKFLOWS
date: 2026-04-13
authors: [agent]
summary: Pike LSP server initialization sequence from connection to listening.
---

# Startup Protocol

Source: `packages/pike-lsp-server/src/server.ts`

1. **Connection** (L90): `createConnection(ProposedFeatures.all)` + `TextDocuments(TextDocument)`.
2. **Singletons** (L97-103): `Logger`, `DocumentCache`, `TypeDatabase`, `WorkspaceIndex`, `WorkspaceScanner`, `ModuleContext`, `FormattingService`. `bridgeManager`/`includeResolver` start null.
3. **`findAnalyzerPath()`** (L118-147): Locates `analyzer.pike` in `pike-scripts/` relative to bundle dir (self, parent, grandparent).
4. **`onInitialize`** (L261): Reads init options (pikePath, analyzerPath, env, defines). Creates `PikeBridge`, `BridgeManager`, `IncludeResolver`. Updates runtime context + workspace index.
5. **`ensureBridgeStartupOrThrow()`** (L363): Awaits Pike subprocess launch. Fatal crash report on failure.
6. **Capabilities** (L372-441): Declares incremental sync, diagnostics, navigation, completion, rename, call/type hierarchy, semantic tokens, code actions, formatting, color, code lens, linked editing.
7. **Feature registration** (L468-485): `createServices()` bundles singletons; `features.register*()` wires all handlers before `documents.listen()`.
8. **Runtime handlers** (L487-504): `registerServerRuntimeHandlers()` wires workspace index, scanner, bridge accessors.
9. **Listen** (L510-511): `documents.listen(connection)` then `connection.listen()`.

All handlers are bound before `listen()` — no race window.
