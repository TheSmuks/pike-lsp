#!/usr/bin/env bash
# agent-state.sh - Shared state path resolution for agent scripts
#
# Provides functions to resolve agent runtime state paths using git metadata.
# Linked worktrees have .git as a file pointing to the common git directory,
# so we use git rev-parse for correct path resolution.
#
# Usage (source from other scripts):
#   source "$(dirname "$0")/lib/agent-state.sh"
#   local_shared_dir   # per-worktree state
#   shared_dir         # cross-worktree state
#   repo_root          # repo root (works in any worktree)

set -uo pipefail

# Resolve the repository root from any worktree
repo_root() {
  git -C "$(cd "$(dirname "${BASH_SOURCE[1]:-$0}")/.." && pwd)" rev-parse --show-toplevel
}

# Shared state directory — accessible from ALL worktrees
# Uses git common dir (the main .git directory shared across linked worktrees)
# Suitable for: locks, handoff files, watchdog baseline
shared_state_dir() {
  local common_dir
  common_dir=$(git -C "$(repo_root)" rev-parse --git-common-dir)
  echo "${common_dir}/pike-lsp"
}

# Per-worktree state directory — local to THIS worktree
# Uses git dir (points to common dir for main, worktree-specific for linked)
# Suitable for: current-issue marker, per-worktree test logs
local_state_dir() {
  local git_dir
  git_dir=$(git -C "$(repo_root)" rev-parse --git-dir)
  echo "${git_dir}/pike-lsp"
}

# Ensure shared state directory exists; print path
ensure_shared_dir() {
  local dir
  dir=$(shared_state_dir)
  mkdir -p "$dir"
  echo "$dir"
}

# Ensure local state directory exists; print path
ensure_local_dir() {
  local dir
  dir=$(local_state_dir)
  mkdir -p "$dir"
  echo "$dir"
}

# Resolve the main worktree path (the one that has the common .git)
main_worktree() {
  git -C "$(repo_root)" worktree list --porcelain | grep "^worktree " | head -1 | sed 's/^worktree //'
}
