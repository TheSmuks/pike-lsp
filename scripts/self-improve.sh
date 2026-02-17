#!/bin/bash
# self-improve.sh - Codebase analysis for improvements
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== SELF-IMPROVEMENT ANALYSIS ==="

echo "Checking for TODOs..."
TODOS=$(grep -rn "TODO" --include="*.ts" --include="*.tsx" . 2>/dev/null | \
  grep -v "\.d\.ts" | grep -v "node_modules" | head -10)
if [ -n "$TODOS" ]; then
  echo "Found TODOs:"
  echo "$TODOS"
else
  echo "No TODOs found"
fi

echo ""
echo "Checking for placeholder tests..."
PLACEHOLDERS=$(grep -rn "placeholder\|it\.skip\|test\.skip\|describe\.skip" \
  --include="*.test.ts" --include="*.spec.ts" . 2>/dev/null | head -5)
if [ -n "$PLACEHOLDERS" ]; then
  echo "Found placeholder tests:"
  echo "$PLACEHOLDERS"
else
  echo "No placeholder tests found"
fi

echo ""
echo "Checking for debug statements..."
DEBUG=$(grep -rn "console\.log\|console\.debug" \
  --include="*.ts" --include="*.tsx" . 2>/dev/null | \
  grep -v "node_modules" | grep -v "\.d\.ts" | head -5)
if [ -n "$DEBUG" ]; then
  echo "Found debug statements:"
  echo "$DEBUG"
else
  echo "No debug statements found"
fi

echo ""
echo "=== ANALYSIS COMPLETE ==="
echo "Consider creating issues for any findings above."
