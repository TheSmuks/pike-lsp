#!/bin/bash
# toolchain-guard.sh — Enforces universal toolchain rules for ALL agents.
#
# What this blocks:
#   - npm, npx, yarn, pnpm (use bun instead)
#   - Direct vscode-test runs (use bun run test wrappers)
#   - jest, vitest, mocha (use bun test)
#   - gh pr create/merge in main repo (must use scripts)
#
# What this allows:
#   - gh pr create/merge in worktrees (valid feature branches)
#
# What this does NOT do:
#   - Distinguish lead from worker (hooks can't reliably do this)
#   - Lead coding restrictions are enforced by prompt in .claude/roles/lead.md

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Bash commands
if [[ "$TOOL" != "Bash" ]]; then
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)

# Detect if we're in a worktree (not main repo)
detect_worktree_context() {
  local workdir="${1:-$(pwd)}"
  local is_worktree branch

  is_worktree=$(git -C "$workdir" rev-parse --is-inside-work-tree 2>/dev/null || echo "false")

  if [ "$is_worktree" = "true" ]; then
    # Check if it's the main repo or a worktree
    if git -C "$workdir" worktree list --porcelain 2>/dev/null | head -1 | grep -q "^worktree $workdir$"; then
      branch=$(git -C "$workdir" branch --show-current 2>/dev/null || echo "unknown")
      echo "main:$branch"
    else
      branch=$(git -C "$workdir" branch --show-current 2>/dev/null || echo "unknown")
      echo "worktree:$branch"
    fi
  else
    echo "unknown"
  fi
}

CONTEXT=$(detect_worktree_context "$CWD")
IS_MAIN_REPO=false

if [[ "$CONTEXT" == main:* ]]; then
  IS_MAIN_REPO=true
fi

# --- Block manual gh pr create in main repo - must use worker-submit.sh ---
# Allow in worktrees (valid feature branch PRs)
if echo "$CMD" | grep -qE "^gh pr create"; then
  if [[ "${WORKER_SUBMIT_MODE:-}" != "1" ]]; then
    # Only block in main repo, allow in worktrees
    if [[ "$IS_MAIN_REPO" == "true" ]]; then
      echo "BLOCKED: Direct 'gh pr create' is not allowed in main repo. Use worker-submit.sh instead:" >&2
      echo "  scripts/worker-submit.sh --dir <worktree_path> <issue_number> \"<commit message>\"" >&2
      echo "" >&2
      echo "worker-submit.sh ensures:" >&2
      echo "  - Smoke tests pass before submit" >&2
      echo "  - Proper PR format with fixes #N" >&2
      echo "  - Clean commit history" >&2
      exit 2
    fi
  fi
fi

# --- Block manual gh pr merge in main repo - must use pr-merge.sh ---
# Allow in worktrees (valid merges from feature branches)
if echo "$CMD" | grep -qE "gh pr merge"; then
  if [[ "${PR_MERGE_MODE:-}" != "1" ]]; then
    # Only block in main repo, allow in worktrees
    if [[ "$IS_MAIN_REPO" == "true" ]]; then
      echo "BLOCKED: Direct 'gh pr merge' is not allowed in main repo. Use scripts/pr-merge.sh instead:" >&2
      echo "  scripts/pr-merge.sh <pr_number>" >&2
      echo "" >&2
      echo "pr-merge.sh ensures:" >&2
      echo "  - Automatic worktree cleanup before merge" >&2
      echo "  - Squash merge with branch deletion" >&2
      echo "  - Retry on worktree conflicts" >&2
      exit 2
    fi
  fi
fi

# --- Forbidden package managers ---
if echo "$CMD" | grep -qE "^(npm|npx|yarn|pnpm) "; then
  echo "BLOCKED: Use bun, not npm/yarn/pnpm. Examples: 'bun install', 'bun run test', 'bunx prettier'." >&2
  exit 2
fi

# --- Forbidden test runners ---
if echo "$CMD" | grep -qE "(^|\s)(jest|vitest|mocha)(\s|$)"; then
  echo "BLOCKED: Use 'bun run test' or 'scripts/test-agent.sh', not jest/vitest/mocha directly." >&2
  exit 2
fi

# --- Forbidden direct vscode-test ---
if echo "$CMD" | grep -qE "vscode-test"; then
  echo "BLOCKED: Use 'bun run test' or 'bun run test:features', not vscode-test directly." >&2
  exit 2
fi

exit 0
