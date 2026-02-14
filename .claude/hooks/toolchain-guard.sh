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
