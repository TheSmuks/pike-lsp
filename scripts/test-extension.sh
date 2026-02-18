#!/bin/bash
# Test Pike Language Extension in VSCode or VSCodium
# This script launches a new editor instance with the extension loaded
#
# Usage:
#   ./test-extension.sh              # Opens with test.pike
#   ./test-extension.sh --stdlib     # Opens Pike stdlib folder
#   ./test-extension.sh <file.pike>  # Opens specific file

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTENSION_DIR="$PROJECT_ROOT/packages/vscode-pike"
TEST_FILE="$PROJECT_ROOT/test/fixtures/test.pike"
PIKE_SOURCE_ROOT="${PIKE_SOURCE_ROOT:-"$PROJECT_ROOT/../Pike"}"
PIKE_STDLIB="${PIKE_STDLIB:-"$PIKE_SOURCE_ROOT/lib/modules"}"

# Parse arguments
if [[ "$1" == "--stdlib" ]]; then
    TARGET_PATH="$PIKE_STDLIB"
    echo "Opening Pike stdlib folder for testing..."
elif [[ -n "$1" && -e "$1" ]]; then
    TARGET_PATH="$1"
elif [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo "Pike Extension Test Script"
    echo ""
    echo "Usage:"
    echo "  ./test-extension.sh              Opens test.pike"
    echo "  ./test-extension.sh --stdlib     Opens Pike stdlib folder"
    echo "  ./test-extension.sh <file.pike>  Opens specific file"
    echo ""
    exit 0
else
    TARGET_PATH="$TEST_FILE"
fi

# Detect editor (VSCode or VSCodium)
if command -v codium &> /dev/null; then
    EDITOR="codium"
    echo "Detected: VSCodium"
elif command -v code &> /dev/null; then
    EDITOR="code"
    echo "Detected: VSCode"
else
    echo "Error: Neither 'code' nor 'codium' found in PATH"
    echo ""
    echo "To install VSCode: https://code.visualstudio.com/"
    echo "To install VSCodium: https://vscodium.com/"
    exit 1
fi

# Build the project if needed
echo ""
echo "Building project..."
cd "$PROJECT_ROOT"
bun run build > /dev/null 2>&1 || {
    echo "Build failed! Running with existing build..."
}
echo "✓ Build ready"

# Create test fixture if it doesn't exist
if [[ ! -f "$TEST_FILE" ]]; then
    mkdir -p "$(dirname "$TEST_FILE")"
    cat > "$TEST_FILE" << 'PIKE'
//! Test file for Pike LSP extension
//! @author Pike LSP

// Variable declarations
int count = 0;
string message = "Hello Pike!";
array(string) names = ({ "Alice", "Bob" });

//! A simple greeting function
//! @param name The name to greet
//! @returns A greeting message
string greet(string name) {
    return "Hello, " + name + "!";
}

//! Counter class with increment/decrement
class Counter {
    private int value = 0;

    //! Increment the counter
    void increment() {
        value++;
    }

    //! Get current value
    //! @returns Current counter value
    int get() {
        return value;
    }
}

// Test syntax highlighting for keywords
void main() {
    Counter c = Counter();
    c->increment();
    
    foreach(names, string n) {
        write(greet(n) + "\n");
    }
    
    if (count > 0) {
        write("Count: " + (string)count + "\n");
    }
}
PIKE
    echo "✓ Created test fixture: $TEST_FILE"
fi

# Launch editor with extension in development mode
echo ""
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║          Launching Pike Language Extension                         ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Editor:     $EDITOR"
echo "Extension:  $EXTENSION_DIR"
echo "Opening:    $TARGET_PATH"
echo ""

$EDITOR --extensionDevelopmentPath="$EXTENSION_DIR" --new-window "$TARGET_PATH"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "Extension launched! Check the following in VS Code/Codium:"
echo ""
echo "1. OUTPUT PANEL (Ctrl+Shift+U)"
echo "   → Select 'Pike Language Server' from dropdown"
echo "   → Should show 'Pike Language Server started'"
echo ""
echo "2. FEATURES TO TEST"
echo "   → Syntax highlighting: Keywords colored"
echo "   → Outline panel: Shows symbols"
echo "   → Syntax errors: Try 'int x = ;' - should show red squiggle"
echo ""
echo "3. PIKE FILES TO TRY"
echo "   → Open any .pike or .pmod file from Pike stdlib"
echo "   → Example: $PIKE_STDLIB/Array.pmod"
echo "═══════════════════════════════════════════════════════════════════"
