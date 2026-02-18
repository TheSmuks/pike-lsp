#!/usr/bin/env bash
# repo-hygiene.sh - Check repository for clutter and files that shouldn't be tracked
#
# Detects:
#   1. Planning/dev directories that should be gitignored
#   2. Dev artifact markdown (audit files, specs, migration docs)
#   3. Scattered agent context files (CLAUDE.md in unexpected places)
#   4. Large tracked files (>500KB)
#   5. Empty tracked files
#   6. Untracked files outside .gitignore
#
# Usage:
#   scripts/repo-hygiene.sh           # Check and report
#   scripts/repo-hygiene.sh --fix     # Report + add to .gitignore + untrack
#   scripts/repo-hygiene.sh --strict  # Exit 1 if any issues found (for CI/hooks)

set -uo pipefail

REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

MODE="check"
if [ "${1:-}" = "--fix" ]; then
  MODE="fix"
elif [ "${1:-}" = "--strict" ]; then
  MODE="strict"
fi

ISSUES=0
WARNINGS=0

issue() {
  echo -e "  ${RED}ISSUE${NC}  $1"
  ISSUES=$((ISSUES + 1))
}

warn() {
  echo -e "  ${YELLOW}WARN${NC}   $1"
  WARNINGS=$((WARNINGS + 1))
}

ok() {
  echo -e "  ${GREEN}OK${NC}     $1"
}

# Collect files to potentially gitignore
GITIGNORE_ADDITIONS=()

# ============================================================
echo -e "${BLUE}[1/6] Planning & dev directories${NC}"
# ============================================================
# Directories that are dev-only and shouldn't be in the release

CLUTTER_DIRS=(".planning" ".agent")
for dir in "${CLUTTER_DIRS[@]}"; do
  count=$(git ls-files "$dir/" 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    issue "$dir/ has $count tracked files (dev-only, should be gitignored)"
    GITIGNORE_ADDITIONS+=("$dir/")
  else
    ok "$dir/ clean"
  fi
done

# OMC state/logs (should never be tracked, data files are fine)
for subdir in "state" "logs"; do
  count=$(git ls-files ".omc/$subdir/" 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    issue ".omc/$subdir/ has $count tracked state files"
    GITIGNORE_ADDITIONS+=(".omc/$subdir/")
  fi
done

echo ""

# ============================================================
echo -e "${BLUE}[2/6] Dev artifact markdown in root${NC}"
# ============================================================
# Files that look like development artifacts, not user-facing docs

DEV_PATTERNS=(
  '*_AUDIT.md'
  '*_SPEC.md'
  '*_SUMMARY.md'
  '*_MIGRATION.md'
  'IMPLEMENTATION_COMPLETE.md'
  'IMPLEMENTATION_*.md'
  'IMPORT_*.md'
  'MODULE_*.md'
  'DEBUG_*.md'
  'INVESTIGATION_*.md'
  'ANALYSIS_*.md'
)

declare -A seen_artifacts
dev_artifacts=()
for pattern in "${DEV_PATTERNS[@]}"; do
  while IFS= read -r f; do
    if [ -z "${seen_artifacts[$f]:-}" ]; then
      dev_artifacts+=("$f")
      seen_artifacts[$f]=1
    fi
  done < <(git ls-files "$pattern" 2>/dev/null)
done

# Also check pike-scripts/ and test/ for non-CLAUDE dev markdown
while IFS= read -r f; do
  case "$(basename "$f")" in
    CLAUDE.md|README.md|CHANGELOG.md) ;; # Expected
    *)
      if [ -z "${seen_artifacts[$f]:-}" ]; then
        dev_artifacts+=("$f")
        seen_artifacts[$f]=1
      fi
      ;;
  esac
done < <(git ls-files 'pike-scripts/*.md' 'test/**/*.md' 2>/dev/null | grep -v CLAUDE.md)

if [ ${#dev_artifacts[@]} -gt 0 ]; then
  for f in "${dev_artifacts[@]}"; do
    issue "Dev artifact tracked: $f"
    GITIGNORE_ADDITIONS+=("$f")
  done
else
  ok "No dev artifact markdown found"
fi

echo ""

# ============================================================
echo -e "${BLUE}[3/6] Scattered CLAUDE.md files${NC}"
# ============================================================
# CLAUDE.md files are agent context - only expected in .claude/ and .github/
# Others are likely auto-generated and shouldn't be tracked

EXPECTED_CLAUDE_LOCATIONS=(
  ".claude/CLAUDE.md"
  ".github/CLAUDE.md"
)

while IFS= read -r f; do
  is_expected=false
  for expected in "${EXPECTED_CLAUDE_LOCATIONS[@]}"; do
    if [ "$f" = "$expected" ]; then
      is_expected=true
      break
    fi
  done

  # Also allow .claude/ subdirectories
  if [[ "$f" == .claude/* ]]; then
    is_expected=true
  fi

  if [ "$is_expected" = false ]; then
    warn "CLAUDE.md in unexpected location: $f"
    GITIGNORE_ADDITIONS+=("$f")
  fi
done < <(git ls-files '**/CLAUDE.md' 'CLAUDE.md' '*/CLAUDE.md' 2>/dev/null)

echo ""

# ============================================================
echo -e "${BLUE}[4/6] Large tracked files (>500KB)${NC}"
# ============================================================

found_large=false
while IFS= read -r f; do
  if [ -f "$f" ]; then
    size=$(stat --format="%s" "$f" 2>/dev/null || stat -f "%z" "$f" 2>/dev/null || echo 0)
    if [ "$size" -gt 512000 ]; then
      size_kb=$((size / 1024))
      issue "Large file: $f (${size_kb}KB)"
      found_large=true
    fi
  fi
done < <(git ls-files)

if [ "$found_large" = false ]; then
  ok "No large tracked files"
fi

echo ""

# ============================================================
echo -e "${BLUE}[5/6] Empty tracked files${NC}"
# ============================================================

found_empty=false
while IFS= read -r f; do
  if [ -f "$f" ] && [ ! -s "$f" ]; then
    warn "Empty file tracked: $f"
    found_empty=true
  fi
done < <(git ls-files)

if [ "$found_empty" = false ]; then
  ok "No empty tracked files"
fi

echo ""

# ============================================================
echo -e "${BLUE}[6/6] Untracked files (not gitignored)${NC}"
# ============================================================

untracked=$(git ls-files --others --exclude-standard 2>/dev/null)
if [ -n "$untracked" ]; then
  while IFS= read -r f; do
    warn "Untracked: $f"
  done <<< "$untracked"
else
  ok "No untracked files outside .gitignore"
fi

echo ""

# ============================================================
# Summary
# ============================================================
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "  Issues:   ${RED}$ISSUES${NC}"
echo -e "  Warnings: ${YELLOW}$WARNINGS${NC}"
total_tracked=$(git ls-files | wc -l)
source_files=$(git ls-files packages/ pike-scripts/ scripts/ 2>/dev/null | wc -l)
echo -e "  Total tracked:  $total_tracked files"
echo -e "  Source files:    $source_files files"
echo -e "  Clutter ratio:  $(( (total_tracked - source_files) * 100 / total_tracked ))%"

# Fix mode: add to .gitignore and untrack
if [ "$MODE" = "fix" ] && [ ${#GITIGNORE_ADDITIONS[@]} -gt 0 ]; then
  echo ""
  echo -e "${BLUE}=== Applying fixes ===${NC}"

  # Deduplicate
  mapfile -t unique_additions < <(printf '%s\n' "${GITIGNORE_ADDITIONS[@]}" | sort -u)

  echo ""
  echo -e "${BLUE}Adding to .gitignore:${NC}"
  echo "" >> .gitignore
  echo "# Dev/planning clutter (auto-added by repo-hygiene.sh)" >> .gitignore
  for entry in "${unique_additions[@]}"; do
    echo "$entry" >> .gitignore
    echo "  + $entry"
  done

  echo ""
  echo -e "${BLUE}Untracking files (keeping on disk):${NC}"
  for entry in "${unique_additions[@]}"; do
    if [[ "$entry" == */ ]]; then
      # Directory - untrack all files in it
      git rm -r --cached "$entry" 2>/dev/null && echo "  - $entry" || true
    else
      git rm --cached "$entry" 2>/dev/null && echo "  - $entry" || true
    fi
  done

  echo ""
  echo -e "${GREEN}Done! Review changes with: git status${NC}"
  echo "Then commit: git commit -m 'chore: remove dev clutter from tracking'"
fi

# Strict mode: exit 1 if issues
if [ "$MODE" = "strict" ] && [ "$ISSUES" -gt 0 ]; then
  echo ""
  echo -e "${RED}Strict mode: $ISSUES issues found. Fix with: scripts/repo-hygiene.sh --fix${NC}"
  exit 1
fi

exit 0
