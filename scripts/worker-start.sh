#!/bin/bash
set -euo pipefail
# worker-start.sh — Single-call worker cycle start: pull, issues, smoke test.
# Usage: scripts/worker-start.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== PULL MAIN ==="
git checkout main && git pull

echo ""
echo "=== AVAILABLE ISSUES ==="
gh issue list --state open --json number,title,assignees,labels --limit 20

echo ""
echo "=== SMOKE TEST ==="
scripts/test-agent.sh --fast

echo ""
echo "=== STATUS ==="
head -30 STATUS.md 2>/dev/null || echo "(no STATUS.md)"
