#!/bin/bash
# worktree-guard.sh — Block source file edits in the main repo.
# Forces agents to write in worktrees.
#
# Hook: PreToolUse on Write, Edit
#
# What this blocks:
#   - Writing/editing .ts, .pike, .tsx, .js files in the main repo
#   - git add/commit without cd to worktree
#
# What this allows:
#   - All writes in worktree directories (pike-lsp-feat-*, pike-lsp-fix-*, etc.)
#   - Config/doc files in main repo (.md, .json, .yaml, .sh, .log)
#   - Files in .omc/, .claude/, scripts/

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

# --- Handle Write/Edit tools ---
if [[ "$TOOL" == "Write" || "$TOOL" == "Edit" || "$TOOL" == "MultiEdit" ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

  # If no path found, allow (safety)
  if [[ -z "$FILE_PATH" ]]; then
    exit 0
  fi

  # Resolve to absolute path
  if [[ "$FILE_PATH" != /* ]]; then
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
    FILE_PATH="$CWD/$FILE_PATH"
  fi

  # Find the main repo root
  MAIN_REPO=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [[ -z "$MAIN_REPO" ]]; then
    exit 0  # can't determine, allow
  fi

  # Check if file is inside the main repo (not a worktree)
  # Worktrees are siblings: pike-lsp-feat-*, pike-lsp-fix-*, etc.
  # Main repo is just: pike-lsp/
  case "$FILE_PATH" in
    "$MAIN_REPO"/*)
      # File IS in the main repo. Check if it's a source file.
      REL_PATH="${FILE_PATH#$MAIN_REPO/}"

      # Allow config/doc files by extension in main repo
      case "$REL_PATH" in
        .omc/*|.claude/*|scripts/*)
          exit 0  # config/scripts are fine in main repo
          ;;
      esac

      # Check if it's a source file (block these)
      case "$REL_PATH" in
        *.ts|*.tsx|*.js|*.jsx|*.pike|*.pmod|*.pikei)
          # It's a source file in the main repo — BLOCK
          echo "BLOCKED: Cannot write source files in main repo. You're editing:" >&2
          echo "  $FILE_PATH" >&2
          echo "" >&2
          echo "Create a worktree first, then use ABSOLUTE paths to the worktree:" >&2
          echo "  scripts/worktree.sh create feat/description" >&2
          echo "  Then write to: $(dirname $MAIN_REPO)/pike-lsp-feat-description/${REL_PATH}" >&2
          echo "" >&2
          echo "Remember: cd does NOT persist between tool calls." >&2
          exit 2
          ;;
      esac

      # Allow all other files (config/doc files like .md, .json, .yaml, .sh, .log)
      exit 0
      ;;
  esac

  # File is NOT in main repo (it's in a worktree or elsewhere) — allow
  exit 0
fi

# --- Handle Bash: block git add/commit without worktree context ---
if [[ "$TOOL" == "Bash" ]]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  # Block git add in main repo without cd prefix
  if echo "$CMD" | grep -qE "^git (add|commit)"; then
    if ! echo "$CMD" | grep -qE "(cd |git -C )"; then
      CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
      BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null || echo "unknown")

      # Check if this is the main repo (not a worktree)
      # Use git worktree list to detect - main repo has worktrees as siblings
      IS_MAIN=false
      if git -C "$CWD" rev-parse --is-inside-work-tree 2>/dev/null | grep -q "true"; then
        # We're in a git repo - check if it's the main one
        if git -C "$CWD" worktree list --porcelain 2>/dev/null | head -1 | grep -q "^worktree $CWD$"; then
          # First worktree is the current directory - check if it's main repo
          if git -C "$CWD" branch --show-current 2>/dev/null | grep -qE "^(main|master)$"; then
            IS_MAIN=true
          fi
        fi
      fi

      if [[ "$IS_MAIN" == "true" ]]; then
        echo "BLOCKED: Cannot git add/commit on main. Prefix with cd to your worktree:" >&2
        echo "  cd ../pike-lsp-feat-YOURFEATURE && git add -A && git commit ..." >&2
        echo "Or use: scripts/worker-submit.sh --dir ../pike-lsp-feat-YOURFEATURE <issue> \"msg\"" >&2
        exit 2
      fi
    fi
  fi
fi

exit 0
