#!/bin/bash
# Setup workspace symlinks for bun workspaces
# Bun doesn't automatically create symlinks in node_modules for workspace packages,
# so we create them manually here. This allows workspace imports to work in tests.

set -e

# Create the scope directory if it doesn't exist
mkdir -p node_modules/@pike-lsp

# Create symlinks for workspace packages
for pkg in pike-bridge core pike-lsp-server vscode-pike; do
    if [ -d "packages/$pkg" ]; then
        # Remove existing symlink if it exists
        rm -f "node_modules/@pike-lsp/$pkg"
        # Create the symlink
        ln -sf "../../packages/$pkg" "node_modules/@pike-lsp/$pkg"
        echo "Linked @pike-lsp/$pkg"
    fi
done

echo "Workspace links created successfully"
