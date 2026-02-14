#!/bin/bash
# lead-guard.sh — Two jobs:
#   1. Block npm/yarn/pnpm ALWAYS (solo or team)
#   2. Block lead from coding ONLY when a team is active
#
# Detection:
#   - ~/.claude/teams/*/config.json exists → team mode → enforce lead restrictions
#   - No team config → solo mode → only enforce npm block

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

# ============================================================
# GLOBAL BLOCKS — always active, solo or team
# ============================================================
if [[ "$TOOL" == "Bash" ]]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  if echo "$CMD" | grep -qE "^(npm|npx|yarn|pnpm) "; then
    echo "BLOCKED: Use bun, not npm/yarn/pnpm. 'bun install', 'bun run test', 'bunx prettier'." >&2
    exit 2
  fi
fi

# ============================================================
# TEAM MODE CHECK — skip lead restrictions if running solo
# ============================================================
if ! ls ~/.claude/teams/*/config.json &>/dev/null; then
  exit 0
fi

# ============================================================
# TEAM MODE: lead restrictions below
# ============================================================

# Workers in worktrees get full access
GIT_DIR=$(git -C "$CWD" rev-parse --git-dir 2>/dev/null)
if [[ "$GIT_DIR" == *"/worktrees/"* ]]; then
  exit 0
fi

# --- Main repo: Edit/Write only for housekeeping paths ---
if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

  ALLOWED_PATHS=(
    ".omc/"
    "STATUS.md"
    "IMPROVEMENT_BACKLOG.md"
    ".claude/status/"
  )

  for path in "${ALLOWED_PATHS[@]}"; do
    if [[ "$FILE_PATH" == *"$path"* ]]; then
      exit 0
    fi
  done

  echo "BLOCKED: Cannot edit '$FILE_PATH' from main repo. If you are the lead: create an issue and assign to a teammate. If you are a worker: create a worktree first." >&2
  exit 2
fi

# --- Main repo: Bash allowlist ---
if [[ "$TOOL" == "Bash" ]]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  ALLOWED_PATTERNS=(
    # Git read operations
    "^git status" "^git branch" "^git log" "^git pull" "^git ls-remote"
    "^git diff" "^git checkout main" "^git worktree" "^git rev-parse"
    # GitHub CLI
    "^gh pr " "^gh issue " "^gh run " "^gh label "
    # Project scripts
    "^scripts/" "^\\./scripts/"
    # Read-only commands
    "^cat " "^grep " "^rg " "^head " "^tail " "^ls" "^wc " "^find "
    "^echo " "^pwd" "^test " "^\\[" "^diff " "^which " "^type "
    # Housekeeping writes (workers updating status between tasks)
    "^mkdir -p \\.omc" ">> \\.omc/" ">> STATUS" ">> IMPROVEMENT"
    ">> \\.claude/status/"
  )

  for pattern in "${ALLOWED_PATTERNS[@]}"; do
    if echo "$CMD" | grep -qE "$pattern"; then
      exit 0
    fi
  done

  echo "BLOCKED: Cannot run '$CMD' from main repo. If you are the lead: create an issue and assign to a teammate. If you are a worker: create a worktree first." >&2
  exit 2
fi

# All other tools (Read, Glob, Search, etc.) — allow
exit 0
