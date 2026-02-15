#!/bin/bash
# toolchain-guard.sh — Enforces universal toolchain rules for ALL agents.
#
# What this blocks:
#   - npm, npx, yarn, pnpm (use bun instead)
#   - Direct vscode-test runs (use bun run test wrappers)
#   - jest, vitest, mocha (use bun test)
#
# What this does NOT do:
#   - Distinguish lead from worker (hooks can't reliably do this)
#   - Lead coding restrictions are enforced by prompt in .claude/roles/lead.md

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Only check Bash commands
if [[ "$TOOL" != "Bash" ]]; then
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# --- Block commits on main branch ---
# KNOWN ISSUE: Claude Code's $CWD always reports the main repo, even when the
# agent is working in a worktree. So we CANNOT reliably detect which branch
# the agent is actually on from the hook.
#
# Strategy: only block if the command explicitly commits on main without
# any cd/worktree context. If the command contains cd or -C, let it through —
# the git-workflow-gate hook and branch protection handle the rest.
if echo "$CMD" | grep -qE "^git commit"; then
  # If command is literally just "git commit" with no cd prefix, check CWD
  # But allow if any worktree directory indicators are present
  if ! echo "$CMD" | grep -qE "(cd |git -C )"; then
    BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null || echo "unknown")
    IS_WORKTREE=$(git -C "$CWD" rev-parse --git-common-dir 2>/dev/null || echo ".git")
    # Only block if CWD is genuinely the main repo (not a worktree)
    if [[ "$BRANCH" == "main" && "$IS_WORKTREE" == ".git" ]]; then
      echo "BLOCKED: Cannot commit on main. Create a worktree first: scripts/worktree.sh create feat/description" >&2
      exit 2
    fi
  fi
fi

# --- Block manual gh pr create (must use worker-submit.sh to ensure fixes #N) ---
# Allow if called from within worker-submit.sh
if echo "$CMD" | grep -qE "^gh pr create"; then
  if ! echo "$CMD" | grep -qE "fixes #[0-9]"; then
    echo "BLOCKED: PR body must include 'fixes #<issue_number>'. Use 'scripts/worker-submit.sh <issue_number> \"<message>\"' which handles this automatically." >&2
    exit 2
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
