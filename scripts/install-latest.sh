#!/bin/bash
# Build and install the latest Pike LSP extension into VSCode
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Building Pike LSP Extension ==="

cd "$PROJECT_ROOT"

# 1. Build all packages
echo "[1/4] Building all packages..."
bun run build

# 2. Bundle server into extension
echo "[2/4] Bundling server..."
cd packages/vscode-pike
bun run bundle-server

# 3. Package VSIX
echo "[3/4] Packaging VSIX..."
bun run package

# 4. Find and install the VSIX
VSIX_FILE=$(ls -t vscode-pike-*.vsix 2>/dev/null | head -1)

if [ -z "$VSIX_FILE" ]; then
    echo "ERROR: No VSIX file found!"
    exit 1
fi

echo "[4/4] Installing $VSIX_FILE..."
code --install-extension "$VSIX_FILE" --force

# Extract Build ID from the bundled server
if [ -f "server/pike-scripts/analyzer.pike" ]; then
    BUILD_ID=$(grep 'constant BUILD_ID =' server/pike-scripts/analyzer.pike | cut -d'"' -f2)
else
    BUILD_ID="unknown"
fi

echo ""
echo "=== Done! ==="
echo "Installed: $VSIX_FILE"
echo "Compilation Number: $BUILD_ID"
echo ""
echo "Reload VSCode to use the new version:"
echo "  - Press Ctrl+Shift+P (Cmd+Shift+P on Mac)"
echo "  - Run 'Developer: Reload Window'"
