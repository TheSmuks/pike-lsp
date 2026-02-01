#!/bin/bash
# TDD Guard wrapper for bun test - runs tests and captures results for tdd-guard
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/.claude/tdd-guard/data"
mkdir -p "$DATA_DIR"

# Determine which package to test based on current directory or argument
TEST_TARGET="${1:-packages/pike-bridge}"

# Run bun test with JUnit reporter
cd "$PROJECT_ROOT/$TEST_TARGET"
bun test --reporter junit --reporter-outfile "$DATA_DIR/test-junit.xml" 2>&1

# Convert JUnit to tdd-guard format
if [ -f "$DATA_DIR/test-junit.xml" ]; then
  node "$PROJECT_ROOT/.claude/tdd-guard/convert-junit.js" "$DATA_DIR/test-junit.xml" "$DATA_DIR/test.json"
fi
