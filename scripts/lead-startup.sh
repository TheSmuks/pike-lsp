#!/bin/bash
set -euo pipefail
# lead-startup.sh — Single-call lead startup: pull, labels, full state dump.
# Usage: scripts/lead-startup.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== PULL ==="
git checkout main && git pull

echo ""
echo "=== BOOTSTRAP LABELS ==="
gh label create "P0-broken"    --color "B60205" --description "Broken in main" --force 2>/dev/null || true
gh label create "P1-tests"     --color "D93F0B" --description "Failing or placeholder tests" --force 2>/dev/null || true
gh label create "P2-feature"   --color "FBCA04" --description "New LSP feature" --force 2>/dev/null || true
gh label create "P3-refactor"  --color "0E8A16" --description "Code quality improvement" --force 2>/dev/null || true
gh label create "P4-perf"      --color "1D76DB" --description "Performance improvement" --force 2>/dev/null || true
gh label create "hygiene"      --color "C5DEF5" --description "Dead code, orphaned files, junk removal" --force 2>/dev/null || true
gh label create "enhancement"  --color "A2EEEF" --description "New capability" --force 2>/dev/null || true
gh label create "refactor"     --color "D4C5F9" --description "Internal restructuring" --force 2>/dev/null || true
gh label create "pike-side"    --color "F9D0C4" --description "Pike code (analyzer, LSP.pmod)" --force 2>/dev/null || true
gh label create "ts-side"      --color "BFD4F2" --description "TypeScript code (LSP server, bridge)" --force 2>/dev/null || true
gh label create "roxen"        --color "FEF2C0" --description "Roxen framework support" --force 2>/dev/null || true
echo "Labels OK"

echo ""
echo "=== OPEN ISSUES ==="
gh issue list --state open --json number,title,assignees,labels --limit 50

echo ""
echo "=== OPEN PRs ==="
gh pr list --state open --json number,title,state,statusCheckRollup

echo ""
echo "=== UNMERGED REMOTE BRANCHES ==="
git branch -r --no-merged main | grep -v HEAD || echo "(none)"

echo ""
echo "=== ACTIVE WORKTREES ==="
git worktree list

echo ""
echo "=== MAIN CI STATUS ==="
gh run list --branch main -L 3 --json status,conclusion,name,headBranch
