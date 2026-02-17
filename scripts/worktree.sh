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
#   scripts/worktree.sh prune            # auto-remove merged worktrees

set -euo pipefail

# Discover tools: check common locations if not already on PATH
for dir in "$HOME/.bun/bin" /usr/local/bin; do
  [ -d "$dir" ] && export PATH="$dir:$PATH"
done

REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
PARENT_DIR=$(dirname "$REPO_ROOT")
MAX_WORKTREES=10
INACTIVITY_DAYS=30

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

is_branch_merged() {
  local branch="$1"
  git -C "$REPO_ROOT" branch --merged main 2>/dev/null | grep -q "$branch"
}

# Check if a worktree is "abandoned" - merged branch with uncommitted changes for >7 days
is_worktree_abandoned() {
  local wt_path="$1"
  local branch="$2"

  # Must be merged
  if ! is_branch_merged "$branch"; then
    return 1
  fi

  # Must have uncommitted changes
  if [ -z "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
    return 1
  fi

  # Check last commit date on this branch
  local last_commit_timestamp
  last_commit_timestamp=$(git -C "$wt_path" log -1 --format=%ct 2>/dev/null || echo "0")
  if [ "$last_commit_timestamp" = "0" ]; then
    return 1
  fi

  local now
  now=$(date +%s)
  local days_since_commit=$(( (now - last_commit_timestamp) / 86400 ))

  # Abandoned if no commit for >7 days
  [ "$days_since_commit" -gt 7 ]
}

# Check if a worktree is inactive based on last commit
is_worktree_inactive() {
  local wt_path="$1"

  # Check last commit date on this branch
  local last_commit_timestamp
  last_commit_timestamp=$(git -C "$wt_path" log -1 --format=%ct 2>/dev/null || echo "0")
  if [ "$last_commit_timestamp" = "0" ]; then
    # No commits yet - check when the worktree was created
    if [ -d "$wt_path/.git" ]; then
      local created_timestamp
      created_timestamp=$(stat -c %Y "$wt_path" 2>/dev/null || echo "0")
      if [ "$created_timestamp" = "0" ]; then
        return 1
      fi
      local now
      now=$(date +%s)
      local days_since_created=$(( (now - created_timestamp) / 86400 ))
      [ "$days_since_created" -gt "$INACTIVITY_DAYS" ]
      return
    fi
    return 1
  fi

  local now
  now=$(date +%s)
  local days_since_commit=$(( (now - last_commit_timestamp) / 86400 ))

  [ "$days_since_commit" -gt "$INACTIVITY_DAYS" ]
}

# Remove inactive worktrees automatically
cleanup_inactive() {
  local force=false
  if [ "${1:-}" = "--force" ]; then
    force=true
  fi

  echo -e "${BLUE}Checking for inactive worktrees (>${INACTIVITY_DAYS} days)...${NC}"

  local removed=0
  git -C "$REPO_ROOT" worktree list --porcelain | grep "^worktree " | sed 's/^worktree //' | while read -r wt_path; do
    # Skip main repo
    if [ "$wt_path" = "$REPO_ROOT" ]; then
      continue
    fi

    if ! is_worktree_inactive "$wt_path"; then
      continue
    fi

    local branch
    branch=$(git -C "$wt_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")

    # Check for uncommitted changes
    if [ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
      if [ "$force" = true ]; then
        echo -e "  ${YELLOW}FORCE REMOVE${NC} $wt_path ($branch) [inactive + changes]"
        git -C "$REPO_ROOT" worktree remove --force "$wt_path" 2>/dev/null || true
        removed=$((removed + 1))
      else
        echo -e "  ${YELLOW}SKIP${NC} $wt_path ($branch) [inactive but has uncommitted changes, use --force]"
      fi
      continue
    fi

    echo -e "  ${BLUE}REMOVE${NC} $wt_path ($branch) [inactive ${INACTIVITY_DAYS}+ days]"
    git -C "$REPO_ROOT" worktree remove "$wt_path" 2>/dev/null || true

    # Delete branch if it exists and is fully merged
    if git -C "$REPO_ROOT" branch --merged main 2>/dev/null | grep -q "$branch"; then
      git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null || true
    fi

    removed=$((removed + 1))
  done

  if [ "$removed" -gt 0 ]; then
    echo -e "${GREEN}Removed $removed inactive worktree(s)${NC}"
  else
    echo -e "${GREEN}No inactive worktrees to remove${NC}"
  fi
}

cmd_prune() {
  echo -e "${BLUE}Pruning merged worktrees...${NC}"

  local removed=0
  git -C "$REPO_ROOT" worktree list --porcelain | grep "^worktree " | sed 's/^worktree //' | while read -r wt_path; do
    # Skip main repo
    if [ "$wt_path" = "$REPO_ROOT" ]; then
      continue
    fi

    local branch
    branch=$(git -C "$wt_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")

    if is_branch_merged "$branch"; then
      # Check for uncommitted changes
      if [ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
        # Check if abandoned (merged + uncommitted changes for >7 days)
        if is_worktree_abandoned "$wt_path" "$branch"; then
          echo -e "  ${RED}FORCE-PRUNE${NC} $wt_path ($branch) [abandoned - merged with stale changes]"
          git -C "$REPO_ROOT" worktree remove "$wt_path" --force 2>/dev/null || true
          git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null || true
          removed=$((removed + 1))
        else
          echo -e "  ${YELLOW}SKIP${NC} $wt_path (uncommitted changes - not abandoned)"
        fi
        continue
      fi

      echo -e "  ${BLUE}PRUNE${NC} $wt_path ($branch) [merged]"
      git -C "$REPO_ROOT" worktree remove "$wt_path" 2>/dev/null || true

      # Delete merged branch
      git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null || true

      # Delete remote branch if it exists
      if git -C "$REPO_ROOT" ls-remote --heads origin "$branch" 2>/dev/null | grep -q "$branch"; then
        git -C "$REPO_ROOT" push origin --delete "$branch" --no-verify 2>/dev/null || true
      fi

      removed=$((removed + 1))
    fi
  done

  # Prune stale worktree references
  git -C "$REPO_ROOT" worktree prune

  if [ "$removed" -gt 0 ]; then
    echo -e "${GREEN}Pruned $removed merged worktree(s)${NC}"
  else
    echo -e "${GREEN}No merged worktrees to prune${NC}"
  fi
}

cmd_create() {
  local branch="${1:-}"
  local base_branch="main"
  local issue_num=""

  if [ -z "$branch" ]; then
    echo -e "${RED}Error: Branch name required${NC}"
    echo "Usage: $0 create <branch-name> [--from <base-branch>] [--issue <number>]"
    echo "       $0 create #<issue-number>   # Quick create from issue"
    exit 1
  fi

  # Handle quick issue lookup: #42 -> find issue, suggest branch
  if [[ "$branch" =~ ^#([0-9]+)$ ]]; then
    issue_num="${BASH_REMATCH[1]}"
    echo -e "${BLUE}Looking up issue #$issue_num...${NC}"

    # Search for existing worktree with this issue
    local found_branch=""
    local found_path=""
    for wt in $(git -C "$REPO_ROOT" worktree list --porcelain | grep "^worktree " | sed 's/^worktree //'); do
      if [ "$wt" = "$REPO_ROOT" ]; then
        continue
      fi
      local b
      b=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || continue)
      # Check if branch name contains the issue number
      if [[ "$b" =~ (#|_-)${issue_num}($|_) ]] || [[ "$b" =~ ^feat-${issue_num} ]] || [[ "$b" =~ ^fix-${issue_num} ]]; then
        found_branch="$b"
        found_path="$wt"
        break
      fi
    done

    if [ -n "$found_branch" ]; then
      echo -e "${YELLOW}Worktree already exists for issue #$issue_num${NC}"
      echo "  Branch: $found_branch"
      echo "  Path:   $found_path"
      echo ""
      echo "To work on it:"
      echo "  cd $found_path"
      exit 0
    fi

    # Try to get issue title from gh
    local issue_title
    issue_title=$(gh issue view "$issue_num" --json title --jq '.title' 2>/dev/null || echo "")
    if [ -n "$issue_title" ]; then
      echo "Issue #$issue_num: $issue_title"
      # Convert title to branch-friendly format
      local slug
      slug=$(echo "$issue_title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 ]//g' | tr ' ' '-' | cut -c1-50)
      echo ""
      echo "Suggested branch: fix/$issue_num-$slug"
      echo ""
      read -p "Create this branch? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
      fi
      branch="fix/$issue_num-$slug"
    else
      echo -e "${RED}Could not fetch issue #$issue_num${NC}"
      echo "Make sure you're authenticated with GitHub CLI"
      exit 1
    fi
  fi

  # Parse flags
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --from) base_branch="$2"; shift 2 ;;
      --issue) issue_num="$2"; shift 2 ;;
      *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
  done

  # Append issue number to branch if provided
  if [ -n "$issue_num" ] && [[ ! "$branch" =~ \#${issue_num} ]]; then
    branch="${branch}-#${issue_num}"
  fi

  # Check if worktree already exists (by branch name or issue number)
  local existing_wt_path
  existing_wt_path=$(worktree_path "$branch")
  if [ -d "$existing_wt_path" ]; then
    echo -e "${YELLOW}Worktree already exists: $existing_wt_path${NC}"
    echo -e "Branch: $branch"
    echo "Use 'worktree.sh list' to see all worktrees"
    exit 0
  fi

  # Also check if any worktree has this issue number
  if [ -n "$issue_num" ]; then
    for wt in $(git -C "$REPO_ROOT" worktree list --porcelain | grep "^worktree " | sed 's/^worktree //'); do
      if [ "$wt" = "$REPO_ROOT" ]; then
        continue
      fi
      local b
      b=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || continue)
      if [[ "$b" =~ \#${issue_num} ]]; then
        echo -e "${YELLOW}Worktree already exists for issue #$issue_num${NC}"
        echo "  Branch: $b"
        echo "  Path:   $wt"
        exit 0
      fi
    done
  fi

  # Acquire lock to prevent race conditions between parallel agents
  LOCK_FILE="/tmp/pike-lsp-worktree.lock"
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo -e "${RED}Error: Another worktree creation in progress. Retry shortly.${NC}"
    exit 1
  fi
  # Lock auto-releases when this subshell/process exits (fd 9 closes)

  # Auto-cleanup merged worktrees before checking limit
  cmd_prune

  # Validate branch naming convention
  if ! echo "$branch" | grep -qP '^(feat|fix|docs|refactor|test|chore|release|perf)/[a-z0-9][a-z0-9-]+$'; then
    echo -e "${RED}Error: Branch name '$branch' doesn't follow convention${NC}"
    echo "Allowed prefixes: feat, fix, docs, refactor, test, chore, release, perf"
    echo "Required format: type/description (e.g., feat/hover-support, perf/indexing)"
    exit 1
  fi

  # Check worktree limit (subtract 1 for main worktree)
  local current
  current=$(count_worktrees)
  if [ "$current" -gt "$MAX_WORKTREES" ]; then
    echo -e "${YELLOW}Worktree limit reached ($MAX_WORKTREES), attempting to clean inactive worktrees...${NC}"
    cleanup_inactive

    # Re-check after cleanup
    current=$(count_worktrees)
    if [ "$current" -gt "$MAX_WORKTREES" ]; then
      echo -e "${RED}Error: Maximum $MAX_WORKTREES worktrees reached (current: $((current - 1)))${NC}"
      echo "Run '$0 prune' or '$0 cleanup' to remove merged worktrees manually"
      echo "Run '$0 inactive' to see inactive worktrees"
      exit 1
    fi
    echo -e "${GREEN}Space available after cleanup, proceeding...${NC}"
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
    local status_marker=""

    if [ "$path" = "$REPO_ROOT" ]; then
      marker=" (main repo)"
    else
      # Check if branch is merged for non-main worktrees
      if is_branch_merged "$branch"; then
        status_marker="${YELLOW}[merged]${NC} "
      fi
    fi

    printf "  %-50s %s %s%s%s%s\n" "$path" "$commit" "$status_marker" "$branch" "$marker"
  done

  echo ""
  local count
  count=$(count_worktrees)
  echo "Total: $((count - 1)) worktrees (+ main repo) | Max: $MAX_WORKTREES"
}

cmd_remove() {
  local branch=""
  local force=false

  # Parse arguments
  while [ $# -gt 0 ]; do
    case "$1" in
      --force) force=true; shift ;;
      -*) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
      *) branch="$1"; shift ;;
    esac
  done

  if [ -z "$branch" ]; then
    echo -e "${RED}Error: Branch name required${NC}"
    echo "Usage: $0 remove <branch-name> [--force]"
    exit 1
  fi

  local wt_path
  wt_path=$(worktree_path "$branch")

  if [ ! -d "$wt_path" ]; then
    echo -e "${YELLOW}Worktree not found: $wt_path${NC}"
    exit 1
  fi

  # Check for uncommitted changes (skip if --force)
  if [ "$force" = false ] && [ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
    echo -e "${RED}Warning: Worktree has uncommitted changes!${NC}"
    echo "Path: $wt_path"
    git -C "$wt_path" status --short
    echo ""
    echo "Use --force to remove anyway"
    exit 1
  fi

  if [ "$force" = true ] && [ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
    echo -e "${YELLOW}Warning: Force-removing worktree with uncommitted changes${NC}"
  fi

  echo -e "${BLUE}Removing worktree: $wt_path${NC}"
  if [ "$force" = true ]; then
    git -C "$REPO_ROOT" worktree remove --force "$wt_path"
  else
    git -C "$REPO_ROOT" worktree remove "$wt_path"
  fi

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
        # Check if abandoned (merged + uncommitted changes for >7 days)
        if [ "$remove_all" = true ] || is_worktree_abandoned "$wt_path" "$branch"; then
          echo -e "  ${RED}FORCE-REMOVE${NC} $wt_path ($branch) [abandoned]"
          git -C "$REPO_ROOT" worktree remove "$wt_path" --force 2>/dev/null || true
        else
          echo -e "  ${YELLOW}SKIP${NC} $wt_path (uncommitted changes - not abandoned)"
          continue
        fi
      else
        local reason="merged"
        if [ "$remove_all" = true ] && [ "$is_merged" = false ]; then
          reason="force-all"
        fi

        echo -e "  ${RED}REMOVE${NC} $wt_path ($branch) [$reason]"
        git -C "$REPO_ROOT" worktree remove "$wt_path" 2>/dev/null || true
      fi

      if [ "$is_merged" = true ]; then
        git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null || true
        # Also delete the remote branch if it exists
        if git -C "$REPO_ROOT" ls-remote --heads origin "$branch" 2>/dev/null | grep -q "$branch"; then
          echo -e "    ${RED}DELETE REMOTE${NC} origin/$branch"
          git -C "$REPO_ROOT" push origin --delete "$branch" --no-verify 2>/dev/null || true
        fi
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
  prune)     cmd_prune ;;
  inactive)  shift; cleanup_inactive "$@" ;;
  help|*)
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  create <branch> [--from <base>]   Create worktree with branch"
    echo "  list                               List all worktrees"
    echo "  status                             Detailed worktree status"
    echo "  remove <branch> [--force]          Remove a worktree"
    echo "  cleanup [--all]                    Remove merged (or all) worktrees"
    echo "  prune                              Remove merged worktrees automatically"
    echo "  inactive [--force]                 Remove inactive worktrees (>${INACTIVITY_DAYS} days)"
    echo ""
    echo "Examples:"
    echo "  $0 create feat/hover-support"
    echo "  $0 create fix/crash --from main"
    echo "  $0 list"
    echo "  $0 remove feat/hover-support"
    echo "  $0 cleanup"
    echo "  $0 prune"
    echo "  $0 inactive"
    ;;
esac
