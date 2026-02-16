#!/bin/bash
# worker-cap-guard.sh — Enforces worker count cap at 150% of initial N.
#
# Hook: PreToolUse on Task
#
# Reads team state to get agent_count (initial N).
# Counts active teammates from ~/.claude/teams/*/config.json.
# Blocks new spawns if active workers >= floor(N * 1.5).
#
# Cap table:
#   N=2 -> max 3, N=3 -> max 4, N=4 -> max 6, N=5 -> max 7

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Task tool calls (agent spawns)
if [[ "$TOOL" != "Task" ]]; then
  exit 0
fi

# Only check if spawning a teammate (has team_name parameter)
TEAM_NAME=$(echo "$INPUT" | jq -r '.tool_input.team_name // empty')
if [[ -z "$TEAM_NAME" ]]; then
  exit 0
fi

# Find team config
TEAM_CONFIG="$HOME/.claude/teams/$TEAM_NAME/config.json"
if [[ ! -f "$TEAM_CONFIG" ]]; then
  # No config yet — this is the first spawn, allow it
  exit 0
fi

# Count current non-lead members
MEMBER_COUNT=$(jq -r '.members | length' "$TEAM_CONFIG" 2>/dev/null || echo "0")
# Subtract 1 for the lead (who is always a member)
WORKER_COUNT=$((MEMBER_COUNT > 0 ? MEMBER_COUNT - 1 : 0))

# Read initial agent_count from OMC team state
PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd // empty')
if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="$(pwd)"
fi

# Try session-scoped state first, then legacy
INITIAL_N=""
for STATE_FILE in "$PROJECT_DIR/.omc/state/sessions/"*/team-state.json "$PROJECT_DIR/.omc/state/team-state.json"; do
  if [[ -f "$STATE_FILE" ]]; then
    INITIAL_N=$(jq -r '.agent_count // .state.agent_count // empty' "$STATE_FILE" 2>/dev/null)
    if [[ -n "$INITIAL_N" && "$INITIAL_N" != "null" ]]; then
      break
    fi
  fi
done

# If no state found, default to 4 (project recommendation)
if [[ -z "$INITIAL_N" || "$INITIAL_N" == "null" ]]; then
  INITIAL_N=4
fi

# Calculate cap: floor(N * 1.5)
# Using integer math: cap = N + N/2
CAP=$(( INITIAL_N + INITIAL_N / 2 ))

if [[ "$WORKER_COUNT" -ge "$CAP" ]]; then
  echo "⛔ BLOCKED: Worker cap reached ($WORKER_COUNT/$CAP active workers)." >&2
  echo "" >&2
  echo "Initial worker count (N): $INITIAL_N" >&2
  echo "Hard cap (floor(N×1.5)):  $CAP" >&2
  echo "Current active workers:   $WORKER_COUNT" >&2
  echo "" >&2
  echo "You MUST shut down idle workers before spawning new ones:" >&2
  echo "  1. Check TaskList for idle workers" >&2
  echo "  2. SendMessage(type='shutdown_request') to idle workers" >&2
  echo "  3. Wait for shutdown_response" >&2
  echo "  4. Then retry spawning" >&2
  exit 2
fi

exit 0
