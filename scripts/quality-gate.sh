#!/usr/bin/env bash
# quality-gate.sh — Automated quality checks for pike-lsp
# Run in CI to reject bloated PRs without human review

set -uo pipefail

CHANGED_FILES=$(git diff --name-only origin/main...HEAD -- 'packages/pike-lsp-server/src/**/*.ts' 2>/dev/null || git diff --name-only HEAD~1 -- 'packages/pike-lsp-server/src/**/*.ts')
FAIL=0

echo "=== Quality Gate ==="

# 1. Line count per file — reject source files over 500 lines (tests excluded)
for f in $CHANGED_FILES; do
  if [ -f "$f" ] && ! echo "$f" | grep -qE '\.(test|spec)\.(ts|js)$'; then
    lines=$(wc -l < "$f")
    if [ "$lines" -gt 500 ]; then
      echo "FAIL: $f has $lines lines (max 500)"
      FAIL=1
    fi
  fi
done

# 2. Export count — too many exports = over-engineered module
for f in $CHANGED_FILES; do
  if [ -f "$f" ]; then
    exports=$(grep -c "^export " "$f" 2>/dev/null || true)
    exports=${exports:-0}
    if [ "$exports" -gt 20 ]; then
      echo "WARN: $f has $exports exports (max recommended: 20)"
    fi
  fi
done

# 3. TODO/FIXME/HACK — flag unfinished work
todos=$(grep -rn "TODO\|FIXME\|HACK\|XXX" $CHANGED_FILES 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
todos=${todos:-0}
if [ "$todos" -gt 0 ]; then
  echo "WARN: $todos TODO/FIXME/HACK markers in changed files"
  grep -rn "TODO\|FIXME\|HACK\|XXX" $CHANGED_FILES 2>/dev/null | grep -v node_modules | head -5
fi

# 4. Unused imports — detect obvious ones (import X but X never used)
for f in $CHANGED_FILES; do
  if [ -f "$f" ]; then
    # Find named imports
    imports=$(grep -oP 'import\s+\{[^}]+\}' "$f" 2>/dev/null | grep -oP '\w+' | grep -v "^import$" | grep -v "^from$" | sort -u)
    for name in $imports; do
      # Count uses excluding the import line itself
      uses=$(grep -c "$name" "$f" 2>/dev/null || echo 0)
      if [ "$uses" -le 1 ]; then
        echo "WARN: $f — '$name' imported but possibly unused"
      fi
    done
  fi
done

# 5. Function length — flag functions over 80 lines (skip test files)
for f in $CHANGED_FILES; do
  if [ -f "$f" ] && ! echo "$f" | grep -qE '\.(test|spec)\.(ts|js)$'; then
    long_funcs=$(awk '/^(export )?(async )?function / { if(start && NR-start > 80) print prev " (" NR-start " lines)"; start=NR; prev=$0 } /^}/ { if(start && NR-start > 80) print prev " (" NR-start " lines)"; start=0 }' "$f" 2>/dev/null)
    if [ -n "$long_funcs" ]; then
      echo "WARN: $f has long function(s):"
      echo "$long_funcs"
    fi
  fi
done

# 6. Scenario tests must exist if behavior changed
scenario_dir="packages/pike-lsp-server/src/scenarios"
if [ -n "$CHANGED_FILES" ]; then
  scenario_changed=$(echo "$CHANGED_FILES" | grep -c "scenarios/" || true)
  src_changed=$(echo "$CHANGED_FILES" | grep -c "src/features\|src/services\|src/core" || true)
  if [ "$src_changed" -gt 0 ] && [ "$scenario_changed" -eq 0 ]; then
    echo "WARN: Source code changed but no scenarios updated. Consider adding a scenario."
  fi
fi

echo ""
if [ "$FAIL" -eq 1 ]; then
  echo "RESULT: FAILED — fix issues above"
  exit 1
else
  echo "RESULT: PASSED"
  exit 0
fi
