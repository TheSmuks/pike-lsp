#!/bin/bash
# message-format-guard.sh — Warn on unstructured SendMessage content.
#
# Hook: PreToolUse on SendMessage
#
# Workers should use structured prefixes: DONE:, BLOCKED:, IDLE:, STATUS:, CLAIM:, PING:, ACK:
# This hook warns (exit 0) on unstructured multi-line messages. It does NOT block.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check SendMessage
if [[ "$TOOL" != "SendMessage" ]]; then
  exit 0
fi

# Skip shutdown protocol messages
MSG_TYPE=$(echo "$INPUT" | jq -r '.tool_input.type // empty')
if [[ "$MSG_TYPE" == "shutdown_request" || "$MSG_TYPE" == "shutdown_response" || "$MSG_TYPE" == "plan_approval_response" ]]; then
  exit 0
fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
if [[ -z "$CONTENT" ]]; then
  exit 0
fi

# Check for recognized prefix
if echo "$CONTENT" | head -1 | grep -qE "^(DONE|BLOCKED|IDLE|STATUS|CLAIM|PING|ACK|FAILED|SUBMIT|MERGE|ERROR|WARN):"; then
  exit 0
fi

# Check if multi-line (more than 2 lines)
LINE_COUNT=$(echo "$CONTENT" | wc -l)
if [[ "$LINE_COUNT" -gt 2 ]]; then
  echo "WARN: message-format-guard | Message lacks structured prefix and is ${LINE_COUNT} lines | Use: DONE:|BLOCKED:|STATUS:|IDLE:|CLAIM:" >&2
fi

exit 0
