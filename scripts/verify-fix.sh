#!/usr/bin/env bash
# verify-fix.sh — Prove a fix is real by testing before/after
#
# This script prevents agents from cheating tests. It:
# 1. Saves the current (fixed) code
# 2. Reverts to the pre-fix state
# 3. Runs the scenario — it MUST FAIL
# 4. Restores the fix
# 5. Runs the scenario — it MUST PASS
#
# If the scenario passes in both states, the agent cheated.
#
# Usage:
#   scripts/verify-fix.sh <scenario-name> [base-branch]
#
# Example:
#   scripts/verify-fix.sh syntax-error-clears-on-fix main

set -uo pipefail

SCENARIO=${1:?"Usage: verify-fix.sh <scenario-name> [base-branch]"}
BASE=${2:-origin/main}
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

echo "=== Verify Fix: $SCENARIO ==="
echo ""

# Save current state (the fix)
STASH_MSG="verify-fix-$$"
git stash push -m "$STASH_MSG" --include-untracked 2>/dev/null

# Go to base state
git checkout "$BASE" -- . 2>/dev/null || git checkout HEAD~1 -- . 2>/dev/null

echo "--- Running scenario BEFORE fix (should FAIL) ---"
BEFORE_RESULT=$(bun test "packages/pike-lsp-server/src/scenarios/" --filter "$SCENARIO" 2>&1 || true)
BEFORE_PASS=$(echo "$BEFORE_RESULT" | grep -c "pass" || echo "0")
BEFORE_FAIL=$(echo "$BEFORE_RESULT" | grep -oP '\d+ fail' | grep -oP '\d+' || echo "0")

echo "$BEFORE_RESULT" | tail -5
echo ""

# Restore the fix
git checkout -- . 2>/dev/null
git stash pop 2>/dev/null || true

echo "--- Running scenario AFTER fix (should PASS) ---"
AFTER_RESULT=$(bun test "packages/pike-lsp-server/src/scenarios/" --filter "$SCENARIO" 2>&1 || true)
AFTER_PASS=$(echo "$AFTER_RESULT" | grep -oP '\d+ pass' | grep -oP '\d+' || echo "0")
AFTER_FAIL=$(echo "$AFTER_RESULT" | grep -oP '\d+ fail' | grep -oP '\d+' || echo "0")

echo "$AFTER_RESULT" | tail -5
echo ""

# Verdict
echo "=== VERDICT ==="
echo "Before fix: $BEFORE_FAIL fail, $BEFORE_PASS pass"
echo "After fix:  $AFTER_FAIL fail, $AFTER_PASS pass"
echo ""

if [ "${BEFORE_FAIL:-0}" -gt 0 ] && [ "${AFTER_FAIL:-0}" -eq 0 ]; then
  echo "✅ VERIFIED: Scenario failed before fix, passes after fix."
  exit 0
elif [ "${BEFORE_FAIL:-0}" -eq 0 ] && [ "${AFTER_FAIL:-0}" -eq 0 ]; then
  echo "❌ CHEATING DETECTED: Scenario passes both before AND after."
  echo "   This means the scenario doesn't actually test the fix."
  echo "   The agent must write a scenario that fails before the fix."
  exit 1
elif [ "${AFTER_FAIL:-0}" -gt 0 ]; then
  echo "❌ FIX NOT WORKING: Scenario still fails after fix."
  exit 1
else
  echo "⚠️  INCONCLUSIVE: Scenario failed before AND after."
  echo "   The scenario might be broken, or the fix is wrong."
  exit 1
fi
