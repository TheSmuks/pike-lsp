#!/bin/bash
# Build and install the latest Pike LSP extension into VSCode
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Building Pike LSP Extension ==="

cd "$PROJECT_ROOT"

# 1. Build all packages
echo "[1/4] Building all packages..."
pnpm build

# 2. Bundle server into extension
echo "[2/4] Bundling server..."
cd packages/vscode-pike
pnpm bundle-server

# 3. Package VSIX
echo "[3/4] Packaging VSIX..."
pnpm package

# 4. Find and install the VSIX
VSIX_FILE=$(ls -t vscode-pike-*.vsix 2>/dev/null | head -1)

if [ -z "$VSIX_FILE" ]; then
    echo "ERROR: No VSIX file found!"
    exit 1
fi

echo "[4/4] Installing $VSIX_FILE..."
code --install-extension "$VSIX_FILE" --force

echo ""
echo "=== Done! ==="
echo "Installed: $VSIX_FILE"
echo ""
echo "Reload VSCode to use the new version:"
echo "  - Press Ctrl+Shift+P (Cmd+Shift+P on Mac)"
echo "  - Run 'Developer: Reload Window'"
