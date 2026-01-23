#!/bin/bash
# Pike LSP Automated Test Suite
# Run this after each build to verify functionality before presenting to user
# 
# Per PIKE_SCANNER_INSTRUCTIONS.xml: Testing with Pike stdlib is REQUIRED

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          Pike LSP Automated Test Suite                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Build first
echo "📦 Building project..."
cd "$PROJECT_ROOT"
bun run build
echo "✓ Build completed"
echo ""

# Test 1: Pike Bridge
echo "🔌 Testing Pike Bridge..."
cd "$PROJECT_ROOT/packages/pike-bridge"
bun test dist/test.js
echo ""

# Test 2: LSP Server Components
echo "🖥️  Testing LSP Server Components..."
cd "$PROJECT_ROOT/packages/pike-lsp-server"
bun test dist/test-server.js
echo ""

# Test 3: Comprehensive Pike Source Parsing (REQUIRED)
echo "📚 Testing Pike Source Parsing..."
echo "   (Per PIKE_SCANNER_INSTRUCTIONS: 100% of Pike 8 files must parse)"
bun test dist/tests/pike-source-tests.js 2>&1 || {
    echo "❌ Pike source parsing tests failed!"
    exit 1
}
echo ""

# Summary
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    ✓ All Tests Passed!                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Ready for user testing. Run extension with:"
echo "  $PROJECT_ROOT/scripts/test-extension.sh"
