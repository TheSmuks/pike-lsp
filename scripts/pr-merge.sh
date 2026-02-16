#!/bin/bash
# pr-merge.sh — Merge PR with automatic worktree cleanup.
#
# Usage:
#   pr-merge.sh <pr_number>
#   pr-merge.sh <pr_number> --delete-branch
#
# Handles the annoying "cannot delete branch used by worktree" error.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: pr-merge.sh <pr_number> [--delete-branch]" >&2
  exit 1
fi

PR_NUM="$1"
DELETE_BRANCH=""

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --delete-branch|-d) DELETE_BRANCH=1 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

# Get PR info
PR_STATE=$(gh pr view "$PR_NUM" --json state -q '.state' 2>/dev/null)
if [[ "$PR_STATE" != "OPEN" ]]; then
  # Already merged/closed - just try to squash-merge
  echo "PR #$PR_NUM state: $PR_STATE" >&2
fi

BRANCH=$(gh pr view "$PR_NUM" --json headRefName -q '.headRefName' 2>/dev/null)
WT_PATH="../pike-lsp-${BRANCH//\//-}"

# Try merge first
echo "Merging PR #$PR_NUM (branch: $BRANCH)..."
gh pr merge "$PR_NUM" --squash --delete-branch 2>/dev/null && {
  echo "MERGE:OK | PR #$PR_NUM"
  exit 0
}

# If merge failed due to worktree, clean up and retry
if [[ -d "$WT_PATH" ]]; then
  echo "Cleaning up worktree: $WT_PATH"
  git worktree remove "$WT_PATH" 2>/dev/null || true
fi

# Now retry merge (may still fail if branch already merged or other issues)
gh pr merge "$PR_NUM" --squash --delete-branch 2>/dev/null && {
  echo "MERGE:OK | PR #$PR_NUM"
  exit 0
}

# Last resort - just close the PR if already merged
echo "MERGE:FAIL | PR #$PR_NUM | Check manually" >&2
exit 1
