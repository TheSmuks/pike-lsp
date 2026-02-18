#!/bin/bash
# ci-wait.sh - CI polling with exponential backoff
set -euo pipefail

PR_NUM="${1:-}"
TIMEOUT="${2:-900}"

if [ -z "$PR_NUM" ]; then
  echo "Usage: ci-wait.sh <pr_number> [timeout_seconds]" >&2
  exit 1
fi

echo "=== CI WAIT FOR PR #$PR_NUM ==="
echo "Timeout: ${TIMEOUT}s"

elapsed=0
interval=30

while [ $elapsed -lt "$TIMEOUT" ]; do
  status_json=$(gh pr view "$PR_NUM" --json statusCheckRollup 2>/dev/null || echo '{"statusCheckRollup":{"state":"UNKNOWN"}}')
  state=$(echo "$status_json" | jq -r '.statusCheckRollup.state')

  case "$state" in
    "SUCCESS")
      echo "✓ CI PASSED"
      exit 0
      ;;
    "FAILURE")
      echo "✗ CI FAILED"
      # Get failed checks details
      echo "$status_json" | jq -r '.statusCheckRollup.contexts[] | select(.conclusion == "FAILURE") | "\(.name): \(.conclusion)"' 2>/dev/null || true
      exit 1
      ;;
    "PENDING"|"IN_PROGRESS")
      echo "  Status: $state (${elapsed}s elapsed, next check in ${interval}s)"
      ;;
    "UNKNOWN"|*)
      echo "  Status: UNKNOWN or checking... (${elapsed}s)"
      ;;
  esac

  sleep "$interval"
  elapsed=$((elapsed + interval))

  # Exponential backoff: 30 → 60 → 90 → 120 (max)
  if [ $interval -lt 120 ]; then
    interval=$((interval + 30))
  fi
done

echo "TIMEOUT after ${TIMEOUT}s"
exit 124
