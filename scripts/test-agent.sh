#!/usr/bin/env bash
# test-agent.sh - Agent-oriented test runner
#
# Inspired by Carlini's "Building a C compiler with parallel Claudes":
# - Compact, grep-friendly output (not verbose human-readable)
# - ERROR: prefix on single lines for easy scanning
# - Pre-computed summary statistics
# - Verbose output logged to file (not stdout)
# - --fast mode for quick regression checks
#
# Usage:
#   scripts/test-agent.sh              # Full test suite
#   scripts/test-agent.sh --fast       # Quick smoke test (~10s)
#   scripts/test-agent.sh --suite X    # Run specific suite (bridge|server|e2e|pike)
#   scripts/test-agent.sh --summary    # Just print last run's summary
#   scripts/test-agent.sh --quality    # Report placeholder vs real test ratios
#   scripts/test-agent.sh --fast --seed feat/hover   # Deterministic subset for agent
#   scripts/test-agent.sh --seed fix/crash           # Different agent, different files
#   scripts/test-agent.sh --seed X --seed-fraction 60  # Select 60% of files (default 40%)
#   scripts/test-agent.sh --seed X --dry-run         # Preview file selection without running

set -uo pipefail

# Discover tools: check common locations if not already on PATH
for dir in "$HOME/.bun/bin" /usr/local/bin; do
  [ -d "$dir" ] && export PATH="$dir:$PATH"
done

# Auto-discover Pike if not on PATH
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

# Log rotation: keep only the last 20 log files to prevent disk bloat
LOG_COUNT=$(find "$LOG_DIR" -name '*.log' -type f 2>/dev/null | wc -l)
if [ "$LOG_COUNT" -gt 20 ]; then
  find "$LOG_DIR" -name '*.log' -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -n | head -n "$((LOG_COUNT - 20))" | cut -d' ' -f2- \
    | xargs rm -f 2>/dev/null
fi

MODE="full"
SUITE="all"
SEED=""
SEED_FRACTION=40
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    --fast) MODE="fast"; shift ;;
    --suite) SUITE="$2"; shift 2 ;;
    --seed) SEED="$2"; shift 2 ;;
    --seed-fraction) SEED_FRACTION="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --summary)
      if [ -f "$SUMMARY_FILE" ]; then
        cat "$SUMMARY_FILE"
      else
        echo "No previous test summary found."
      fi
      exit 0
      ;;
    --quality)
      echo "=== Test Quality Report ==="
      echo ""
      # Scan each package for placeholder vs real tests
      declare -A PKG_REAL PKG_PLACEHOLDER PKG_FILES
      PACKAGES=("packages/pike-bridge" "packages/pike-lsp-server" "packages/vscode-pike")
      TOTAL_REAL=0
      TOTAL_PLACEHOLDER=0
      TOTAL_FILES=0

      for pkg in "${PACKAGES[@]}"; do
        pkg_name=$(basename "$pkg")
        real=0
        placeholder=0
        files=0

        while IFS= read -r testfile; do
          [ -z "$testfile" ] && continue
          files=$((files + 1))
          # Count placeholder assertions: assert.ok('Test not implemented or assert.ok(true
          ph=$(grep -oP "assert\.ok\(('Test not implemented|true)" "$testfile" 2>/dev/null | wc -l | tr -d ' ')
          ph=${ph:-0}
          placeholder=$((placeholder + ph))
          # Count real test blocks: it( or test( calls (excluding skip/todo)
          tests=$(grep -oP '\b(it|test)\(' "$testfile" 2>/dev/null | wc -l | tr -d ' ')
          tests=${tests:-0}
          # Real tests = total test blocks minus placeholders
          r=$((tests - ph))
          [ $r -lt 0 ] && r=0
          real=$((real + r))
        done < <(find "$REPO_ROOT/$pkg" -name '*.test.ts' -o -name '*.test.js' -o -name '*.spec.ts' 2>/dev/null)

        PKG_REAL[$pkg_name]=$real
        PKG_PLACEHOLDER[$pkg_name]=$placeholder
        PKG_FILES[$pkg_name]=$files
        TOTAL_REAL=$((TOTAL_REAL + real))
        TOTAL_PLACEHOLDER=$((TOTAL_PLACEHOLDER + placeholder))
        TOTAL_FILES=$((TOTAL_FILES + files))

        total=$((real + placeholder))
        if [ $total -gt 0 ]; then
          pct=$((real * 100 / total))
        else
          pct=0
        fi
        echo "  $pkg_name: $real real / $placeholder placeholder ($pct% real) [$files files]"
      done

      total_all=$((TOTAL_REAL + TOTAL_PLACEHOLDER))
      if [ $total_all -gt 0 ]; then
        total_pct=$((TOTAL_REAL * 100 / total_all))
      else
        total_pct=0
      fi
      echo ""
      echo "  OVERALL: $TOTAL_REAL real / $TOTAL_PLACEHOLDER placeholder ($total_pct% real) [$TOTAL_FILES files]"

      # Top placeholder files
      echo ""
      echo "=== Priority Conversion Targets (most placeholders) ==="
      while IFS= read -r testfile; do
        [ -z "$testfile" ] && continue
        ph=$(grep -oP "assert\.ok\(('Test not implemented|true)" "$testfile" 2>/dev/null | wc -l | tr -d ' ')
        ph=${ph:-0}
        [ "$ph" -gt 0 ] && echo "  $ph  ${testfile#$REPO_ROOT/}"
      done < <(find "$REPO_ROOT/packages" -name '*.test.ts' -o -name '*.test.js' -o -name '*.spec.ts' 2>/dev/null) | sort -rn | head -15

      echo ""
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Seed-based test file subsampling ---
# When --seed is provided, deterministically select a subset of server test files.
# Different seeds select different slices, so parallel agents exercise different tests.
# Bridge tests and pike-compile are NEVER subsampled.
subsample_files() {
  local seed="$1"
  local fraction="$2"
  local files=()

  # Collect all server test files
  while IFS= read -r f; do
    [ -n "$f" ] && files+=("$f")
  done < <(find "$REPO_ROOT/packages/pike-lsp-server/src/tests" -name '*.test.ts' -type f 2>/dev/null | sort)

  local total=${#files[@]}
  if [ "$total" -eq 0 ]; then
    return
  fi

  # How many to select
  local keep=$(( (total * fraction + 99) / 100 ))
  [ "$keep" -lt 1 ] && keep=1
  [ "$keep" -gt "$total" ] && keep=$total

  # Hash each filename with the seed, sort by hash, take top N
  local scored=()
  for f in "${files[@]}"; do
    local basename
    basename=$(basename "$f")
    local hash
    hash=$(echo -n "${seed}:${basename}" | md5sum | cut -d' ' -f1)
    scored+=("$hash $f")
  done

  # Sort by hash and take top $keep
  printf '%s\n' "${scored[@]}" | sort | head -n "$keep" | cut -d' ' -f2-
}

# Handle --dry-run: show selected files and exit
if [ "$DRY_RUN" = true ]; then
  if [ -z "$SEED" ]; then
    echo "=== Dry Run (no seed - all files) ==="
    find "$REPO_ROOT/packages/pike-lsp-server/src/tests" -name '*.test.ts' -type f 2>/dev/null | sort
  else
    echo "=== Dry Run (seed: $SEED, fraction: $SEED_FRACTION%) ==="
    subsample_files "$SEED" "$SEED_FRACTION"
  fi
  total_available=$(find "$REPO_ROOT/packages/pike-lsp-server/src/tests" -name '*.test.ts' -type f 2>/dev/null | wc -l)
  if [ -n "$SEED" ]; then
    selected=$(subsample_files "$SEED" "$SEED_FRACTION" | wc -l)
    echo ""
    echo "Selected $selected / $total_available files ($SEED_FRACTION%)"
  else
    echo ""
    echo "All $total_available files (no seed)"
  fi
  echo ""
  echo "Note: bridge tests and pike-compile always run (not subsampled)."
  exit 0
fi

# Track results
declare -A RESULTS
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
ERRORS=()

run_suite() {
  local name="$1"
  local cmd="$2"
  local dir="$3"

  echo -n "  $name ... "

  local suite_log="$LOG_DIR/${name}-${TIMESTAMP}.log"
  local start_time=$SECONDS

  # Run test, capture exit code
  (cd "$dir" && eval "$cmd") > "$suite_log" 2>&1
  local exit_code=$?
  local elapsed=$(( SECONDS - start_time ))

  if [ $exit_code -eq 0 ]; then
    # Count passes from output
    local passes
    passes=$(grep -cP '^\s*\✓|pass|PASS' "$suite_log" 2>/dev/null || echo 0)
    passes=${passes:-0}
    RESULTS[$name]="PASS"
    TOTAL_PASS=$((TOTAL_PASS + 1))
    echo "PASS (${elapsed}s)"
  else
    RESULTS[$name]="FAIL"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    echo "FAIL (${elapsed}s)"

    # Extract error lines (compact, grep-friendly)
    while IFS= read -r line; do
      ERRORS+=("ERROR: [$name] $line")
    done < <(grep -iP '(error|fail|assert|expect|throw|exception|FAIL)' "$suite_log" 2>/dev/null | grep -viP '(node_modules|expected|\.d\.ts)' | head -10)

    # If no specific errors found, get last few lines
    if [ ${#ERRORS[@]} -eq 0 ] || [ "$(echo "${ERRORS[-1]}" | grep -c "$name")" -eq 0 ]; then
      local last_lines
      last_lines=$(tail -3 "$suite_log" | tr '\n' ' | ')
      ERRORS+=("ERROR: [$name] Exit code $exit_code. Last output: $last_lines")
    fi
  fi

  echo "  $name: exit=$exit_code elapsed=${elapsed}s" >> "$LOG_FILE"
}

run_pike_compile() {
  echo -n "  pike-compile ... "
  local suite_log="$LOG_DIR/pike-compile-${TIMESTAMP}.log"

  pike -e 'compile_file("pike-scripts/analyzer.pike");' > "$suite_log" 2>&1
  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    RESULTS[pike-compile]="PASS"
    TOTAL_PASS=$((TOTAL_PASS + 1))
    echo "PASS"
  else
    RESULTS[pike-compile]="FAIL"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    echo "FAIL"
    ERRORS+=("ERROR: [pike-compile] Pike analyzer failed to compile. See $suite_log")
  fi
}

echo "=== Test Run: $TIMESTAMP (mode: $MODE) ==="
echo ""

# --- Fast mode: minimal checks ---
if [ "$MODE" = "fast" ]; then
  echo "Running fast smoke tests..."

  run_pike_compile

  if [ "$SUITE" = "all" ] || [ "$SUITE" = "bridge" ]; then
    run_suite "bridge" "bun run test" "packages/pike-bridge"
  fi

  if [ "$SUITE" = "all" ] || [ "$SUITE" = "server" ]; then
    if [ -n "$SEED" ]; then
      local_files=$(subsample_files "$SEED" "$SEED_FRACTION" | tr '\n' ' ')
      if [ -n "$local_files" ]; then
        run_suite "server" "bun test $local_files" "packages/pike-lsp-server"
      else
        echo "  server ... SKIP (no files selected)"
      fi
    else
      run_suite "server" "bun run test" "packages/pike-lsp-server"
    fi
  fi

# --- Full mode: everything ---
else
  echo "Running full test suite..."

  run_pike_compile

  if [ "$SUITE" = "all" ] || [ "$SUITE" = "bridge" ]; then
    run_suite "bridge" "bun run test" "packages/pike-bridge"
  fi

  if [ "$SUITE" = "all" ] || [ "$SUITE" = "server" ]; then
    if [ -n "$SEED" ]; then
      local_files=$(subsample_files "$SEED" "$SEED_FRACTION" | tr '\n' ' ')
      if [ -n "$local_files" ]; then
        run_suite "server" "bun test $local_files" "packages/pike-lsp-server"
      else
        echo "  server ... SKIP (no files selected)"
      fi
    else
      run_suite "server" "bun run test" "packages/pike-lsp-server"
    fi
  fi

  if [ "$SUITE" = "all" ] || [ "$SUITE" = "e2e" ]; then
    run_suite "e2e" "bun run test:features" "packages/vscode-pike"
  fi
fi

# --- Watchdog: cleanup after full suite ---
if [ "$MODE" = "full" ] && [ "$SUITE" = "all" ]; then
  WATCHDOG_SCRIPT=""
  if [ -x "$REPO_ROOT/.claude/hooks/watchdog.sh" ]; then
    WATCHDOG_SCRIPT="$REPO_ROOT/.claude/hooks/watchdog.sh"
  elif [ -x "$REPO_ROOT/scripts/watchdog.sh" ]; then
    WATCHDOG_SCRIPT="$REPO_ROOT/scripts/watchdog.sh"
  fi

  if [ -n "$WATCHDOG_SCRIPT" ]; then
    echo "  Running watchdog cleanup..."
    "$WATCHDOG_SCRIPT" || true
  fi
fi

echo ""

# --- Summary ---
TOTAL=$((TOTAL_PASS + TOTAL_FAIL))

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
  echo "Full log: $LOG_FILE"
} | tee "$SUMMARY_FILE"

# Exit with failure if any suite failed
if [ $TOTAL_FAIL -gt 0 ]; then
  exit 1
fi
exit 0
