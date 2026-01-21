---
path: /home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts
type: component
updated: 2026-01-20
status: active
---

# extension.ts

## Purpose

VSCode extension entry point that activates the Pike Language Server via LSP client, registers commands, and manages the language server lifecycle.

## Exports

- `activate(context: ExtensionContext): Promise<ExtensionApi>` - Main extension activation function, initializes LSP client
- `activateForTesting(context: ExtensionContext, testOutputChannel: OutputChannel): Promise<ExtensionApi>` - Test activation with custom output channel
- `addModulePathSetting(fsPath: string): Promise<boolean>` - Adds a folder to Pike module path configuration
- `deactivate(): Promise<void>` - Cleanup function, stops the language server
- `ExtensionApi` - Interface exposing `getClient()`, `getOutputChannel()`, and `getLogs()` for testing

## Dependencies

- `path` (Node.js)
- `fs` (Node.js)
- `vscode`
- `vscode-languageclient/node`

## Used By

TBD

## Notes

Supports `PIKE_LSP_TEST_MODE` environment variable for testing. Searches multiple server paths to handle both production (bundled) and development (monorepo) layouts. Registers `pike-module-path.add` and `pike.showReferences` commands.