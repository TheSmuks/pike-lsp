#!/usr/bin/env bash
# worktree.sh - Git worktree management for parallel agent development
#
# Creates sibling worktrees: ../pike-lsp-{sanitized-branch}
# Each worktree gets its own branch, node_modules, and build artifacts.
#
# Usage:
#   scripts/worktree.sh create feat/hover-support
#   scripts/worktree.sh create fix/tokenizer-crash --from main
#   scripts/worktree.sh list
#   scripts/worktree.sh remove feat/hover-support
#   scripts/worktree.sh cleanup          # remove worktrees for merged branches
#   scripts/worktree.sh cleanup --all    # remove ALL worktrees

set -euo pipefail

# Discover tools: check common locations if not already on PATH
for dir in "$HOME/.bun/bin" /usr/local/bin; do
  [ -d "$dir" ] && export PATH="$dir:$PATH"
done

REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
PARENT_DIR=$(dirname "$REPO_ROOT")
MAX_WORKTREES=5

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

sanitize_branch() {
  echo "$1" | sed 's|/|-|g'
}

worktree_path() {
  local branch="$1"
  local sanitized
  sanitized=$(sanitize_branch "$branch")
  echo "${PARENT_DIR}/${REPO_NAME}-${sanitized}"
}

count_worktrees() {
  git -C "$REPO_ROOT" worktree list --porcelain | grep -c "^worktree " || echo 0
}

cmd_create() {
  local branch="${1:-}"
  local base_branch="main"

  if [ -z "$branch" ]; then
    echo -e "${RED}Error: Branch name required${NC}"
    echo "Usage: $0 create <branch-name> [--from <base-branch>]"
    exit 1
  fi

  # Parse --from flag
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --from) base_branch="$2"; shift 2 ;;
      *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
  done

  # Validate branch naming convention
  if ! echo "$branch" | grep -qP '^(feat|fix|docs|refactor|test|chore|release)/[a-z0-9][a-z0-9-]+$'; then
    echo -e "${RED}Error: Branch name '$branch' doesn't follow convention${NC}"
    echo "Required: type/description (e.g., feat/hover-support, fix/tokenizer-crash)"
    exit 1
  fi

  # Check worktree limit (subtract 1 for main worktree)
  local current
  current=$(count_worktrees)
  if [ "$current" -gt "$MAX_WORKTREES" ]; then
    echo -e "${RED}Error: Maximum $MAX_WORKTREES worktrees reached (current: $((current - 1)))${NC}"
    echo "Run '$0 cleanup' to remove merged worktrees"
    exit 1
  fi

  local wt_path
  wt_path=$(worktree_path "$branch")

  if [ -d "$wt_path" ]; then
    echo -e "${YELLOW}Worktree already exists: $wt_path${NC}"
    echo -e "Branch: $branch"
    exit 0
  fi

  echo -e "${BLUE}Creating worktree...${NC}"
  echo "  Branch: $branch"
  echo "  Base:   $base_branch"
  echo "  Path:   $wt_path"

  # Create worktree with new branch from base
  git -C "$REPO_ROOT" worktree add -b "$branch" "$wt_path" "$base_branch"

  # Install dependencies in the new worktree
  echo -e "${BLUE}Installing dependencies...${NC}"
  (cd "$wt_path" && bun install --frozen-lockfile 2>/dev/null || bun install)

  echo ""
  echo -e "${GREEN}Worktree ready!${NC}"
  echo "  Path:   $wt_path"
  echo "  Branch: $branch"
  echo ""
  echo "Agent instructions:"
  echo "  cd $wt_path"
  echo "  # work, commit, push"
  echo "  git push -u origin $branch"
  echo "  gh pr create --base main"
}

cmd_list() {
  echo -e "${BLUE}Active worktrees:${NC}"
  echo ""

  git -C "$REPO_ROOT" worktree list | while read -r path commit branch_info; do
    local branch
    branch=$(echo "$branch_info" | tr -d '[]')
    local marker=""
    if [ "$path" = "$REPO_ROOT" ]; then
      marker=" (main repo)"
    fi
    printf "  %-50s %s %s%s\n" "$path" "$commit" "$branch" "$marker"
  done

  echo ""
  local count
  count=$(count_worktrees)
  echo "Total: $((count - 1)) worktrees (+ main repo) | Max: $MAX_WORKTREES"
}

cmd_remove() {
  local branch="${1:-}"

  if [ -z "$branch" ]; then
    echo -e "${RED}Error: Branch name required${NC}"
    echo "Usage: $0 remove <branch-name>"
    exit 1
  fi

  local wt_path
  wt_path=$(worktree_path "$branch")

  if [ ! -d "$wt_path" ]; then
    echo -e "${YELLOW}Worktree not found: $wt_path${NC}"
    exit 1
  fi

  # Check for uncommitted changes
  if [ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
    echo -e "${RED}Warning: Worktree has uncommitted changes!${NC}"
    echo "Path: $wt_path"
    git -C "$wt_path" status --short
    echo ""
    echo "Use --force to remove anyway (not implemented - clean up manually)"
    exit 1
  fi

  echo -e "${BLUE}Removing worktree: $wt_path${NC}"
  git -C "$REPO_ROOT" worktree remove "$wt_path"

  # Optionally delete the branch if it's been merged
  if git -C "$REPO_ROOT" branch --merged main | grep -q "$branch"; then
    echo -e "${BLUE}Branch '$branch' is merged, deleting...${NC}"
    git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null || true
  else
    echo -e "${YELLOW}Branch '$branch' is NOT merged - keeping it${NC}"
  fi

  echo -e "${GREEN}Done${NC}"
}

cmd_cleanup() {
  local remove_all=false
  if [ "${1:-}" = "--all" ]; then
    remove_all=true
  fi

  echo -e "${BLUE}Scanning worktrees...${NC}"

  local removed=0
  git -C "$REPO_ROOT" worktree list --porcelain | grep "^worktree " | sed 's/^worktree //' | while read -r wt_path; do
    # Skip main repo
    if [ "$wt_path" = "$REPO_ROOT" ]; then
      continue
    fi

    local branch
    branch=$(git -C "$wt_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")

    local is_merged=false
    if git -C "$REPO_ROOT" branch --merged main 2>/dev/null | grep -q "$branch"; then
      is_merged=true
    fi

    if [ "$remove_all" = true ] || [ "$is_merged" = true ]; then
      # Check for uncommitted changes
      if [ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
        echo -e "  ${YELLOW}SKIP${NC} $wt_path (uncommitted changes)"
        continue
      fi

      local reason="merged"
      if [ "$remove_all" = true ] && [ "$is_merged" = false ]; then
        reason="force-all"
      fi

      echo -e "  ${RED}REMOVE${NC} $wt_path ($branch) [$reason]"
      git -C "$REPO_ROOT" worktree remove "$wt_path" 2>/dev/null || true

      if [ "$is_merged" = true ]; then
        git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null || true
      fi

      removed=$((removed + 1))
    else
      echo -e "  ${GREEN}KEEP${NC} $wt_path ($branch) [not merged]"
    fi
  done

  # Prune stale worktree references
  git -C "$REPO_ROOT" worktree prune

  echo ""
  echo -e "${GREEN}Cleanup complete${NC}"
}

cmd_status() {
  echo -e "${BLUE}Worktree status:${NC}"
  echo ""

  git -C "$REPO_ROOT" worktree list --porcelain | grep "^worktree " | sed 's/^worktree //' | while read -r wt_path; do
    if [ "$wt_path" = "$REPO_ROOT" ]; then
      continue
    fi

    local branch
    branch=$(git -C "$wt_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")

    local changes
    changes=$(git -C "$wt_path" status --porcelain 2>/dev/null | wc -l)

    local ahead_behind
    ahead_behind=$(git -C "$wt_path" rev-list --left-right --count "main...$branch" 2>/dev/null || echo "? ?")
    local ahead behind
    ahead=$(echo "$ahead_behind" | awk '{print $2}')
    behind=$(echo "$ahead_behind" | awk '{print $1}')

    local has_remote="no"
    if git -C "$wt_path" config "branch.$branch.remote" > /dev/null 2>&1; then
      has_remote="yes"
    fi

    echo "  $branch"
    echo "    Path:     $wt_path"
    echo "    Changes:  $changes uncommitted"
    echo "    Ahead:    $ahead commits ahead of main"
    echo "    Behind:   $behind commits behind main"
    echo "    Pushed:   $has_remote"
    echo ""
  done
}

# Main dispatch
case "${1:-help}" in
  create)  shift; cmd_create "$@" ;;
  list)    cmd_list ;;
  status)  cmd_status ;;
  remove)  shift; cmd_remove "$@" ;;
  cleanup) shift; cmd_cleanup "$@" ;;
  help|*)
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  create <branch> [--from <base>]  Create worktree with branch"
    echo "  list                              List all worktrees"
    echo "  status                            Detailed worktree status"
    echo "  remove <branch>                   Remove a worktree"
    echo "  cleanup [--all]                   Remove merged (or all) worktrees"
    echo ""
    echo "Examples:"
    echo "  $0 create feat/hover-support"
    echo "  $0 create fix/crash --from main"
    echo "  $0 list"
    echo "  $0 remove feat/hover-support"
    echo "  $0 cleanup"
    ;;
esac
