#!/bin/bash
# PreToolUse hook to enforce --label safe on all gh issue commands
# This prevents bypass of the safe label system

COMMAND="$1"
TOOL_NAME="$2"

# Only intercept gh commands
if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

# Check if this is a gh issue command
if echo "$COMMAND" | grep -qE 'gh\s+issue'; then
  # Must contain --label safe (case insensitive)
  if echo "$COMMAND" | grep -qiE -- '--label\s+safe'; then
    exit 0  # Allow
  else
    echo "HOOK:REJECT | gh issue commands MUST contain --label safe filter"
    echo "HOOK:HINT | Use: gh issue list --state open --label safe"
    exit 1  # Block
  fi
fi

exit 0
