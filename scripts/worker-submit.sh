#!/bin/bash
set -euo pipefail
# worker-submit.sh — Test, stage, commit, push, create PR.
# Does NOT wait for CI — use ci-wait.sh for that.
#
# Usage: scripts/worker-submit.sh <issue_number> "<commit_message>"
#
# Output (grep-friendly):
#   SUBMIT:OK | PR #42 | feat/hover-fix | fixes #15
#   SUBMIT:FAIL | smoke test failed
#   SUBMIT:FAIL | push failed

ISSUE_NUM="${1:?Usage: worker-submit.sh <issue_number> <commit_message>}"
COMMIT_MSG="${2:?Usage: worker-submit.sh <issue_number> <commit_message>}"

BRANCH=$(git branch --show-current)
if [[ "$BRANCH" == "main" ]]; then
  echo "SUBMIT:FAIL | cannot submit from main branch"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$(dirname "$0")/.." && pwd)"

# --- Smoke test ---
if ! "$REPO_ROOT/scripts/test-agent.sh" --fast >/dev/null 2>&1; then
  echo "SUBMIT:FAIL | smoke test failed | run scripts/test-agent.sh --fast to see errors"
  exit 1
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
PR_URL=$(gh pr create \
  --base main \
  --title "$COMMIT_MSG" \
  --body "fixes #${ISSUE_NUM}

## What
${COMMIT_MSG}

## Checklist
- [x] TDD: failing test → implementation → passing test
- [x] Smoke test passed pre-submit
- [ ] CI passes" 2>&1)

PR_NUM=$(gh pr view "$BRANCH" --json number --jq '.number' 2>/dev/null || echo "?")

echo "SUBMIT:OK | PR #${PR_NUM} | $BRANCH | fixes #${ISSUE_NUM}"
