#!/usr/bin/env bash
# decisions-inject.sh - UserPromptSubmit hook
#
# Injects the decision index into agent context so they are forced
# to be aware of architectural decisions before starting work.

set -uo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
INDEX="$REPO_ROOT/.claude/decisions/INDEX.md"

MAX_LINES=40  # Cap injection to avoid context bloat (~25 ADRs fit in 40 lines)

if [ -f "$INDEX" ]; then
  TOTAL_LINES=$(wc -l < "$INDEX")
  echo "[DECISIONS] Consult before working. Challenge if context changed."
  echo ""
  head -n "$MAX_LINES" "$INDEX"
  if [ "$TOTAL_LINES" -gt "$MAX_LINES" ]; then
    REMAINING=$((TOTAL_LINES - MAX_LINES))
    echo ""
    echo "... ($REMAINING more lines - read full index: .claude/decisions/INDEX.md)"
  fi
  echo ""
  echo "Read full ADR: .claude/decisions/<file>.md | Add new: copy TEMPLATE.md"
fi

exit 0
