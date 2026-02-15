#!/bin/bash
set -euo pipefail
# ci-wait.sh — Push current branch, wait for CI, report result.
# Grep-friendly output. Can optionally auto-merge on success.
#
# Usage:
#   scripts/ci-wait.sh                    # push + wait
#   scripts/ci-wait.sh --merge            # push + wait + merge on success
#   scripts/ci-wait.sh --merge --pr 42    # wait for specific PR + merge
#
# Output format (grep-friendly):
#   CI:PASS | PR #42 | feat/hover-fix | 3m22s
#   CI:FAIL | PR #42 | feat/hover-fix | test (20.x): build failed
#   CI:SKIP | no remote branch | feat/hover-fix

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$(dirname "$0")/.." && pwd)"
BRANCH="$(git branch --show-current)"
START_TIME=$(date +%s)

# Defaults
DO_MERGE=false
PR_NUM=""
WORKTREE_NAME=""

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --merge) DO_MERGE=true; shift ;;
    --pr) PR_NUM="$2"; shift 2 ;;
    --worktree) WORKTREE_NAME="$2"; shift 2 ;;
    *) echo "CI:ERROR | unknown flag: $1" >&2; exit 1 ;;
  esac
done

if [[ "$BRANCH" == "main" ]]; then
  echo "CI:ERROR | cannot push from main branch"
  exit 1
fi

# --- Push if not already pushed ---
REMOTE_EXISTS=$(git ls-remote --heads origin "$BRANCH" 2>/dev/null | wc -l)
if [[ "$REMOTE_EXISTS" -eq 0 ]]; then
  git push -u origin "$BRANCH" --no-verify 2>/dev/null
  if [[ $? -ne 0 ]]; then
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
  echo "CI:SKIP | no PR found | $BRANCH | create one first with gh pr create"
  exit 1
fi

# --- Wait for CI checks ---
echo "CI:WAIT | PR #${PR_NUM} | $BRANCH | waiting for checks..." >&2

# gh pr checks --watch blocks until checks complete, exits 0 if all pass
if gh pr checks "$PR_NUM" --watch --fail-fast 2>/dev/null; then
  ELAPSED=$(( $(date +%s) - START_TIME ))
  MINUTES=$(( ELAPSED / 60 ))
  SECONDS_R=$(( ELAPSED % 60 ))

  if [[ "$DO_MERGE" == true ]]; then
    # Merge
    if gh pr merge "$PR_NUM" --squash --delete-branch 2>/dev/null; then
      echo "CI:PASS:MERGED | PR #${PR_NUM} | $BRANCH | ${MINUTES}m${SECONDS_R}s"

      # Cleanup worktree if specified
      if [[ -n "$WORKTREE_NAME" ]]; then
        MAIN_REPO="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|/\.git$||')"
        cd "$MAIN_REPO" 2>/dev/null || cd "$REPO_ROOT"
        "$REPO_ROOT/scripts/worktree.sh" remove "$WORKTREE_NAME" 2>/dev/null && \
          echo "CI:CLEANUP | worktree $WORKTREE_NAME removed" || \
          echo "CI:CLEANUP:WARN | worktree $WORKTREE_NAME removal failed"
        git checkout main && git pull --quiet
      fi
    else
      echo "CI:PASS:MERGE_FAILED | PR #${PR_NUM} | $BRANCH | ${MINUTES}m${SECONDS_R}s | merge blocked (protection rules?)"
      exit 1
    fi
  else
    echo "CI:PASS | PR #${PR_NUM} | $BRANCH | ${MINUTES}m${SECONDS_R}s"
  fi
else
  ELAPSED=$(( $(date +%s) - START_TIME ))
  MINUTES=$(( ELAPSED / 60 ))
  SECONDS_R=$(( ELAPSED % 60 ))

  # Collect failure details
  FAILURES=$(gh pr checks "$PR_NUM" 2>/dev/null | grep -i "fail\|error" | head -5 | tr '\n' '; ' | sed 's/; $//')
  echo "CI:FAIL | PR #${PR_NUM} | $BRANCH | ${MINUTES}m${SECONDS_R}s | $FAILURES"
  exit 1
fi
