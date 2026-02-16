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

# Only check Bash commands
if [[ "$TOOL" != "Bash" ]]; then
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# --- Block manual gh pr create - must use worker-submit.sh ---
# Allow if WORKER_SUBMIT_MODE is set (set by worker-submit.sh)
if echo "$CMD" | grep -qE "^gh pr create"; then
  if [[ "${WORKER_SUBMIT_MODE:-}" != "1" ]]; then
    echo "BLOCKED: Direct 'gh pr create' is not allowed. Use worker-submit.sh instead:" >&2
    echo "  scripts/worker-submit.sh --dir <worktree_path> <issue_number> \"<commit message>\"" >&2
    echo "" >&2
    echo "worker-submit.sh ensures:" >&2
    echo "  - Smoke tests pass before submit" >&2
    echo "  - Proper PR format with fixes #N" >&2
    echo "  - Clean commit history" >&2
    exit 2
  fi
fi

# --- Block manual gh pr merge - must use pr-merge.sh ---
# Allow if PR_MERGE_MODE is set (set by pr-merge.sh)
if echo "$CMD" | grep -qE "gh pr merge"; then
  if [[ "${PR_MERGE_MODE:-}" != "1" ]]; then
    echo "BLOCKED: Direct 'gh pr merge' is not allowed. Use scripts/pr-merge.sh instead:" >&2
    echo "  scripts/pr-merge.sh <pr_number>" >&2
    echo "" >&2
    echo "pr-merge.sh ensures:" >&2
    echo "  - Automatic worktree cleanup before merge" >&2
    echo "  - Squash merge with branch deletion" >&2
    echo "  - Retry on worktree conflicts" >&2
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
