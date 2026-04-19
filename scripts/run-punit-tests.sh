#!/bin/bash
# PUnit Test Runner
# Runs PUnit-based Pike tests for pike-lsp
#
# Usage: ./scripts/run-punit-tests.sh [options]
# Options:
#   --tap       Output TAP v13 format
#   --junit=FILE  Write JUnit XML report to FILE
#   -v          Verbose output
#   -t TAG      Run only tests with this tag
#   -e TAG      Exclude tests with this tag
#   --ci        CI mode: TAP output + strict validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUNIT_DIR="$PROJECT_ROOT/test/lib/punit"
PIKE_SCRIPTS="$PROJECT_ROOT/pike-scripts"
TEST_DIR="$PROJECT_ROOT/test/punit"

cd "$PROJECT_ROOT"

# Verify Pike is available
if ! command -v pike &> /dev/null; then
    echo "Error: Pike not found in PATH" >&2
    exit 1
fi

# Verify PUnit submodule is present
if [ ! -f "$PUNIT_DIR/PUnit.pmod/module.pmod" ]; then
    echo "Error: PUnit submodule not found. Run: git submodule update --init test/lib/punit" >&2
    exit 1
fi

# Verify test directory exists
if [ ! -d "$TEST_DIR" ]; then
    echo "Error: No PUnit tests found in $TEST_DIR" >&2
    exit 1
fi

# Build module path: PUnit + pike-scripts (for LSP.pmod imports)
MODULE_PATH="$PUNIT_DIR:$PIKE_SCRIPTS"

# Parse options
RUNNER_ARGS=()
CI_MODE=false

for arg in "$@"; do
    case "$arg" in
        --ci)
            CI_MODE=true
            RUNNER_ARGS+=("--tap" "--strict")
            ;;
        *)
            RUNNER_ARGS+=("$arg")
            ;;
    esac
done

echo "============================================"
echo "      PUnit Test Suite (pike-lsp)         "
echo "============================================"
echo "Pike: $(pike --version 2>&1 || echo unknown)"
echo "PUnit: $PUNIT_DIR"
echo "Tests: $TEST_DIR"
echo "============================================"
echo ""

# Run PUnit test runner
# -M adds module paths (colon-separated for Pike)
pike -M "$MODULE_PATH" "$PUNIT_DIR/run_tests.pike" "${RUNNER_ARGS[@]}" "$TEST_DIR"
