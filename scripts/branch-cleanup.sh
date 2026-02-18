#!/bin/bash
set -euo pipefail
# branch-cleanup.sh — Delete all merged branches (local + remote) in one shot.
#
# Usage:
#   scripts/branch-cleanup.sh           # dry run (show what would be deleted)
#   scripts/branch-cleanup.sh --force   # actually delete
#
# Output (grep-friendly):
#   BRANCH:DELETE:LOCAL  | feat/old-thing | merged into main
#   BRANCH:DELETE:REMOTE | feat/old-thing | merged into main
#   BRANCH:KEEP         | feat/active-work | not merged
#   BRANCH:SKIP         | main | protected

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=true
[[ "${1:-}" == "--force" ]] && DRY_RUN=false

PROTECTED=("main" "master" "develop" "release")

is_protected() {
  local branch="$1"
  for p in "${PROTECTED[@]}"; do
    [[ "$branch" == "$p" ]] && return 0
  done
  return 1
}

echo "=== FETCH + PRUNE ==="
git fetch --prune --quiet
git checkout main --quiet
git pull --quiet

LOCAL_DELETED=0
REMOTE_DELETED=0
KEPT=0

echo ""
echo "=== LOCAL BRANCHES ==="
git branch --merged main | sed 's/^[* ]*//' | while read -r branch; do
  [[ -z "$branch" ]] && continue
  if is_protected "$branch"; then
    echo "BRANCH:SKIP | $branch | protected"
    continue
  fi
  if [[ "$DRY_RUN" == true ]]; then
    echo "BRANCH:WOULD_DELETE:LOCAL | $branch | merged into main"
  else
    git branch -d "$branch" 2>/dev/null && \
      echo "BRANCH:DELETE:LOCAL | $branch | merged into main" || \
      echo "BRANCH:ERROR:LOCAL | $branch | delete failed"
  fi
done

echo ""
echo "=== REMOTE BRANCHES ==="
git branch -r --merged main | sed 's|origin/||' | grep -v "HEAD" | while read -r branch; do
  [[ -z "$branch" ]] && continue
  if is_protected "$branch"; then
    echo "BRANCH:SKIP | $branch | protected"
    continue
  fi
  if [[ "$DRY_RUN" == true ]]; then
    echo "BRANCH:WOULD_DELETE:REMOTE | $branch | merged into main"
  else
    git push origin --delete "$branch" --no-verify 2>/dev/null && \
      echo "BRANCH:DELETE:REMOTE | $branch | merged into main" || \
      echo "BRANCH:ERROR:REMOTE | $branch | delete failed"
  fi
done

echo ""
echo "=== UNMERGED (keeping) ==="
git branch -r --no-merged main | sed 's|origin/||' | grep -v "HEAD" | while read -r branch; do
  [[ -z "$branch" ]] && continue
  echo "BRANCH:KEEP | $branch | not merged"
done

echo ""
if [[ "$DRY_RUN" == true ]]; then
  echo "DRY RUN — no branches deleted. Run with --force to delete."
else
  echo "CLEANUP:DONE"
fi
