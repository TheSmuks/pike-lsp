#!/bin/bash
# session-role-init.sh — Sets role context on session start.
#
# Hook: SessionStart
#
# Priority for role detection:
# 1. CLAUDE_ROLE environment variable (highest)
# 2. If in a worktree directory -> executor
# 3. Default to unknown (enforcer will be lenient)

INPUT=$(cat)

# Get session info
CWD=$(echo "$INPUT" | jq -r '.directory // .cwd // ""')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')

ROLE_FILE="$(dirname "$0")/../.current_role"
mkdir -p "$(dirname "$ROLE_FILE")"

# Priority 1: Check environment variable
if [[ -n "${CLAUDE_ROLE:-}" ]]; then
    echo "$CLAUDE_ROLE" > "$ROLE_FILE"
    exit 0
fi

# Priority 2: Detect from working directory
if [[ -n "$CWD" ]]; then
    # Check if this looks like a worktree (pike-lsp-feat-*, pike-lsp-fix-*)
    if [[ "$CWD" =~ pike-lsp-(feat|fix|test|docs|refactor|chore)- ]]; then
        echo "executor" > "$ROLE_FILE"
        exit 0
    fi

    # Check if this is the main repo
    if [[ "$CWD" =~ /pike-lsp$ ]] || [[ "$CWD" == *"pike-lsp" && "$CWD" != *"pike-lsp-"* ]]; then
        # In main repo - could be lead or just checking
        # Default to unknown (permissive — worktree-guard still blocks source writes)
        echo "unknown" > "$ROLE_FILE"
        exit 0
    fi
fi

# Default: unknown role (enforcer will allow but warn)
echo "unknown" > "$ROLE_FILE"
exit 0
