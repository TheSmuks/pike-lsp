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
echo "[git-workflow-gate] INFO: Current branch: $CURRENT_BRANCH"
should_block=false
block_message=""

# --- RELEASE BYPASS: Allow pike-lsp-release skill to tag/push (TTL: 1 hour) ---
if [ -f ".omc/state/pike-lsp-release.json" ]; then
  # Check marker age - bypass only valid for 1 hour
  MARKER_AGE=$(($(date +%s) - $(stat -c %Y ".omc/state/pike-lsp-release.json" 2>/dev/null || echo 0)))
  echo "[git-workflow-gate] DEBUG: Release marker age: ${MARKER_AGE}s"
  if [ "$MARKER_AGE" -lt 3600 ]; then
    # Release skill is active and marker is fresh - bypass all workflow restrictions
    echo "[git-workflow-gate] RELEASE BYPASS: Release skill active, allowing command"
    exit 0
  fi
  # Marker expired (>1 hour) - treat as if not present
  echo "[git-workflow-gate] DEBUG: Release marker expired, continuing gate checks"
fi

# --- 0. Block --no-verify and --admin bypass attempts ---
if echo "$COMMAND" | grep -qP '\s--no-verify\b'; then
  should_block=true
  block_message="[WORKFLOW] BLOCKED: --no-verify bypasses code quality hooks. Fix the underlying issue instead."
fi

if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP 'gh\s+pr\s+merge\s+.*--admin'; then
  should_block=true
  block_message="[WORKFLOW] BLOCKED: --admin bypasses branch protection. Wait for CI checks to pass."
fi

# --- 1. Block commits on main/master ---
if echo "$COMMAND" | grep -qP '(^|\s|&&|\|)git\s+commit(\s|$)'; then
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    should_block=true
    block_message="[WORKFLOW] BLOCKED: Direct commits to $CURRENT_BRANCH not allowed. Create feature branch: git checkout -b feat/your-feature"
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
    block_message="[RELEASE GATE] BLOCKED: Direct push to main/master not allowed. Use /pike-lsp-release or push feature branch"
  # Block: bare git push when on main/master
  elif echo "$COMMAND" | grep -qP 'git\s+push\s*($|&&|\||;|--tags)'; then
    if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
      should_block=true
      block_message="[RELEASE GATE] BLOCKED: Direct push to $CURRENT_BRANCH not allowed. Use /pike-lsp-release"
    fi
  # Block: git push --tags (pushes release tags)
  elif echo "$COMMAND" | grep -qP 'git\s+push\s+.*--tags'; then
    should_block=true
    block_message="[RELEASE GATE] BLOCKED: Direct tag push not allowed. Use /pike-lsp-release"
  fi
fi

# --- 3. Block tag creation ---
if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP '(^|\s|&&|\|)git\s+tag(\s|$)'; then
  if ! echo "$COMMAND" | grep -qP '\s+(-l|--list|-d|--delete)\b'; then
    should_block=true
    block_message="[RELEASE GATE] BLOCKED: Direct tag creation not allowed. Use /pike-lsp-release"
  fi
fi

# --- 4. Validate branch naming on checkout -b ---
if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP 'git\s+(checkout\s+-b|switch\s+-c)\s+'; then
  BRANCH_NAME=$(echo "$COMMAND" | grep -oP 'git\s+(checkout\s+-b|switch\s+-c)\s+\K[^\s;|&]+' || true)
  if [ -n "$BRANCH_NAME" ]; then
    if ! echo "$BRANCH_NAME" | grep -qP '^(feat|fix|docs|refactor|test|chore|release|perf)/[a-z0-9][a-z0-9-]+$'; then
      should_block=true
      block_message="[WORKFLOW] BLOCKED: Branch name '$BRANCH_NAME' doesn't follow convention. Use type/description (e.g., feat/hover-support)"
    fi
  fi
fi

# --- 5. Block Bash-based test file tampering ---
# Agents can bypass test-integrity-gate (Edit/Write) by using sed/awk/echo on test files
if [ "$should_block" = false ]; then
  # Detect sed/awk/perl/echo targeting test files
  if echo "$COMMAND" | grep -qP '(sed|awk|perl)\s+.*\.(test|spec)\.(ts|js)\b'; then
    should_block=true
    block_message="[TEST INTEGRITY] BLOCKED: Use Edit tool for test files, not shell commands (sed/awk/perl)."
  fi

  # Detect echo/cat/tee redirecting to test files
  if echo "$COMMAND" | grep -qP '(echo|cat|tee|printf)\s+.*>\s*\S*\.(test|spec)\.(ts|js)\b'; then
    should_block=true
    block_message="[TEST INTEGRITY] BLOCKED: Use Write tool for test files, not shell redirection."
  fi

  # Detect cp/mv overwriting test files
  if echo "$COMMAND" | grep -qP '(cp|mv)\s+.*\.(test|spec)\.(ts|js)\b'; then
    should_block=true
    block_message="[TEST INTEGRITY] BLOCKED: Use Edit/Write tool for test files, not cp/mv."
  fi
fi

if [ "$should_block" = true ]; then
  echo "$block_message"
  echo ""
  echo "DEBUG: branch=$CURRENT_BRANCH ts=$(date -Iseconds)"
  exit 2
fi

# Debug output for allowed commands
echo "[git-workflow-gate] ALLOWED: branch=$CURRENT_BRANCH"
exit 0
