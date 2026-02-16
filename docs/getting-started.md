---
id: getting-started
title: Getting Started
description: How to install and set up Pike LSP
---

# Getting Started

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Pike Language Support"
4. Click Install

### From VSIX File

```bash
code --install-extension vscode-pike-1.0.0.vsix
```

### Build from Source

```bash
# Clone the repository
git clone https://github.com/TheSmuks/pike-lsp.git
cd pike-lsp

# Install dependencies
bun install

# Build all packages
bun run build

# Package the VS Code extension
cd packages/vscode-pike
bun run package
```

## Requirements

- [Pike](https://pike.lysator.liu.se/) 8.0 or higher
- [Node.js](https://nodejs.org/) 18 or higher
- [VS Code](https://code.visualstudio.com/) 1.85+

## Compatibility

### Supported Pike Versions

| Version | Status | Notes |
|---------|--------|-------|
| Pike 8.1116 | Required | Primary development target |
| Pike 8.x latest | Best-effort | Forward compatibility tested in CI |
| Pike 7.x | Not supported | Use Pike 8.1116 or later |

### Version Detection

The analyzer detects and reports the Pike version at runtime. This information is available in the VS Code "Pike Language Server" output channel and via the "Pike: Show Health" command.

## Verification

After installation, verify that Pike LSP is working:

1. Open a `.pike` or `.pmod` file
2. Check the status bar for "Pike LSP" indicator
3. Try hovering over a function to see type information
4. Use F12 to navigate to a symbol definition

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Go to Definition | `F12` |
| Find References | `Shift+F12` |
| Rename Symbol | `F2` |
| Trigger Completion | `Ctrl+Space` |
| Signature Help | `Ctrl+Shift+Space` |
| Go to Symbol | `Ctrl+Shift+O` |
| Workspace Symbol | `Ctrl+T` |
