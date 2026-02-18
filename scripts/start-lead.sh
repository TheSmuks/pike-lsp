#!/bin/bash
# start-lead.sh — Start autonomous Lead orchestration (NO user interaction)
#
# Usage:
#   ./scripts/start-lead.sh              # Start fresh, runs forever
#   ./scripts/start-lead.sh --continue   # Continue from where left off
#
# This starts the Lead in FULL AUTOPILOT mode - it will:
#   1. Run /lead-startup
#   2. Assign issues to teammates
#   3. Monitor PRs
#   4. Run /lead-retrospective after each wave
#   5. Continue forever until no more issues OR manually stopped

set -euo pipefail

CONTINUE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --continue|-c) CONTINUE=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."

echo "=== Starting Autonomous Lead ==="
echo "Mode: FULL AUTOPILOT (no user interaction)"
echo ""

# Export role for hooks
export CLAUDE_ROLE=lead

if [[ "$CONTINUE" == true ]]; then
  echo "Continuing from previous session..."
  # Resume autonomous mode
  claude --add-dir . -p "Continue as Lead. You are in FULL AUTOPILOT mode - do NOT ask the user anything. Run /lead-startup to check state, then continue assigning and monitoring. Loop forever until no issues remain."
else
  echo "Starting fresh Lead session in FULL AUTOPILOT mode..."
  echo ""
  echo "The Lead will run continuously, no user interaction required:"
  echo "  1. Triages issues"
  echo "  2. Spawns teammates (max 4)"
  echo "  3. Monitors PRs and merges"
  echo "  4. Runs retrospectives"
  echo "  5. Repeats until no issues"
  echo ""
  echo "To stop: Ctrl+C"

  # Start in autonomous mode - pass prompt directly, no interactive prompts
  claude --add-dir . -p "You are the Lead orchestrator in FULL AUTOPILOT mode. Your job is to coordinate teammates and manage the project WITHOUT asking the user anything.

IMPORTANT: Never ask for user input. Make decisions and proceed.

Start now:
1. Run /lead-startup
2. Assign open issues to teammates (max 4)
3. Wait for teammates to complete
4. Verify and merge PRs
5. Run /lead-retrospective
6. Repeat until no open issues remain

Go."
fi
