#!/bin/bash
# role-protocol-enforcer.sh — Enforces Lead and Executor protocol rules.
#
# Hook: PreToolUse on Write, Edit, MultiEdit, Bash
#
# ENFORCEMENT:
# - Lead NEVER writes code (.ts, .tsx, .js, .jsx, .pike in main repo)
# - Lead NEVER runs: git commit, git checkout -b, gh pr create
# - Lead MUST use issue templates (gh issue create)
# - Executor MUST use worker-submit.sh for PRs
# - Both MUST use worktrees for source code (worktree-guard handles this)

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Detect role from CLAUDE_ROLE env or .current_role file
ROLE_FILE="$(dirname "$0")/../.current_role"
ROLE="${CLAUDE_ROLE:-$(cat "$ROLE_FILE" 2>/dev/null || echo "unknown")}"

# --- Workers NEVER edit main repo directly ---
# Detect if executor is in main repo (not a worktree)
if [[ "$TOOL" == "Write" || "$TOOL" == "Edit" || "$TOOL" == "MultiEdit" ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

  # Only check for workers (executors)
  if [[ "$ROLE" == "executor" || "$ROLE" == "unknown" ]]; then
    # Check if file is in main repo (not worktree)
    if [[ -n "$FILE_PATH" && -n "$CWD" ]]; then
      # Resolve to absolute path
      if [[ "$FILE_PATH" != /* ]]; then
        FILE_PATH="$CWD/$FILE_PATH"
      fi

      # Check if in main repo
      MAIN_REPO=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
      if [[ -n "$MAIN_REPO" ]]; then
        GIT_COMMON=$(git -C "$MAIN_REPO" rev-parse --git-common-dir 2>/dev/null || echo ".git")
        BRANCH=$(git -C "$MAIN_REPO" branch --show-current 2>/dev/null || echo "")

        # If in main repo on main branch, block all edits from workers
        if [[ "$FILE_PATH" == "$MAIN_REPO/"* || "$FILE_PATH" == "$MAIN_REPO" ]] && [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
          echo "⛔ BLOCKED: Workers cannot edit files in main repo." >&2
          echo "" >&2
          echo "You're in main repo: $FILE_PATH" >&2
          echo "" >&2
          echo "Create a worktree first:" >&2
          echo "  scripts/worktree.sh create fix/description" >&2
          echo "" >&2
          echo "Then write to the worktree, NOT main." >&2
          exit 2
        fi
      fi
    fi
  fi
fi

# --- Lead NEVER writes code ---
if [[ "$TOOL" == "Write" || "$TOOL" == "Edit" || "$TOOL" == "MultiEdit" ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

  # Only check source files
  case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx|*.pike)
      # Check if this is a config/doc file (allowed)
      case "$FILE_PATH" in
        *.d.ts|*.test.ts|*.spec.ts)
          # These are source files
          if [[ "$ROLE" == "lead" ]]; then
            echo "⛔ BLOCKED: Lead cannot write source code." >&2
            echo "" >&2
            echo "You are the Lead (orchestrator). Your job is to:" >&2
            echo "  • Triage issues and assign to teammates" >&2
            echo "  • Verify PRs and merge passing ones" >&2
            echo "  • Use /lead-dashboard, /lead-startup, /ci-status" >&2
            echo "" >&2
            echo "To fix something: create an issue and assign to a teammate." >&2
            exit 2
          fi
          ;;
        *)
          # Allow non-source writes (configs, docs)
          ;;
      esac
      ;;
  esac
fi

# --- Lead forbidden commands ---
if [[ "$TOOL" == "Bash" && "$ROLE" == "lead" ]]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  # Lead forbidden: git commit, git checkout -b, gh pr create
  if echo "$CMD" | grep -qE "^git commit"; then
    echo "⛔ BLOCKED: Lead cannot run 'git commit'." >&2
    echo "Workers commit via worktrees using scripts/worker-submit.sh" >&2
    exit 2
  fi

  if echo "$CMD" | grep -qE "git checkout -b"; then
    echo "⛔ BLOCKED: Lead cannot create branches." >&2
    echo "Workers create branches in worktrees." >&2
    exit 2
  fi

  if echo "$CMD" | grep -qE "^gh pr create"; then
    echo "⛔ BLOCKED: Lead cannot create PRs." >&2
    echo "Workers create PRs via scripts/worker-submit.sh" >&2
    exit 2
  fi

  # Lead MUST use issue template - block if gh issue create without template
  if echo "$CMD" | grep -qE "^gh issue create"; then
    # Check if using template (look for "## Summary" or "## Acceptance Criteria")
    if ! echo "$CMD" | grep -qE "(Summary|Acceptance Criteria|References)"; then
      echo "⛔ BLOCKED: Lead must use issue template." >&2
      echo "" >&2
      echo "Template: .claude/templates/issue.md" >&2
      echo "Required format:" >&2
      echo "  ## Summary" >&2
      echo "  ## Acceptance Criteria (checklist)" >&2
      echo "  ## References" >&2
      echo "  Two labels: priority (P0-P4) + area (pike-side/ts-side/roxen)" >&2
      exit 2
    fi
    # Also check for labels - at least 2 required
    if ! echo "$CMD" | grep -qE "\-\-label"; then
      echo "⛔ BLOCKED: Issue must have two labels (priority + area)." >&2
      echo "Example: --label P1-tests --label ts-side" >&2
      exit 2
    fi
  fi
fi

# --- Executor MUST use scripts for PR creation ---
if [[ "$TOOL" == "Bash" && "$ROLE" == "executor" ]]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  # If executor tries to create PR manually, block and redirect to script
  if echo "$CMD" | grep -qE "^gh pr create"; then
    echo "⛔ BLOCKED: Executors must use worker-submit.sh to create PRs." >&2
    echo "" >&2
    echo "Use: scripts/worker-submit.sh --dir <worktree_path> <issue_number> \"<commit msg>\"" >&2
    echo "" >&2
    echo "This ensures:" >&2
    echo "  • PR body includes 'fixes #<issue>'" >&2
    echo "  • Smoke test runs before submit" >&2
    echo "  • Proper branch naming" >&2
    exit 2
  fi
fi

exit 0
