#!/bin/bash
# stall-guard.sh — Block sleep/watch/polling in Bash commands.
#
# Hook: PreToolUse (Bash)
#
# Workers must use SendMessage for coordination, not sleep/poll loops.
# Legitimate waits (ci-wait.sh, gh pr checks --watch, test-agent.sh) are allowed.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Bash commands
if [[ "$TOOL" != "Bash" ]]; then
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# --- Allowlist: legitimate long-running commands ---
if echo "$CMD" | grep -qE "ci-wait\.sh"; then
  exit 0
fi
if echo "$CMD" | grep -qE "gh pr checks.*--watch"; then
  exit 0
fi
if echo "$CMD" | grep -qE "test-agent\.sh"; then
  exit 0
fi
if echo "$CMD" | grep -qE "gh run watch"; then
  exit 0
fi

# --- Block stalling patterns ---
REASON=""
if echo "$CMD" | grep -qE "(^|\s|;|&&|\|)sleep\s"; then
  REASON="sleep"
elif echo "$CMD" | grep -qE "(^|\s|;|&&|\|)watch\s"; then
  REASON="watch"
elif echo "$CMD" | grep -qE "while\s+(true|:)\s*;?\s*(do)?"; then
  REASON="infinite-loop"
elif echo "$CMD" | grep -qE "for\s*\(\(\s*;;\s*\)\)"; then
  REASON="infinite-loop"
elif echo "$CMD" | grep -qE "while.*sleep|until.*sleep"; then
  REASON="poll-loop"
fi

if [[ -n "$REASON" ]]; then
  echo "BLOCKED: stall-guard | ${REASON} | Use SendMessage instead" >&2
  exit 2
fi

exit 0
