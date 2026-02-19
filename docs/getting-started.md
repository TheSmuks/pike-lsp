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

## Installing Pike

Pike 8.1116 or later is required. Choose your platform:

### Linux (Debian/Ubuntu)

```bash
# Option 1: Install from repository (may be outdated)
sudo apt update
sudo apt install pike

# Option 2: Install latest from Lysator (recommended)
# Download from https://pike.lysator.liu.se/download/
wget https://pike.lysator.liu.se/pub/pike/latest/Pike-v8.0.1116-linux-x64.tar.bz2
tar -xjf Pike-v8.0.1116-linux-x64.tar.bz2
cd Pike-v8.0.1116-linux-x64
sudo ./install.sh
```

### Linux (Fedora/RHEL)

```bash
# Build from source or use containers
# See: https://pike.lysator.liu.se/docs/
```

### macOS

```bash
# Option 1: Homebrew
brew install pike

# Option 2: Download from https://pike.lysator.liu.se/download/
# Pike-v8.0.1116-mac-x64.tar.bz2
```

### Windows (WSL)

```bash
# Install Pike inside WSL
wget https://pike.lysator.liu.se/pub/pike/latest/Pike-v8.0.1116-linux-x64.tar.bz2
tar -xjf Pike-v8.0.1116-linux-x64.tar.bz2
cd Pike-v8.0.1116-linux-x64
./install.sh
```

### Verifying Pike Installation

```bash
pike --version
```

Expected output: `Pike v8.0.1116` or later.

### Setting PIKE_SRC (Development)

For development or running tests, set the environment variable to your Pike source directory:

```bash
export PIKE_SRC=/path/to/Pike-v8.0.1116
export ROXEN_SRC=/path/to/Roxen
```

Add these to your `.bashrc` or `.zshrc` for persistence.

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
