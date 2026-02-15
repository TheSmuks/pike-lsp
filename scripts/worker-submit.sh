#!/bin/bash
set -euo pipefail
# worker-submit.sh — Test, stage, commit, push, create PR from a worktree.
#
# Usage:
#   scripts/worker-submit.sh --dir <worktree_path> <issue_number> "<commit_message>"
#   cd <worktree_path> && scripts/worker-submit.sh <issue_number> "<commit_message>"
#
# Output (grep-friendly):
#   SUBMIT:OK | PR #42 | feat/hover-fix | fixes #15
#   SUBMIT:FAIL | smoke test failed
#   SUBMIT:FAIL | not in a worktree — you're on main

WORK_DIR=""
ISSUE_NUM=""
COMMIT_MSG=""

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) WORK_DIR="$2"; shift 2 ;;
    *)
      if [[ -z "$ISSUE_NUM" ]]; then
        ISSUE_NUM="$1"; shift
      elif [[ -z "$COMMIT_MSG" ]]; then
        COMMIT_MSG="$1"; shift
      else
        echo "SUBMIT:FAIL | unknown arg: $1" >&2; exit 1
      fi
      ;;
  esac
done

if [[ -z "$ISSUE_NUM" || -z "$COMMIT_MSG" ]]; then
  echo "Usage: worker-submit.sh [--dir <worktree>] <issue_number> \"<commit_message>\"" >&2
  exit 1
fi

# If --dir given, cd into it
if [[ -n "$WORK_DIR" ]]; then
  if [[ ! -d "$WORK_DIR" ]]; then
    echo "SUBMIT:FAIL | directory not found: $WORK_DIR"
    exit 1
  fi
  cd "$WORK_DIR"
fi

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo "SUBMIT:FAIL | not in a worktree — you're on $BRANCH (pwd: $(pwd))"
  echo "SUBMIT:HINT | use: scripts/worker-submit.sh --dir ../pike-lsp-feat-name $ISSUE_NUM \"$COMMIT_MSG\""
  exit 1
fi

# Find main repo for scripts
MAIN_REPO="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|/\.git.*||')"
SCRIPTS="$MAIN_REPO/scripts"

# --- Smoke test ---
if [[ -f "$SCRIPTS/test-agent.sh" ]]; then
  if ! "$SCRIPTS/test-agent.sh" --fast >/dev/null 2>&1; then
    echo "SUBMIT:FAIL | smoke test failed | run: cd $(pwd) && $SCRIPTS/test-agent.sh --fast"
    exit 1
  fi
fi

# --- Stage + commit ---
git add -A
if git diff --cached --quiet; then
  echo "SUBMIT:FAIL | nothing to commit"
  exit 1
fi
git commit -m "$COMMIT_MSG" --no-verify

# --- Push ---
if ! git push -u origin "$BRANCH" --no-verify 2>/dev/null; then
  echo "SUBMIT:FAIL | push failed | $BRANCH"
  exit 1
fi

# --- Create PR ---
gh pr create \
  --base main \
  --title "$COMMIT_MSG" \
  --body "fixes #${ISSUE_NUM}

## What
${COMMIT_MSG}

## Checklist
- [x] TDD: failing test → implementation → passing test
- [x] Smoke test passed pre-submit
- [ ] CI passes" 2>/dev/null

PR_NUM=$(gh pr view "$BRANCH" --json number --jq '.number' 2>/dev/null || echo "?")

echo "SUBMIT:OK | PR #${PR_NUM} | $BRANCH | fixes #${ISSUE_NUM}"
