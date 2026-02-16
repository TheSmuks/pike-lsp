#!/bin/bash
# start-lead.sh — Start Lead orchestration session
#
# Usage:
#   ./scripts/start-lead.sh              # Start fresh
#   ./scripts/start-lead.sh --continue   # Continue from where left off
#
# This sets CLAUDE_ROLE=lead and starts Claude Code in the project.
# The Lead will:
#   1. Run /lead-startup
#   2. Spawn teammates for open issues
#   3. Monitor progress
#   4. Run retrospectives after each wave

set -euo pipefail

CONTINUE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --continue|-c) CONTINUE=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."

echo "=== Starting Lead Orchestration ==="
echo "Role: lead"
echo ""

if [[ "$CONTINUE" == true ]]; then
  echo "Continuing from previous session..."
  claude --add-dir . --print-only "Continue as Lead. Run /lead-dashboard to see current state."
else
  echo "Starting fresh Lead session..."
  echo ""
  echo "The Lead will:"
  echo "  1. Run /lead-startup to pull main and triage"
  echo "  2. Assign open issues to teammates"
  echo "  3. Monitor PRs and verify merges"
  echo "  4. Run retrospective after each iteration"
  echo ""
  echo "Use /lead-dashboard for status, /lead-audit for deep reviews"

  # Start Claude Code with Lead role
  CLAUDE_ROLE=lead claude --add-dir .
fi
