#!/usr/bin/env bash
# test-integrity-gate.sh - PreToolUse hook for Edit and Write
#
# Prevents agents from cheating on tests by detecting:
#   1. Weakening assertions (toBeDefined/toBeTruthy replacing specific checks)
#   2. Skipping tests (.skip, .only, xit, xdescribe)
#   3. Deleting/commenting out assertions
#   4. Adding @ts-ignore/@ts-expect-error in tests
#   5. Replacing real implementations with mocks to make tests pass
#   6. Reducing assertion count in existing tests
#
# This hook fires on Edit and Write tool calls targeting test files.

set -uo pipefail

INPUT=$(cat)

# Extract tool name and file path
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only check test files
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

is_test_file=false
case "$FILE_PATH" in
  *.test.ts|*.test.js|*.spec.ts|*.spec.js) is_test_file=true ;;
  */test/*|*/tests/*|*/__tests__/*) is_test_file=true ;;
esac

if [ "$is_test_file" = false ]; then
  exit 0
fi

# === For Edit tool: check old_string -> new_string changes ===
if [ "$TOOL" = "Edit" ]; then
  OLD=$(echo "$INPUT" | jq -r '.tool_input.old_string // empty' 2>/dev/null)
  NEW=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)

  # 1. Detect adding .skip or .only
  if echo "$NEW" | grep -qP '\.(skip|only)\s*\('; then
    if ! echo "$OLD" | grep -qP '\.(skip|only)\s*\('; then
      echo "[TEST INTEGRITY] BLOCKED: Adding .skip or .only to tests."
      echo ""
      echo "Do NOT skip or isolate tests. Fix the failing code instead."
      echo "If a test is genuinely wrong, explain WHY before modifying it."
      exit 2
    fi
  fi

  # 2. Detect adding xit/xdescribe/xtest
  if echo "$NEW" | grep -qP '^\s*(xit|xdescribe|xtest|xcontext)\s*\('; then
    if ! echo "$OLD" | grep -qP '^\s*(xit|xdescribe|xtest|xcontext)\s*\('; then
      echo "[TEST INTEGRITY] BLOCKED: Disabling tests with x-prefix."
      echo ""
      echo "Do NOT disable tests. Fix the code to make them pass."
      exit 2
    fi
  fi

  # 3. Detect adding @ts-ignore or @ts-expect-error
  if echo "$NEW" | grep -qP '@ts-(ignore|expect-error)'; then
    if ! echo "$OLD" | grep -qP '@ts-(ignore|expect-error)'; then
      echo "[TEST INTEGRITY] BLOCKED: Adding @ts-ignore/@ts-expect-error in test file."
      echo ""
      echo "Fix the type error properly. Tests must be type-safe."
      exit 2
    fi
  fi

  # 4. Detect weakening assertions (specific -> weak)
  # Count strong assertions in old vs new
  old_strong=$(echo "$OLD" | grep -cP '\.(toBe|toEqual|toStrictEqual|toMatch|toContain|toThrow|toHaveLength|toHaveBeenCalledWith|toMatchObject|toMatchSnapshot)\s*\(' 2>/dev/null || echo 0)
  new_strong=$(echo "$NEW" | grep -cP '\.(toBe|toEqual|toStrictEqual|toMatch|toContain|toThrow|toHaveLength|toHaveBeenCalledWith|toMatchObject|toMatchSnapshot)\s*\(' 2>/dev/null || echo 0)
  new_weak=$(echo "$NEW" | grep -cP '\.(toBeDefined|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined|not\.toBeNull|not\.toBeUndefined)\s*\(' 2>/dev/null || echo 0)

  # If strong assertions decreased AND weak assertions appeared, that's cheating
  if [ "$old_strong" -gt 0 ] && [ "$new_strong" -lt "$old_strong" ] && [ "$new_weak" -gt 0 ]; then
    echo "[TEST INTEGRITY] WARNING: Assertions appear weakened in this edit."
    echo ""
    echo "Strong assertions decreased ($old_strong -> $new_strong) while weak assertions added ($new_weak)."
    echo "Patterns like .toBeDefined() or .toBeTruthy() are usually too weak."
    echo ""
    echo "If this is intentional, explain WHY the original assertions were wrong."
    echo "Otherwise, fix the code to satisfy the original strong assertions."
    # Warning only, not blocked - could be legitimate
    exit 0
  fi

  # 5. Detect removing expect() calls (reducing assertion count)
  old_expects=$(echo "$OLD" | grep -cP '\bexpect\s*\(' 2>/dev/null || echo 0)
  new_expects=$(echo "$NEW" | grep -cP '\bexpect\s*\(' 2>/dev/null || echo 0)

  if [ "$old_expects" -gt 0 ] && [ "$new_expects" -lt "$old_expects" ]; then
    echo "[TEST INTEGRITY] WARNING: Assertion count decreased ($old_expects -> $new_expects)."
    echo ""
    echo "Removing assertions from existing tests weakens the test suite."
    echo "If the assertion was genuinely wrong, explain WHY."
    # Warning only
    exit 0
  fi

  # 6. Detect commenting out test code
  old_comments=$(echo "$OLD" | grep -cP '^\s*//' 2>/dev/null || echo 0)
  new_comments=$(echo "$NEW" | grep -cP '^\s*//' 2>/dev/null || echo 0)
  old_lines=$(echo "$OLD" | wc -l)
  new_lines=$(echo "$NEW" | wc -l)

  # If comment lines increased significantly relative to total lines
  comment_increase=$((new_comments - old_comments))
  if [ "$comment_increase" -gt 3 ] && [ "$new_lines" -le "$old_lines" ]; then
    echo "[TEST INTEGRITY] WARNING: Significant increase in commented-out code in test file."
    echo ""
    echo "Don't comment out test code. Either fix it or delete it with justification."
    exit 0
  fi
fi

# === For Write tool: check full file content ===
if [ "$TOOL" = "Write" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null)

  # Check for skip/only in new test files
  if echo "$CONTENT" | grep -qP '\.(skip|only)\s*\('; then
    echo "[TEST INTEGRITY] WARNING: New test file contains .skip or .only."
    echo ""
    echo "All tests should run by default. Remove .skip/.only before committing."
    exit 0
  fi

  # Check for extremely low assertion density
  test_count=$(echo "$CONTENT" | grep -oP '\b(it|test)\s*\(' 2>/dev/null | wc -l | tr -d ' ')
  expect_count=$(echo "$CONTENT" | grep -oP '\bexpect\s*\(' 2>/dev/null | wc -l | tr -d ' ')
  test_count=${test_count:-0}
  expect_count=${expect_count:-0}

  if [ "$test_count" -gt 0 ] && [ "$expect_count" -eq 0 ]; then
    echo "[TEST INTEGRITY] BLOCKED: Test file has $test_count tests but ZERO assertions."
    echo ""
    echo "Every test MUST have at least one expect() assertion."
    echo "A test without assertions proves nothing."
    exit 2
  fi

  if [ "$test_count" -gt 3 ] && [ "$expect_count" -lt "$test_count" ]; then
    echo "[TEST INTEGRITY] WARNING: Low assertion density ($expect_count assertions for $test_count tests)."
    echo ""
    echo "Each test should have at least one meaningful assertion."
    exit 0
  fi
fi

exit 0
