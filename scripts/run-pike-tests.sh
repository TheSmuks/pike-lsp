#!/bin/bash
# Pike Test Runner
# Runs all Pike tests in the correct order with fail-fast behavior
#
# Usage: ./scripts/run-pike-tests.sh
# CI Usage: This script is called by GitHub Actions pike-test job

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Counters
total_tests=0
passed_tests=0
failed_tests=0

echo "============================================"
echo "      Pike LSP Test Suite Runner          "
echo "============================================"
echo ""

# Detect Pike version
echo "Detecting Pike version..."
if command -v pike &> /dev/null; then
    PIKE_VERSION=$(pike --version 2>&1 || echo "unknown")
    echo "Pike version: $PIKE_VERSION"
else
    echo "Error: Pike not found in PATH"
    exit 1
fi
echo ""

# Function to run a test file
run_test() {
    local test_file="$1"
    local test_name="$2"

    total_tests=$((total_tests + 1))

    echo "--------------------------------------------"
    echo "Running: $test_name"
    echo "File: $test_file"
    echo "--------------------------------------------"

    if pike "$test_file"; then
        passed_tests=$((passed_tests + 1))
        echo "✓ PASSED: $test_name"
    else
        failed_tests=$((failed_tests + 1))
        echo "✗ FAILED: $test_name"
        # Fail-fast: exit immediately on test failure
        exit 1
    fi
    echo ""
}

# Test 1: End-to-End Smoke Test (FAIL FAST)
# Validates file compilation, module loading, LSP server startup, and handler responses
run_test "test/tests/smoke-test.pike" "End-to-End Smoke Test"

# Test 2: Module loading tests
# E2E foundation tests include module loading tests
run_test "test/tests/e2e-foundation-tests.pike" "Module Loading Tests (E2E)"

# Test 3: Foundation tests
run_test "test/tests/foundation-tests.pike" "Foundation Unit Tests"

# Test 4: Parser tests
run_test "test/tests/parser-tests.pike" "Parser Tests"

# Test 5: Intelligence tests
run_test "test/tests/intelligence-tests.pike" "Intelligence Tests"

# Test 6: Analysis tests
run_test "test/tests/analysis-tests.pike" "Analysis Tests"

# Test 7: Response format tests
run_test "test/tests/response-format-tests.pike" "Response Format Tests"

# Test 8: Cross-version handler validation
run_test "test/tests/cross-version-tests.pike" "Cross-Version Handler Tests"

# Test 9: E2E foundation tests (run again for complete coverage)
# Note: We already ran module loading tests at the start
# This runs the full E2E suite
# run_test "test/tests/e2e-foundation-tests.pike" "E2E Foundation Tests (Full)"

# Summary
echo "============================================"
echo "              Test Summary                  "
echo "============================================"
echo "Pike version: $PIKE_VERSION"
echo "Total tests run: $total_tests"
echo "Passed: $passed_tests"
echo "Failed: $failed_tests"
echo "============================================"

if [ $failed_tests -eq 0 ]; then
    echo "✓ All tests passed!"
    exit 0
else
    echo "✗ Some tests failed"
    exit 1
fi
