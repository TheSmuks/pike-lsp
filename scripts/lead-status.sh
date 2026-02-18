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

echo ""
echo "=== IDLE CHECK ==="
# Check notepad for recent ASSIGN entries and warn if stale (>15min)
NOTEPAD="$REPO_ROOT/.omc/notepad.md"
if [[ -f "$NOTEPAD" ]]; then
  NOW=$(date +%s)
  while IFS= read -r line; do
    # Match lines like: 2026-02-16 14:30 | ASSIGN: worker-1 task #42
    if echo "$line" | grep -qE "ASSIGN:"; then
      TIMESTAMP=$(echo "$line" | grep -oP '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}' || echo "")
      if [[ -n "$TIMESTAMP" ]]; then
        ASSIGN_EPOCH=$(date -d "$TIMESTAMP" +%s 2>/dev/null || echo "0")
        AGE=$(( (NOW - ASSIGN_EPOCH) / 60 ))
        if [[ "$AGE" -gt 15 ]]; then
          WORKER=$(echo "$line" | grep -oP 'worker-\d+' || echo "unknown")
          TASK=$(echo "$line" | grep -oP 'task #\d+' || echo "unknown")
          echo "  WARN: $WORKER idle >${AGE}m on $TASK"
        fi
      fi
    fi
  done < "$NOTEPAD"
else
  echo "  (no notepad found)"
fi
