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

# Get actual working directory from the tool input
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)

# Detect worktree context: check if we're in a worktree (not main repo)
# Worktrees are siblings like pike-lsp-feat-*, pike-lsp-fix-*, etc.
detect_worktree_context() {
  local workdir="${1:-$(pwd)}"
  local git_dir branch

  # Get the git common dir to find the main repo
  git_dir=$(git -C "$workdir" rev-parse --git-common-dir 2>/dev/null || echo ".git")

  # Get worktree list - check if current dir is a worktree
  if git -C "$workdir" worktree list --porcelain 2>/dev/null | head -1 | grep -q "^worktree $workdir$"; then
    # This is the main worktree - check branch
    branch=$(git -C "$workdir" branch --show-current 2>/dev/null || echo "unknown")
    echo "main:$branch"
  else
    # Check if it's a worktree (not the main repo)
    local is_worktree
    is_worktree=$(git -C "$workdir" rev-parse --is-inside-work-tree 2>/dev/null || echo "false")

    if [ "$is_worktree" = "true" ]; then
      # We're in a worktree - get the branch
      branch=$(git -C "$workdir" branch --show-current 2>/dev/null || echo "unknown")
      echo "worktree:$branch"
    else
      echo "unknown"
    fi
  fi
}

CONTEXT=$(detect_worktree_context "$CWD")
IS_MAIN_REPO=false
CURRENT_BRANCH="unknown"

if [[ "$CONTEXT" == main:* ]]; then
  IS_MAIN_REPO=true
  CURRENT_BRANCH="${CONTEXT#main:}"
elif [[ "$CONTEXT" == worktree:* ]]; then
  IS_MAIN_REPO=false
  CURRENT_BRANCH="${CONTEXT#worktree:}"
fi

echo "[git-workflow-gate] DEBUG: Context: $CONTEXT, IsMain: $IS_MAIN_REPO, Branch: $CURRENT_BRANCH"
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
  block_message="[WORKFLOW] BLOCKED: --no-verify is not allowed.

Git hooks exist to protect code quality. Bypassing them defeats the purpose.
Fix the underlying issue that's causing the hook to fail."
fi

if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP 'gh\s+pr\s+merge\s+.*--admin'; then
  should_block=true
  block_message="[WORKFLOW] BLOCKED: --admin bypass of branch protection is not allowed.

Branch protection rules exist for a reason. Wait for checks to pass."
fi

# --- 1. Block commits on main/master (only if in main repo, not worktrees) ---
if echo "$COMMAND" | grep -qP '(^|\s|&&|\|)git\s+commit(\s|$)'; then
  # Only block if we're in the main repo on main/master
  if [ "$IS_MAIN_REPO" = true ] && ([ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]); then
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

# --- 2. Block push to main/master (only in main repo, not worktrees) ---
if [ "$should_block" = false ] && echo "$COMMAND" | grep -qP '(^|\s|&&|\|)git\s+push(\s|$)'; then
  # Always allow dry-run
  if echo "$COMMAND" | grep -qP '\s--dry-run\b'; then
    : # allowed
  # Block: explicit push to main/master (only if in main repo)
  elif echo "$COMMAND" | grep -qP 'git\s+push\s+\S+\s+(main|master)\b'; then
    if [ "$IS_MAIN_REPO" = true ]; then
      should_block=true
      block_message="[RELEASE GATE] BLOCKED: Direct push to main/master is not allowed.

Use the release skill to push to main:
  /pike-lsp-release

Or push your feature branch and create a PR:
  git push -u origin $CURRENT_BRANCH
  gh pr create"
    fi
  # Block: bare git push when on main/master (only in main repo)
  elif echo "$COMMAND" | grep -qP 'git\s+push\s*($|&&|\||;|--tags)'; then
    if [ "$IS_MAIN_REPO" = true ] && ([ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]); then
      should_block=true
      block_message="[RELEASE GATE] BLOCKED: Direct push to $CURRENT_BRANCH is not allowed.

Use the release skill:
  /pike-lsp-release"
    fi
  # Block: git push --tags (pushes release tags) - always block this
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
    if ! echo "$BRANCH_NAME" | grep -qP '^(feat|fix|docs|refactor|test|chore|release|perf)/[a-z0-9][a-z0-9-]+$'; then
      should_block=true
      block_message="[WORKFLOW] BLOCKED: Branch name '$BRANCH_NAME' doesn't follow the naming convention.

Required format: type/description (kebab-case)

Valid prefixes:
  feat/     - New features          (feat/hover-support)
  fix/      - Bug fixes             (fix/tokenizer-crash)
  docs/     - Documentation         (docs/readme-update)
  refactor/ - Code refactoring      (refactor/symbol-resolver)
  test/     - Test additions       (test/bridge-coverage)
  chore/    - Maintenance tasks     (chore/bump-dependencies)
  release/  - Release prep         (release/v0.2.0)
  perf/     - Performance work      (perf/indexing)"
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
  echo ""
  echo "DEBUG: Command was: $COMMAND"
  echo "DEBUG: Context: $CONTEXT, IsMain: $IS_MAIN_REPO, Branch: $CURRENT_BRANCH"
  echo "DEBUG: Timestamp: $(date -Iseconds)"
  exit 2
fi

# Debug output for allowed commands
echo "[git-workflow-gate] ALLOWED: $COMMAND (branch: $CURRENT_BRANCH)"
exit 0
