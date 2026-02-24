#!/bin/bash
set -euo pipefail
# worker-setup.sh — Single-call bootstrap: issue → worktree.
#
# Usage:
#   scripts/worker-setup.sh <issue_number>
#
# Output (grep-friendly):
#   SETUP:OK | WT:<abs_path> | BRANCH:<branch> | ISSUE:#<N>
#   SETUP:FAIL | <reason>

if [[ $# -lt 1 ]]; then
  echo "SETUP:FAIL | Usage: worker-setup.sh <issue_number>" >&2
  exit 1
fi

ISSUE_NUM="$1"
REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)

# Step 1: Validate issue exists and fetch metadata
ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --json title,labels,body,state 2>&1) || {
  echo "SETUP:FAIL | Issue #${ISSUE_NUM} not found or gh error: ${ISSUE_JSON}" >&2
  exit 1
}

STATE=$(echo "$ISSUE_JSON" | jq -r '.state')
if [[ "$STATE" == "CLOSED" ]]; then
  echo "SETUP:FAIL | Issue #${ISSUE_NUM} is closed" >&2
  exit 1
fi

# Step 1.5: Verify issue wasn't already solved by merged PR
EXISTING_PR=$(gh pr list --state merged --search "fixes #${ISSUE_NUM}" --json number --jq '.[0].number' 2>/dev/null || echo "")
if [[ -n "$EXISTING_PR" ]]; then
  echo "SETUP:FAIL | Issue #${ISSUE_NUM} already solved by PR #${EXISTING_PR}" >&2
  exit 1
fi

# Step 1.6: Check for existing worktree with this issue
for wt in $(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null | grep "^worktree " | sed 's/^worktree //'); do
  if [[ -f "$wt/.omc/current-issue" ]]; then
    WT_ISSUE=$(head -1 "$wt/.omc/current-issue" 2>/dev/null || echo "")
    if [[ "$WT_ISSUE" == "$ISSUE_NUM" ]]; then
      echo "SETUP:FAIL | Issue #${ISSUE_NUM} already being worked on in: $wt" >&2
      exit 1
    fi
  fi
done

TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')

# Step 2: Derive branch name from issue title
# "fix: hover crash on null" → "fix/hover-crash-on-null"
# "feat: add completion" → "feat/add-completion"
# If no type prefix, default to "feat/"
BRANCH=""
if echo "$TITLE" | grep -qE "^(fix|feat|test|docs|refactor|chore):"; then
  TYPE=$(echo "$TITLE" | sed -E 's/^(fix|feat|test|docs|refactor|chore):.*/\1/')
  DESC=$(echo "$TITLE" | sed -E 's/^(fix|feat|test|docs|refactor|chore):\s*//')
else
  TYPE="feat"
  DESC="$TITLE"
fi

# Sanitize description: lowercase, spaces→dashes, remove special chars, trim length
DESC=$(echo "$DESC" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 -]//g' | sed 's/ \+/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
BRANCH="${TYPE}/${DESC}"

# Step 3: Create worktree
WT_OUTPUT=$("$REPO_ROOT/scripts/worktree.sh" create "$BRANCH" 2>&1) || {
  echo "SETUP:FAIL | worktree.sh failed: ${WT_OUTPUT}" >&2
  exit 1
}

# Extract worktree path from output
# worktree.sh prints the path — look for the sibling directory
SANITIZED=$(echo "$BRANCH" | sed 's|/|-|g')
PARENT_DIR=$(dirname "$REPO_ROOT")
REPO_NAME=$(basename "$REPO_ROOT")
WT_PATH="${PARENT_DIR}/${REPO_NAME}-${SANITIZED}"

if [[ ! -d "$WT_PATH" ]]; then
  echo "SETUP:FAIL | Worktree directory not found at ${WT_PATH}" >&2
  exit 1
fi

ABS_PATH=$(cd "$WT_PATH" && pwd)

# Write issue info for worker verification
echo "$ISSUE_NUM" > "$WT_PATH/.omc/current-issue"
echo "$TITLE" >> "$WT_PATH/.omc/current-issue"

echo ""
echo "=== WORKER VERIFICATION REQUIRED ==="
echo "You are assigned to work on issue #$ISSUE_NUM: $TITLE"
echo ""
echo "REQUIRED: Before pushing, run: scripts/test-agent.sh --fast"
echo "REQUIRED: PR body must contain: fixes #$ISSUE_NUM"
echo ""
echo "To confirm, you must:"
echo "  1. cd $ABS_PATH"
echo "  2. Verify issue number: $ISSUE_NUM"
echo "  3. Run: scripts/test-agent.sh --fast (before any commit)"
echo "  4. Create PR with 'fixes #$ISSUE_NUM' in body"
echo ""
echo "SETUP:OK | WT:${ABS_PATH} | BRANCH:${BRANCH} | ISSUE:#${ISSUE_NUM}"
