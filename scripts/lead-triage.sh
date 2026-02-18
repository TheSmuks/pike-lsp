#!/bin/bash
# lead-triage.sh - Issue triage with rate limiting
set -euo pipefail

RATE_LIMIT_DELAY=2

label_issue() {
  local issue_num=$1
  local label=$2
  current=$(gh issue view "$issue_num" --json labels -q '[.[].name]' 2>/dev/null || echo "[]")
  if echo "$current" | grep -q "^${label}$"; then
    echo "  #${issue_num} already has '${label}'"
    return 0
  fi
  gh issue edit "$issue_num" --add-label "$label" 2>/dev/null && \
    echo "  Labeled #${issue_num} as ${label}" || echo "  Failed #${issue_num}"
}

echo "=== ISSUE TRIAGE ==="

echo "Labeling TheSmuks issues as 'safe'..."
for issue in $(gh issue list --author TheSmuks --state open --json number -q '.[].number' 2>/dev/null); do
  label_issue "$issue" "safe"
  sleep "$RATE_LIMIT_DELAY"
done

echo "Labeling others as 'pending-review'..."
for issue in $(gh issue list --state open --json number -q '.[].number' 2>/dev/null); do
  author=$(gh issue view "$issue" --json author -q '.author.login' 2>/dev/null)
  [ "$author" != "TheSmuks" ] && [ -n "$author" ] && label_issue "$issue" "pending-review"
  sleep "$RATE_LIMIT_DELAY"
done

echo "=== TRIAGE COMPLETE ==="
