#!/bin/bash
set -euo pipefail
# ci-wait.sh — Push, wait for CI, optionally merge and clean up.
#
# Usage:
#   scripts/ci-wait.sh --dir <worktree_path>                          # push + wait
#   scripts/ci-wait.sh --dir <worktree_path> --merge                  # push + wait + merge
#   scripts/ci-wait.sh --dir <worktree_path> --merge --worktree feat/name  # + cleanup
#   scripts/ci-wait.sh --pr 42 --merge                                # wait for specific PR
#
# Output (grep-friendly):
#   CI:PASS | PR #42 | feat/hover-fix | 3m22s
#   CI:FAIL | PR #42 | feat/hover-fix | 2m15s | test (20.x): build failed
#   CI:PASS:MERGED | PR #42 | feat/hover-fix | 3m22s

START_TIME=$(date +%s)
WORK_DIR=""
DO_MERGE=false
PR_NUM=""
WORKTREE_NAME=""

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) WORK_DIR="$2"; shift 2 ;;
    --merge) DO_MERGE=true; shift ;;
    --pr) PR_NUM="$2"; shift 2 ;;
    --worktree) WORKTREE_NAME="$2"; shift 2 ;;
    *) echo "CI:ERROR | unknown flag: $1" >&2; exit 1 ;;
  esac
done

# If --dir given, cd into it
if [[ -n "$WORK_DIR" ]]; then
  if [[ ! -d "$WORK_DIR" ]]; then
    echo "CI:ERROR | directory not found: $WORK_DIR"
    exit 1
  fi
  cd "$WORK_DIR"
fi

BRANCH="$(git branch --show-current 2>/dev/null || echo "unknown")"

if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo "CI:ERROR | on $BRANCH, not a feature branch (pwd: $(pwd))"
  echo "CI:HINT | use: scripts/ci-wait.sh --dir ../pike-lsp-feat-name [--merge]"
  exit 1
fi

# Find main repo for worktree cleanup
MAIN_REPO="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|/\.git.*||')"

# --- Push if not already pushed ---
REMOTE_EXISTS=$(git ls-remote --heads origin "$BRANCH" 2>/dev/null | wc -l)
if [[ "$REMOTE_EXISTS" -eq 0 ]]; then
  if ! git push -u origin "$BRANCH" --no-verify 2>/dev/null; then
    echo "CI:ERROR | push failed | $BRANCH"
    exit 1
  fi
else
  git push --no-verify 2>/dev/null || true
fi

# --- Find PR number if not provided ---
if [[ -z "$PR_NUM" ]]; then
  PR_NUM=$(gh pr view "$BRANCH" --json number --jq '.number' 2>/dev/null || echo "")
fi

if [[ -z "$PR_NUM" ]]; then
  echo "CI:SKIP | no PR found | $BRANCH | create one first with worker-submit.sh"
  exit 1
fi

# --- Wait for CI checks ---
echo "CI:WAIT | PR #${PR_NUM} | $BRANCH | waiting for checks..." >&2

elapsed_str() {
  local e=$(( $(date +%s) - START_TIME ))
  echo "$(( e / 60 ))m$(( e % 60 ))s"
}

if gh pr checks "$PR_NUM" --watch --fail-fast 2>/dev/null; then
  if [[ "$DO_MERGE" == true ]]; then
    if gh pr merge "$PR_NUM" --squash --delete-branch 2>/dev/null; then
      echo "CI:PASS:MERGED | PR #${PR_NUM} | $BRANCH | $(elapsed_str)"

      # Cleanup worktree if specified
      if [[ -n "$WORKTREE_NAME" ]]; then
        cd "$MAIN_REPO" 2>/dev/null || true
        "$MAIN_REPO/scripts/worktree.sh" remove "$WORKTREE_NAME" 2>/dev/null && \
          echo "CI:CLEANUP | worktree $WORKTREE_NAME removed" || \
          echo "CI:CLEANUP:WARN | worktree $WORKTREE_NAME removal failed"
        git checkout main 2>/dev/null && git pull --quiet 2>/dev/null
      fi
    else
      echo "CI:PASS:MERGE_FAILED | PR #${PR_NUM} | $BRANCH | $(elapsed_str) | merge blocked"
      exit 1
    fi
  else
    echo "CI:PASS | PR #${PR_NUM} | $BRANCH | $(elapsed_str)"
  fi
else
  FAILURES=$(gh pr checks "$PR_NUM" 2>/dev/null | grep -iE "fail|error" | head -5 | tr '\n' '; ' | sed 's/; $//')
  echo "CI:FAIL | PR #${PR_NUM} | $BRANCH | $(elapsed_str) | $FAILURES"
  exit 1
fi
