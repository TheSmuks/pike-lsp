#!/usr/bin/env bash
# dispatch-issue.sh — Pick up a safe issue, fix it, create PR
# Called by the agent or cron. Handles the full cycle.
#
# Usage:
#   scripts/dispatch-issue.sh [issue-number]
#   scripts/dispatch-issue.sh          # auto-picks next safe issue

set -euo pipefail

ISSUE=${1:-}
REPO="TheSmuks/pike-lsp"
WORK_DIR="/tmp/pike-lsp-agent-$$"

# Ensure tools
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$HOME/pike-install/pike/8.0.1116/bin:$PATH"
GH="${HOME}/bin/gh"

# Pick an issue if not specified
if [ -z "$ISSUE" ]; then
  ISSUE=$($GH issue list --repo "$REPO" --state open --label safe --limit 1 --json number --jq '.[0].number' 2>/dev/null)
  if [ -z "$ISSUE" ] || [ "$ISSUE" = "null" ]; then
    echo "No safe issues found. Nothing to do."
    exit 0
  fi
  echo "Auto-selected issue #$ISSUE"
fi

# Get issue details
TITLE=$($GH issue view "$ISSUE" --repo "$REPO" --json title --jq '.title')
BODY=$($GH issue view "$ISSUE" --repo "$REPO" --json body --jq '.body')
LABELS=$($GH issue view "$ISSUE" --repo "$REPO" --json labels --jq '[.[].name] | join(", ")')

echo "=== Issue #$ISSUE: $TITLE ==="
echo "Labels: $LABELS"
echo ""

# Clone fresh copy
rm -rf "$WORK_DIR"
git clone --depth=50 https://github.com/$REPO.git "$WORK_DIR"
cd "$WORK_DIR"
git checkout -b "auto/issue-$ISSUE"

# Install deps
bun install --frozen-lockfile 2>/dev/null || bun install

# Build
bun run build 2>/dev/null

# Output issue context for the agent to process
cat <<EOF
=== AGENT TASK CONTEXT ===
Issue: #$ISSUE — $TITLE
Labels: $LABELS
Repo: $WORK_DIR

Description:
$BODY

=== INSTRUCTIONS ===
1. Investigate the issue in the codebase at $WORK_DIR
2. Write a scenario test FIRST in src/scenarios/scenario-runner.test.ts
3. Fix the code
4. Run: bun test packages/pike-lsp-server/src/scenarios/
5. Run: bash scripts/quality-gate.sh
6. Run: bash scripts/test-agent.sh --fast
7. If all pass, commit and create PR

Working directory: $WORK_DIR
Branch: auto/issue-$ISSUE
EOF
