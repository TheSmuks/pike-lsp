#!/bin/bash
# Bundle the Pike LSP server and dependencies for VSIX packaging
#
# Uses esbuild to bundle the server with all TypeScript dependencies,
# then copies the pike-scripts needed by the Pike bridge.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_ROOT="$(dirname "$(dirname "$EXT_DIR")")"

SERVER_DIR="$EXT_DIR/server"
SERVER_ENTRY="$MONOREPO_ROOT/packages/pike-lsp-server/src/server.ts"
BRIDGE_DIR="$MONOREPO_ROOT/packages/pike-bridge"
PIKE_SCRIPTS_SRC="$MONOREPO_ROOT/pike-scripts"

echo "Bundling Pike LSP server..."
echo "  Extension dir: $EXT_DIR"
echo "  Monorepo root: $MONOREPO_ROOT"

# Clean and create server directory
rm -rf "$SERVER_DIR"
mkdir -p "$SERVER_DIR/pike-scripts"

# Check if esbuild is available
if ! command -v npx &> /dev/null; then
    echo "ERROR: npx not found"
    exit 1
fi

# Ensure pike-bridge dist is up to date (esbuild resolves package main)
if [ -d "$BRIDGE_DIR" ]; then
    echo "  Building pike-bridge..."
    (cd "$BRIDGE_DIR" && bun run build)
else
    echo "ERROR: pike-bridge not found at $BRIDGE_DIR"
    exit 1
fi

# Bundle server with esbuild
echo "  Bundling server with esbuild..."
npx esbuild "$SERVER_ENTRY" \
    --bundle \
    --platform=node \
    --target=node18 \
    --format=cjs \
    --outfile="$SERVER_DIR/server.js" \
    --external:vscode \
    --sourcemap \
    --minify

# Copy pike-scripts (analyzer.pike and type-introspector.pike)
if [ -d "$PIKE_SCRIPTS_SRC" ]; then
    echo "  Copying pike-scripts from $PIKE_SCRIPTS_SRC"
    cp "$PIKE_SCRIPTS_SRC"/*.pike "$SERVER_DIR/pike-scripts/"

    # Also copy LSP.pmod modules if they exist
    if [ -d "$PIKE_SCRIPTS_SRC/LSP.pmod" ]; then
        echo "  Copying LSP.pmod modules"
        mkdir -p "$SERVER_DIR/pike-scripts/LSP.pmod"
        # Copy .pike files
        cp "$PIKE_SCRIPTS_SRC/LSP.pmod"/*.pike "$SERVER_DIR/pike-scripts/LSP.pmod/" 2>/dev/null || true
        # Copy .pmod files (single files, not directories)
        for f in "$PIKE_SCRIPTS_SRC/LSP.pmod"/*.pmod; do
            if [ -f "$f" ]; then
                cp "$f" "$SERVER_DIR/pike-scripts/LSP.pmod/"
            fi
        done
        # Copy .pmod directories recursively (Intelligence.pmod/, Analysis.pmod/, etc.)
        for d in "$PIKE_SCRIPTS_SRC/LSP.pmod"/*.pmod; do
            if [ -d "$d" ]; then
                echo "    Copying directory: $(basename "$d")"
                cp -r "$d" "$SERVER_DIR/pike-scripts/LSP.pmod/"
            fi
        done
    fi

    # BUILD-001: Inject Build ID (hash of timestamp, 6 hex chars)
    TIMESTAMP=$(date +%s%N 2>/dev/null || date +%s)000000000
    BUILD_ID=$(echo -n "$TIMESTAMP" | md5sum | cut -c1-6)
    echo "  Injecting Build ID: $BUILD_ID"
    # Use perl for in-place replacement to avoid sed portability issues between macOS/Linux
    perl -i -pe "s/constant BUILD_ID = \"DEV_BUILD\";/constant BUILD_ID = \"$BUILD_ID\";/g" "$SERVER_DIR/pike-scripts/analyzer.pike"

else
    echo "ERROR: pike-scripts not found at $PIKE_SCRIPTS_SRC"
    exit 1
fi

echo "Server bundle created at $SERVER_DIR"
echo "Contents:"
ls -la "$SERVER_DIR"
ls -la "$SERVER_DIR/pike-scripts"
