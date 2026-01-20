---
path: /home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts
type: component
updated: 2025-01-20
status: active
---

# extension.ts

## Purpose

VSCode extension entry point that activates the Pike Language Server Client. Manages LSP client lifecycle, configuration (module/include paths), and provides commands for workspace setup.

## Exports

- `activate()` - Main VSCode activation function, starts LSP client
- `activateForTesting()` - Test helper accepting mock output channel
- `deactivate()` - Cleanup function stopping LSP client
- `ExtensionApi` - Interface exposing client, output channel, and logs for testing

## Dependencies

- vscode-languageclient/node - LanguageClient, ServerOptions, TransportKind for LSP
- vscode - ExtensionContext, commands, workspace, window for VSCode API
- fs - File system checking for server module discovery
- path - Path resolution for server location

## Used By

TBD

## Notes

Tries multiple possible server locations (bundled, dev sibling, alternative dev path). Restarts client on configuration changes.
