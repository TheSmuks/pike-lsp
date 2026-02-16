#!/bin/bash
set -euo pipefail
# create-task.sh — Generate structured OMC task description from a GitHub issue.
#
# Usage:
#   scripts/create-task.sh <issue_number>
#
# Output: structured task description ready for TaskCreate.

if [[ $# -lt 1 ]]; then
  echo "ERROR: Usage: create-task.sh <issue_number>" >&2
  exit 1
fi

ISSUE_NUM="$1"
REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")

# Fetch issue
ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --json number,title,labels,body,state 2>&1) || {
  echo "ERROR: Issue #${ISSUE_NUM} not found: ${ISSUE_JSON}" >&2
  exit 1
}

# Validate issue is open
ISSUE_STATE=$(echo "$ISSUE_JSON" | jq -r '.state')
if [[ "$ISSUE_STATE" != "OPEN" ]]; then
  echo "ERROR: Issue #${ISSUE_NUM} is ${ISSUE_STATE} — cannot create task for closed/merged issue" >&2
  exit 1
fi

TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
LABELS=$(echo "$ISSUE_JSON" | jq -r '[.labels[].name] | join(", ")')
BODY=$(echo "$ISSUE_JSON" | jq -r '.body // ""')

# Validate labels (warn if fewer than 2)
LABEL_COUNT=$(echo "$ISSUE_JSON" | jq '[.labels[].name] | length')
if [[ "$LABEL_COUNT" -lt 2 ]]; then
  echo "WARNING: Issue #${ISSUE_NUM} has fewer than 2 labels (${LABELS}). Add priority + area labels." >&2
fi

# Derive branch name
if echo "$TITLE" | grep -qE "^(fix|feat|test|docs|refactor|chore):"; then
  TYPE=$(echo "$TITLE" | sed -E 's/^(fix|feat|test|docs|refactor|chore):.*/\1/')
  DESC=$(echo "$TITLE" | sed -E 's/^(fix|feat|test|docs|refactor|chore):\s*//')
else
  TYPE="feat"
  DESC="$TITLE"
fi
DESC_SANITIZED=$(echo "$DESC" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 -]//g' | sed 's/ \+/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
BRANCH="${TYPE}/${DESC_SANITIZED}"
SANITIZED_BRANCH=$(echo "$BRANCH" | sed 's|/|-|g')
WT_REL="../${REPO_NAME}-${SANITIZED_BRANCH}"

# Extract acceptance criteria from body (lines starting with "- [ ]")
AC=$(echo "$BODY" | grep -E "^\s*-\s*\[[ x]\]" || echo "- [ ] (no criteria found in issue body)")

echo "TASK_SUBJECT: ${TITLE} (#${ISSUE_NUM})"
echo "TASK_ISSUE: #${ISSUE_NUM}"
echo "TASK_BRANCH: ${BRANCH}"
echo "TASK_WT: ${WT_REL}"
echo "TASK_SETUP: scripts/worker-setup.sh ${ISSUE_NUM}"
echo "TASK_SUBMIT: scripts/worker-submit.sh --dir ${WT_REL} ${ISSUE_NUM} \"${TYPE}: ${DESC_SANITIZED}\""
echo "TASK_AC:"
echo "$AC" | while IFS= read -r line; do echo "  $line"; done
echo "  - [ ] Zero regressions"
echo "  - [ ] CI passes"
