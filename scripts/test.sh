#!/usr/bin/env bash
# test.sh - Simple test wrapper for pike-lsp
#
# Usage:
#   ./scripts/test.sh              # Full suite (~2min)
#   ./scripts/test.sh --fast       # Smoke test <30s
#   ./scripts/test.sh --summary    # Last run summary
#   ./scripts/test.sh --output=results.json  # JSON output
#
# Exit codes: 0=pass, 1=fail

set -uo pipefail

# Discover tools
for dir in "$HOME/.bun/bin" /usr/local/bin; do
  [ -d "$dir" ] && export PATH="$dir:$PATH"
done

# Auto-discover Pike
if ! command -v pike &>/dev/null; then
  for pike_dir in /usr/local/pike/*/bin "$HOME"/*/Pike-*/bin "$HOME"/OpenCode/Pike-*/bin; do
    if [ -x "$pike_dir/pike" ]; then
      export PATH="$pike_dir:$PATH"
      break
    fi
  done
fi

REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
cd "$REPO_ROOT"

LOG_DIR="$REPO_ROOT/.omc/test-logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/test-$TIMESTAMP.log"
SUMMARY_FILE="$LOG_DIR/LAST_SUMMARY.txt"

# Log rotation: keep last 20
find "$LOG_DIR" -name '*.log' -type f 2>/dev/null | sort -r | tail -n +21 | xargs rm -f 2>/dev/null || true

MODE="full"
OUTPUT_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --fast) MODE="fast"; shift ;;
    --full) MODE="full"; shift ;;
    --summary)
      if [ -f "$SUMMARY_FILE" ]; then
        cat "$SUMMARY_FILE"
      else
        echo "No previous test summary found."
      fi
      exit 0
      ;;
    --output=*) OUTPUT_FILE="${1#*=}"; shift ;;
    *) echo "Unknown option: $1" >&2; echo "Usage: $0 [--fast] [--full] [--summary] [--output=FILE]" >&2; exit 1 ;;
  esac
done

# Track results
declare -A RESULTS
TOTAL_PASS=0
TOTAL_FAIL=0
ERRORS=()

run_suite() {
  local name="$1"
  local cmd="$2"
  local dir="$3"

  echo -n "  $name ... " >&2

  local suite_log="$LOG_DIR/${name}-${TIMESTAMP}.log"
  local start_time=$SECONDS

  (cd "$dir" && eval "$cmd") > "$suite_log" 2>&1
  local exit_code=$?
  local elapsed=$(( SECONDS - start_time ))

  if [ $exit_code -eq 0 ]; then
    RESULTS[$name]="PASS"
    TOTAL_PASS=$((TOTAL_PASS + 1))
    echo "PASS (${elapsed}s)" >&2
  else
    RESULTS[$name]="FAIL"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    echo "FAIL (${elapsed}s)" >&2

    # Extract error lines (max 20 per suite)
    while IFS= read -r line; do
      ERRORS+=("ERROR: [$name] $line")
    done < <(grep -E '(error|fail|assert|expect|throw|exception|FAIL)' "$suite_log" 2>/dev/null \
      | grep -vE '(node_modules|expected|\.d\.ts)' | head -20)

    if [ ${#ERRORS[@]} -eq 0 ]; then
      local last_lines
      last_lines=$(tail -3 "$suite_log" | tr '\n' ' ')
      ERRORS+=("ERROR: [$name] Exit code $exit_code. Last: $last_lines")
    fi
  fi

  echo "  $name: exit=$exit_code elapsed=${elapsed}s" >> "$LOG_FILE"
}

run_pike_compile() {
  echo -n "  pike-compile ... " >&2
  local suite_log="$LOG_DIR/pike-compile-${TIMESTAMP}.log"

  pike -e 'compile_file("pike-scripts/analyzer.pike");' > "$suite_log" 2>&1
  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    RESULTS[pike-compile]="PASS"
    TOTAL_PASS=$((TOTAL_PASS + 1))
    echo "PASS" >&2
  else
    RESULTS[pike-compile]="FAIL"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    echo "FAIL" >&2
    ERRORS+=("ERROR: [pike-compile] Compilation failed. See $suite_log")
  fi
}

echo "=== Test Run: $TIMESTAMP (mode: $MODE) ===" >&2
echo "" >&2

if [ "$MODE" = "fast" ]; then
  echo "Running fast smoke tests..." >&2
  run_pike_compile
  run_suite "bridge" "bun run test" "packages/pike-bridge"
  run_suite "server" "bun run test" "packages/pike-lsp-server"
else
  echo "Running full test suite..." >&2
  run_pike_compile
  run_suite "bridge" "bun run test" "packages/pike-bridge"
  run_suite "server" "bun run test" "packages/pike-lsp-server"
  run_suite "e2e" "bun run test:features" "packages/vscode-pike"
fi

echo "" >&2

# Build output
TOTAL=$((TOTAL_PASS + TOTAL_FAIL))

# Console output (summary-only by default)
{
  echo "=== SUMMARY ($TIMESTAMP) ==="
  echo "Total: $TOTAL | Pass: $TOTAL_PASS | Fail: $TOTAL_FAIL"
  echo ""

  for suite in "${!RESULTS[@]}"; do
    echo "  $suite: ${RESULTS[$suite]}"
  done

  if [ ${#ERRORS[@]} -gt 0 ]; then
    echo ""
    echo "=== ERRORS ==="
    for err in "${ERRORS[@]}"; do
      echo "$err"
    done
  fi

  echo ""
  echo "Logs: $LOG_DIR/"
} | tee "$SUMMARY_FILE" >&2

# JSON output if requested
if [ -n "$OUTPUT_FILE" ]; then
  echo "{" > "$OUTPUT_FILE"
  echo "  \"timestamp\": \"$TIMESTAMP\"," >> "$OUTPUT_FILE"
  echo "  \"mode\": \"$MODE\"," >> "$OUTPUT_FILE"
  echo "  \"total\": $TOTAL," >> "$OUTPUT_FILE"
  echo "  \"pass\": $TOTAL_PASS," >> "$OUTPUT_FILE"
  echo "  \"fail\": $TOTAL_FAIL," >> "$OUTPUT_FILE"
  echo "  \"suites\": {" >> "$OUTPUT_FILE"
  
  first=true
  for suite in "${!RESULTS[@]}"; do
    if $first; then
      first=false
    else
      echo "," >> "$OUTPUT_FILE"
    fi
    printf "    \"%s\": \"%s\"" "$suite" "${RESULTS[$suite]}" >> "$OUTPUT_FILE"
  done
  echo "" >> "$OUTPUT_FILE"
  echo "  }," >> "$OUTPUT_FILE"
  echo "  \"errors\": [" >> "$OUTPUT_FILE"
  
  first=true
  for err in "${ERRORS[@]}"; do
    if $first; then
      first=false
    else
      echo "," >> "$OUTPUT_FILE"
    fi
    # Escape quotes and backslashes
    escaped=$(echo "$err" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')
    printf "    \"%s\"" "$escaped" >> "$OUTPUT_FILE"
  done
  echo "" >> "$OUTPUT_FILE"
  echo "  ]" >> "$OUTPUT_FILE"
  echo "}" >> "$OUTPUT_FILE"
  
  echo "JSON results written to $OUTPUT_FILE" >&2
fi

# Exit with failure if any suite failed
if [ $TOTAL_FAIL -gt 0 ]; then
  exit 1
fi
exit 0
