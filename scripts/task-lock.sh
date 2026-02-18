#!/usr/bin/env bash
# task-lock.sh - File-based task locking for parallel agents
#
# Inspired by Carlini's C compiler agent teams:
# Agents claim tasks by creating lock files. Other agents skip claimed tasks.
# Lock files are stored in a shared location accessible from all worktrees.
#
# Usage:
#   scripts/task-lock.sh lock "fix-hover-crash" "Agent fixing hover null crash"
#   scripts/task-lock.sh unlock "fix-hover-crash"
#   scripts/task-lock.sh list
#   scripts/task-lock.sh check "fix-hover-crash"
#   scripts/task-lock.sh cleanup              # Remove stale locks (>2h old)

set -uo pipefail

# Lock files stored in main repo's .omc/locks/ (shared across worktrees)
REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)

# Find the main worktree (not a linked worktree)
MAIN_WORKTREE=$(git -C "$REPO_ROOT" worktree list --porcelain | head -1 | sed 's/^worktree //')
LOCK_DIR="$MAIN_WORKTREE/.omc/locks"
mkdir -p "$LOCK_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

sanitize_name() {
  echo "$1" | sed 's/[^a-zA-Z0-9_-]/-/g'
}

cmd_lock() {
  local task_name="${1:-}"
  local description="${2:-No description}"

  if [ -z "$task_name" ]; then
    echo -e "${RED}Error: Task name required${NC}"
    echo "Usage: $0 lock <task-name> [description]"
    exit 1
  fi

  local safe_name
  safe_name=$(sanitize_name "$task_name")
  local lock_file="$LOCK_DIR/${safe_name}.lock"

  if [ -f "$lock_file" ]; then
    echo -e "${YELLOW}Task already locked: $task_name${NC}"
    echo "Locked by: $(cat "$lock_file")"
    exit 1
  fi

  local branch
  branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  local worktree_path
  worktree_path=$(pwd)

  cat > "$lock_file" <<EOF
task: $task_name
description: $description
branch: $branch
worktree: $worktree_path
locked_at: $(date -Iseconds)
pid: $$
EOF

  echo -e "${GREEN}Locked: $task_name${NC}"
  echo "  Description: $description"
  echo "  Lock file:   $lock_file"
}

cmd_unlock() {
  local task_name="${1:-}"

  if [ -z "$task_name" ]; then
    echo -e "${RED}Error: Task name required${NC}"
    exit 1
  fi

  local safe_name
  safe_name=$(sanitize_name "$task_name")
  local lock_file="$LOCK_DIR/${safe_name}.lock"

  if [ ! -f "$lock_file" ]; then
    echo -e "${YELLOW}Task not locked: $task_name${NC}"
    exit 0
  fi

  rm "$lock_file"
  echo -e "${GREEN}Unlocked: $task_name${NC}"
}

cmd_check() {
  local task_name="${1:-}"

  if [ -z "$task_name" ]; then
    echo -e "${RED}Error: Task name required${NC}"
    exit 1
  fi

  local safe_name
  safe_name=$(sanitize_name "$task_name")
  local lock_file="$LOCK_DIR/${safe_name}.lock"

  if [ -f "$lock_file" ]; then
    echo "LOCKED"
    cat "$lock_file"
    exit 1
  else
    echo "AVAILABLE"
    exit 0
  fi
}

cmd_list() {
  local count=0

  echo -e "${BLUE}Active task locks:${NC}"
  echo ""

  for lock_file in "$LOCK_DIR"/*.lock; do
    [ -f "$lock_file" ] || continue
    count=$((count + 1))

    local task desc branch locked_at
    task=$(grep "^task:" "$lock_file" | sed 's/^task: //')
    desc=$(grep "^description:" "$lock_file" | sed 's/^description: //')
    branch=$(grep "^branch:" "$lock_file" | sed 's/^branch: //')
    locked_at=$(grep "^locked_at:" "$lock_file" | sed 's/^locked_at: //')

    echo "  $task"
    echo "    Description: $desc"
    echo "    Branch:      $branch"
    echo "    Since:       $locked_at"
    echo ""
  done

  if [ $count -eq 0 ]; then
    echo "  (no active locks)"
  fi

  echo "Total: $count active locks"
}

cmd_cleanup() {
  local max_age_seconds=${1:-7200}  # 2 hours default
  local now
  now=$(date +%s)
  local removed=0

  echo -e "${BLUE}Cleaning stale locks (>${max_age_seconds}s old)...${NC}"

  for lock_file in "$LOCK_DIR"/*.lock; do
    [ -f "$lock_file" ] || continue

    local locked_at
    locked_at=$(grep "^locked_at:" "$lock_file" | sed 's/^locked_at: //')
    local lock_epoch
    lock_epoch=$(date -d "$locked_at" +%s 2>/dev/null || echo 0)

    local age=$((now - lock_epoch))
    if [ $age -gt "$max_age_seconds" ]; then
      local task
      task=$(grep "^task:" "$lock_file" | sed 's/^task: //')
      echo -e "  ${RED}STALE${NC} $task (${age}s old) - removing"
      rm "$lock_file"
      removed=$((removed + 1))
    fi
  done

  echo "Removed $removed stale locks"
}

case "${1:-help}" in
  lock)    shift; cmd_lock "$@" ;;
  unlock)  shift; cmd_unlock "$@" ;;
  check)   shift; cmd_check "$@" ;;
  list)    cmd_list ;;
  cleanup) shift; cmd_cleanup "$@" ;;
  help|*)
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  lock <name> [desc]   Claim a task (prevents other agents from working on it)"
    echo "  unlock <name>        Release a task lock"
    echo "  check <name>         Check if a task is locked (exit 0=available, 1=locked)"
    echo "  list                 Show all active locks"
    echo "  cleanup [max-age-s]  Remove stale locks (default: >2h old)"
    echo ""
    echo "Lock files: $LOCK_DIR/"
    echo ""
    echo "Example workflow:"
    echo "  $0 lock fix-hover-crash 'Fixing null pointer in hover handler'"
    echo "  # ... do the work ..."
    echo "  $0 unlock fix-hover-crash"
    ;;
esac
