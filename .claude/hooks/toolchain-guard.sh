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
if echo "$CMD" | grep -qE "git commit"; then
  BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null || echo "")
  if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
    echo "BLOCKED: Cannot commit on main. Create a worktree first: scripts/worktree.sh create feat/description" >&2
    exit 2
  fi
fi

# --- Block manual gh pr create (must use worker-submit.sh to ensure fixes #N) ---
if echo "$CMD" | grep -qE "^gh pr create"; then
  echo "BLOCKED: Use 'scripts/worker-submit.sh <issue_number> \"<message>\"' instead of manual gh pr create. This ensures 'fixes #N' is included and the issue auto-closes." >&2
  exit 2
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
