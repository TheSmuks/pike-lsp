#!/usr/bin/env bash
# git-workflow-gate.sh - PreToolUse hook for Bash
#
# Enforces the feature-branch workflow:
# 1. No direct commits on main/master (must use feature branches)
# 2. No direct push to main/master (must go through PRs)
# 3. No direct tag creation (must use pike-lsp-release skill)
# 4. Branch naming must follow type/description convention
#
# Allowed branch prefixes: feat/, fix/, docs/, refactor/, test/, chore/, release/

set -uo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

if [ -z "$COMMAND" ]; then
  exit 0
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
should_block=false
block_message=""

# --- 0. Block --no-verify and --admin bypass attempts ---
if echo "$COMMAND" | grep -qP '\s--no-verify\b'; then
  should_block=true
  block_message="[WORKFLOW] BLOCKED: --no-verify is not allowed.

Git hooks exist to protect code quality. Bypassing them defeats the purpose.
Fix the underlying issue that's causing the hook to fail."
fi

if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP 'gh\s+pr\s+merge\s+.*--admin'; then
  should_block=true
  block_message="[WORKFLOW] BLOCKED: --admin bypass of branch protection is not allowed.

Branch protection rules exist for a reason. Wait for checks to pass."
fi

# --- 1. Block commits on main/master ---
if echo "$COMMAND" | grep -qP '(^|\s|&&|\|)git\s+commit(\s|$)'; then
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    should_block=true
    block_message="[WORKFLOW] BLOCKED: Direct commits to $CURRENT_BRANCH are not allowed.

Create a feature branch first:
  git checkout -b feat/your-feature-name
  git checkout -b fix/bug-description
  git checkout -b docs/what-changed
  git checkout -b refactor/what-changed
  git checkout -b test/what-testing
  git checkout -b chore/maintenance-task

Then commit on the feature branch and create a PR to merge into main."
  fi
fi

# --- 2. Block push to main/master ---
if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP '(^|\s|&&|\|)git\s+push(\s|$)'; then
  # Always allow dry-run
  if echo "$COMMAND" | grep -qP '\s--dry-run\b'; then
    : # allowed
  # Block: explicit push to main/master
  elif echo "$COMMAND" | grep -qP 'git\s+push\s+\S+\s+(main|master)\b'; then
    should_block=true
    block_message="[RELEASE GATE] BLOCKED: Direct push to main/master is not allowed.

Use the release skill to push to main:
  /pike-lsp-release

Or push your feature branch and create a PR:
  git push -u origin $CURRENT_BRANCH
  gh pr create"
  # Block: bare git push when on main/master
  elif echo "$COMMAND" | grep -qP 'git\s+push\s*($|&&|\||;|--tags)'; then
    if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
      should_block=true
      block_message="[RELEASE GATE] BLOCKED: Direct push to $CURRENT_BRANCH is not allowed.

Use the release skill:
  /pike-lsp-release"
    fi
  # Block: git push --tags (pushes release tags)
  elif echo "$COMMAND" | grep -qP 'git\s+push\s+.*--tags'; then
    should_block=true
    block_message="[RELEASE GATE] BLOCKED: Direct tag push is not allowed.

Use the release skill:
  /pike-lsp-release"
  fi
fi

# --- 3. Block tag creation ---
if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP '(^|\s|&&|\|)git\s+tag(\s|$)'; then
  if ! echo "$COMMAND" | grep -qP '\s+(-l|--list|-d|--delete)\b'; then
    should_block=true
    block_message="[RELEASE GATE] BLOCKED: Direct tag creation is not allowed.

Use the release skill which handles tagging as part of the full release protocol:
  /pike-lsp-release"
  fi
fi

# --- 4. Validate branch naming on checkout -b ---
if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP 'git\s+(checkout\s+-b|switch\s+-c)\s+'; then
  BRANCH_NAME=$(echo "$COMMAND" | grep -oP 'git\s+(checkout\s+-b|switch\s+-c)\s+\K[^\s;|&]+' || true)
  if [ -n "$BRANCH_NAME" ]; then
    if ! echo "$BRANCH_NAME" | grep -qP '^(feat|fix|docs|refactor|test|chore|release)/[a-z0-9][a-z0-9-]+$'; then
      should_block=true
      block_message="[WORKFLOW] BLOCKED: Branch name '$BRANCH_NAME' doesn't follow the naming convention.

Required format: type/description (kebab-case)

Valid prefixes:
  feat/     - New features          (feat/hover-support)
  fix/      - Bug fixes             (fix/tokenizer-crash)
  docs/     - Documentation         (docs/readme-update)
  refactor/ - Code refactoring      (refactor/symbol-resolver)
  test/     - Test additions        (test/bridge-coverage)
  chore/    - Maintenance tasks     (chore/bump-dependencies)
  release/  - Release prep          (release/v0.2.0)"
    fi
  fi
fi

# --- 5. Block Bash-based test file tampering ---
# Agents can bypass test-integrity-gate (Edit/Write) by using sed/awk/echo on test files
if [ "$should_block" = false ]; then
  # Detect sed/awk/perl/echo targeting test files
  if echo "$COMMAND" | grep -qP '(sed|awk|perl)\s+.*\.(test|spec)\.(ts|js)\b'; then
    should_block=true
    block_message="[TEST INTEGRITY] BLOCKED: Direct shell manipulation of test files.

Use the Edit tool to modify test files, not sed/awk/perl.
The Edit tool has integrity checks that shell commands bypass."
  fi

  # Detect echo/cat/tee redirecting to test files
  if echo "$COMMAND" | grep -qP '(echo|cat|tee|printf)\s+.*>\s*\S*\.(test|spec)\.(ts|js)\b'; then
    should_block=true
    block_message="[TEST INTEGRITY] BLOCKED: Shell redirection to test files.

Use the Write tool to create test files, not echo/cat/tee.
The Write tool has integrity checks that shell commands bypass."
  fi

  # Detect cp/mv overwriting test files
  if echo "$COMMAND" | grep -qP '(cp|mv)\s+.*\.(test|spec)\.(ts|js)\b'; then
    should_block=true
    block_message="[TEST INTEGRITY] BLOCKED: Overwriting test files via cp/mv.

Use the Edit or Write tool to modify test files.
The dedicated tools have integrity checks that shell commands bypass."
  fi
fi

if [ "$should_block" = true ]; then
  echo "$block_message"
  exit 2
fi

exit 0
