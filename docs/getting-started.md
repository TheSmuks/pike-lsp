---
id: getting-started
title: Getting Started
description: How to install and set up Pike LSP
---

# Getting Started

This guide will walk you through installing and configuring Pike LSP for VS Code.

## Requirements

Before installing Pike LSP, ensure you have:

- [Pike](https://pike.lysator.liu.se/) 8.0.1116 or higher
- [Node.js](https://nodejs.org/) 18 or higher
- [VS Code](https://code.visualstudio.com/) 1.85 or higher

## Installing Pike

### Linux (Debian/Ubuntu)

```bash
# Download from Lysator (recommended)
wget https://pike.lysator.liu.se/pub/pike/latest/Pike-v8.0.1116-linux-x64.tar.bz2
tar -xjf Pike-v8.0.1116-linux-x64.tar.bz2
cd Pike-v8.0.1116-linux-x64
sudo ./install.sh

# Or install from repository (may be outdated)
sudo apt update
sudo apt install pike
```

### macOS

```bash
# Using Homebrew
brew install pike

# Or download from https://pike.lysator.liu.se/download/
```

### Windows (WSL)

Install Pike inside WSL using the Linux instructions above.

### Verifying Installation

```bash
pike --version
```

Expected: `Pike v8.0.1116` or later.

## Installing the VS Code Extension

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X` on macOS)
3. Search for "Pike Language Support"
4. Click Install

### From VSIX File

If you have a VSIX file:

```bash
code --install-extension pike-lsp.vsix
```

### Build from Source

For development or the latest features:

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

## Configuration

### Basic Configuration

Open VS Code settings (`Ctrl+,`) and search for "Pike":

| Setting             | Description             | Default  |
| ------------------- | ----------------------- | -------- |
| `pike.pikePath`     | Path to Pike executable | `"pike"` |
| `pike.trace.server` | LSP trace level         | `"off"`  |

### File Associations

To enable Pike LSP for additional file extensions:

```json
{
  "files.associations": {
    "*.rjs": "pike",
    "*.inc": "pike"
  }
}
```

### Environment Variables (Development)

For running tests or developing Pike LSP:

```bash
export PIKE_SRC=/path/to/Pike-v8.0.1116
export ROXEN_SRC=/path/to/Roxen
```

Add these to your `.bashrc` or `.zshrc` for persistence.

## Verification

After installation:

1. Open a `.pike` or `.pmod` file
2. Check the VS Code status bar for "Pike LSP" indicator
3. Try hovering over a function to see type information
4. Press `F12` to navigate to a symbol definition
5. Press `Ctrl+Space` for code completion

## Troubleshooting

### Pike Not Found

If you see "Pike executable not found":

1. Verify Pike is in your PATH: `pike --version`
2. Set `pike.pikePath` in VS Code settings to the full path

### Extension Not Activating

1. Check the Output panel (View > Output > Pike Language Server)
2. Ensure the file has a `.pike` or `.pmod` extension
3. Reload VS Code window if needed

### Performance Issues

- Large workspaces: Initial indexing may take time, but runs in background
- Check the [Troubleshooting](/docs/troubleshooting) page for more solutions

## Next Steps

- [Features](/docs/features) - Explore all available features
- [Configuration](/docs/configuration) - Advanced configuration options
- [Contributing](/docs/contributing) - How to contribute to Pike LSP
