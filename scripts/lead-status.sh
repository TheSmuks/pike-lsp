#!/bin/bash
set -euo pipefail
# lead-status.sh — Single-call status dashboard for the lead.
# Usage: scripts/lead-status.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== OPEN ISSUES (by priority) ==="
gh issue list --state open --json number,title,assignees,labels --limit 50

echo ""
echo "=== OPEN PRs ==="
gh pr list --state open --json number,title,state,statusCheckRollup

echo ""
echo "=== RECENTLY MERGED (last 5) ==="
gh pr list --state merged --limit 5 --json number,title,mergedAt

echo ""
echo "=== ACTIVE WORKTREES ==="
git worktree list

echo ""
echo "=== MAIN CI ==="
gh run list --branch main -L 1 --json status,conclusion,name
