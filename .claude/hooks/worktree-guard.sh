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

      # Allow only .omc/, .claude/, scripts/ in main repo (workers must use worktrees)
      case "$REL_PATH" in
        .omc/*|.claude/*|scripts/*)
          exit 0  # config/scripts are fine in main repo
          ;;
      esac

      # Check if main repo IS a worktree (git-common-dir differs from .git)
      GIT_COMMON=$(git -C "$MAIN_REPO" rev-parse --git-common-dir 2>/dev/null || echo ".git")
      if [[ "$GIT_COMMON" != ".git" ]]; then
        exit 0  # CWD is actually a worktree, allow
      fi

      # Check current branch - if not main, allow (agent might have checked out a branch)
      BRANCH=$(git -C "$MAIN_REPO" branch --show-current 2>/dev/null || echo "")
      if [[ "$BRANCH" != "main" && "$BRANCH" != "master" && -n "$BRANCH" ]]; then
        exit 0  # on a feature branch in main repo, allow
      fi

      # It's a source file in the main repo on main branch — BLOCK
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
      GIT_COMMON=$(git -C "$CWD" rev-parse --git-common-dir 2>/dev/null || echo ".git")
      if [[ "$BRANCH" == "main" && "$GIT_COMMON" == ".git" ]]; then
        echo "BLOCKED: Cannot git add/commit on main. Prefix with cd to your worktree:" >&2
        echo "  cd ../pike-lsp-feat-YOURFEATURE && git add -A && git commit ..." >&2
        echo "Or use: scripts/worker-submit.sh --dir ../pike-lsp-feat-YOURFEATURE <issue> \"msg\"" >&2
        exit 2
      fi
    fi
  fi
fi

exit 0
