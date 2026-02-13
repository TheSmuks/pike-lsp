#!/usr/bin/env bash
# boot-check.sh - Pre-session boot sequence validation for all agents
#
# Enforces the 10-step boot sequence from pike-roxen-lsp-agent-prompt.md
# Every agent MUST run this before starting work.
#
# Usage:
#   scripts/boot-check.sh                    # Full boot sequence
#   scripts/boot-check.sh --skip-tests       # Skip baseline tests (faster)
#   scripts/boot-check.sh --quiet            # Minimal output
#
# Exit codes:
#   0 - Boot complete, all checks passed
#   1 - One or more critical checks failed
#
# Non-critical failures (warnings) don't cause exit 1 but are reported.

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Options
SKIP_TESTS=false
QUIET=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --quiet)
      QUIET=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--skip-tests] [--quiet]"
      echo ""
      echo "Options:"
      echo "  --skip-tests  Skip baseline test execution"
      echo "  --quiet       Minimal output (errors only)"
      echo "  -h, --help    Show this help"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Repository root
REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Track failures
CRITICAL_FAILURES=()
WARNINGS=()

log_info() {
  if [ "$QUIET" = false ]; then
    echo -e "${BLUE}[INFO]${NC} $1"
  fi
}

log_success() {
  if [ "$QUIET" = false ]; then
    echo -e "${GREEN}[PASS]${NC} $1"
  fi
}

log_warning() {
  echo -e "${YELLOW}[WARN]${NC} $1"
  WARNINGS+=("$1")
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
  CRITICAL_FAILURES+=("$1")
}

log_step() {
  if [ "$QUIET" = false ]; then
    echo ""
    echo -e "${BLUE}$1${NC}"
  fi
}

# ============================================================================
# Check 1: agent.config exists and paths are valid
# ============================================================================
log_step "Step 1: Checking agent.config..."

AGENT_CONFIG="$REPO_ROOT/agent.config"

if [ ! -f "$AGENT_CONFIG" ]; then
  log_warning "agent.config not found at $AGENT_CONFIG"
  log_warning "Creating default agent.config template..."

  cat > "$AGENT_CONFIG" << 'EOF'
# agent.config — Agent reference source paths
# These are ONLY used by agents during development to read reference source.
# They are NEVER compiled into the LSP itself.

[reference_sources]
# Path to Pike source tree (for reading interpreter internals)
pike_source = ../Pike-v8.0.1116

# Path to Roxen source tree (for reading framework internals)
roxen_source = ../Roxen
EOF

  log_warning "Created default agent.config. Please update paths if your sources are elsewhere."
else
  log_success "agent.config exists"
fi

# Parse paths from agent.config (simple parsing, no external deps)
if [ -f "$AGENT_CONFIG" ]; then
  PIKE_SOURCE=$(grep "^pike_source" "$AGENT_CONFIG" | cut -d'=' -f2 | xargs || echo "")
  ROXEN_SOURCE=$(grep "^roxen_source" "$AGENT_CONFIG" | cut -d'=' -f2 | xargs || echo "")

  # Resolve relative paths from repo root
  if [ -n "$PIKE_SOURCE" ]; then
    PIKE_SOURCE_RESOLVED="$PIKE_SOURCE"
    if [[ "$PIKE_SOURCE" != /* ]]; then
      PIKE_SOURCE_RESOLVED="$REPO_ROOT/$PIKE_SOURCE"
    fi

    if [ -d "$PIKE_SOURCE_RESOLVED" ]; then
      log_success "Pike source path valid: $PIKE_SOURCE_RESOLVED"
    else
      log_warning "Pike source path not found: $PIKE_SOURCE_RESOLVED"
      log_warning "Proceeding without Pike reference source"
    fi
  fi

  if [ -n "$ROXEN_SOURCE" ]; then
    ROXEN_SOURCE_RESOLVED="$ROXEN_SOURCE"
    if [[ "$ROXEN_SOURCE" != /* ]]; then
      ROXEN_SOURCE_RESOLVED="$REPO_ROOT/$ROXEN_SOURCE"
    fi

    if [ -d "$ROXEN_SOURCE_RESOLVED" ]; then
      log_success "Roxen source path valid: $ROXEN_SOURCE_RESOLVED"
    else
      log_warning "Roxen source path not found: $ROXEN_SOURCE_RESOLVED"
      log_warning "Proceeding without Roxen reference source"
    fi
  fi
fi

# ============================================================================
# Check 2: LSP runtime discovery works
# ============================================================================
log_step "Step 2: Verifying LSP runtime discovery..."

if command -v pike &> /dev/null; then
  PIKE_VERSION=$(pike -e 'write(__REAL_VERSION__ + "\n");' 2>&1)
  if [ $? -eq 0 ]; then
    log_success "Pike discovery works: version $PIKE_VERSION"

    # Check module path discovery
    PIKE_MODULE_PATH=$(pike -e 'write(master()->pike_module_path * "\n");' 2>&1)
    if [ $? -eq 0 ] && [ -n "$PIKE_MODULE_PATH" ]; then
      log_success "Pike module path discovery works"
    else
      log_warning "Pike module path discovery failed"
    fi
  else
    log_error "Pike binary found but version query failed"
  fi
else
  log_error "Pike binary not found on PATH"
  log_error "LSP runtime discovery CRITICAL: Cannot find Pike"
fi

# ============================================================================
# Check 3: Roxen detection (if Roxen features are relevant)
# ============================================================================
log_step "Step 3: Checking Roxen detection capability..."

# Check if we can find a test Roxen installation
# This is informational - Roxen is optional
ROXEN_TEST_PATH=$(find /opt /usr/local /home -maxdepth 3 -type d -name "Roxen" 2>/dev/null | head -1 || echo "")

if [ -n "$ROXEN_TEST_PATH" ]; then
  log_success "Found potential Roxen installation at: $ROXEN_TEST_PATH"
  log_info "Roxen detection can be tested with: pike.roxenPath=$ROXEN_TEST_PATH"
else
  log_info "No Roxen installation found (this is OK for pure Pike mode)"
fi

# Check if the LSP codebase has Roxen detection logic
if grep -r -q "roxenPath" packages/pike-lsp-server/src/ 2>/dev/null; then
  log_success "Roxen detection logic present in LSP codebase"
else
  log_warning "Roxen detection logic not found in LSP codebase"
fi

# ============================================================================
# Check 4: Git up to date
# ============================================================================
log_step "Step 4: Checking git status..."

if git rev-parse --is-inside-work-tree &> /dev/null; then
  # Check if we're on main or a feature branch
  CURRENT_BRANCH=$(git branch --show-current)
  log_info "Current branch: $CURRENT_BRANCH"

  # Check for uncommitted changes
  if [ -n "$(git status --porcelain)" ]; then
    log_warning "You have uncommitted changes"
  else
    log_success "Working tree clean"
  fi

  # Check if we're behind origin
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' &> /dev/null; then
    BEHIND_COUNT=$(git rev-list --count --left-right '@{u}...HEAD' 2>/dev/null | awk '{print $1}')
    if [ "$BEHIND_COUNT" -gt 0 ]; then
      log_warning "You are $BEHIND_COUNT commits behind origin"
      log_warning "Consider running: git pull"
    else
      log_success "Git up to date with origin"
    fi
  else
    log_info "No upstream branch (local only or new branch)"
  fi
else
  log_error "Not in a git working tree"
fi

# ============================================================================
# Check 5: PROGRESS.md readable
# ============================================================================
log_step "Step 5: Checking PROGRESS.md..."

PROGRESS_MD="$REPO_ROOT/PROGRESS.md"
if [ -f "$PROGRESS_MD" ]; then
  if [ -r "$PROGRESS_MD" ]; then
    log_success "PROGRESS.md exists and is readable"
  else
    log_error "PROGRESS.md exists but is not readable"
  fi
else
  log_warning "PROGRESS.md not found (will be created on first work session)"
fi

# ============================================================================
# Check 6: KNOWN_BUGS.md readable
# ============================================================================
log_step "Step 6: Checking KNOWN_BUGS.md..."

KNOWN_BUGS_MD="$REPO_ROOT/KNOWN_BUGS.md"
if [ -f "$KNOWN_BUGS_MD" ]; then
  if [ -r "$KNOWN_BUGS_MD" ]; then
    log_success "KNOWN_BUGS.md exists and is readable"
  else
    log_error "KNOWN_BUGS.md exists but is not readable"
  fi
else
  log_warning "KNOWN_BUGS.md not found (no known bugs tracked yet)"
fi

# ============================================================================
# Check 7: ARCHITECTURE.md readable
# ============================================================================
log_step "Step 7: Checking ARCHITECTURE.md..."

# ARCHITECTURE.md might be in .planning/ or root
ARCH_MD="$REPO_ROOT/.planning/codebase/ARCHITECTURE.md"
if [ ! -f "$ARCH_MD" ]; then
  ARCH_MD="$REPO_ROOT/ARCHITECTURE.md"
fi

if [ -f "$ARCH_MD" ]; then
  if [ -r "$ARCH_MD" ]; then
    log_success "ARCHITECTURE.md exists and is readable"
  else
    log_error "ARCHITECTURE.md exists but is not readable"
  fi
else
  log_warning "ARCHITECTURE.md not found"
fi

# ============================================================================
# Check 8: Baseline tests
# ============================================================================
if [ "$SKIP_TESTS" = false ]; then
  log_step "Step 8: Running baseline tests (fast mode)..."

  if [ -f "$REPO_ROOT/scripts/test.sh" ]; then
    # Run tests in fast mode (test.sh already outputs concise summary)
    TEST_OUTPUT=$(bash "$REPO_ROOT/scripts/test.sh" --fast 2>&1)
    TEST_EXIT=$?

    if [ $TEST_EXIT -eq 0 ]; then
      log_success "Baseline tests passed"

      # Try to extract pass rate from output
      if echo "$TEST_OUTPUT" | grep -q "pass"; then
        log_info "Test summary available in test output"
      fi
    else
      log_error "Baseline tests failed with exit code $TEST_EXIT"
      log_error "Some tests are failing - fix these before starting new work"
    fi
  else
    log_warning "test.sh not found, skipping baseline tests"
  fi
else
  log_info "Step 8: Baseline tests SKIPPED (--skip-tests flag)"
fi

# ============================================================================
# Check 9: Check current_tasks/ for locks
# ============================================================================
log_step "Step 9: Checking for active task locks..."

TASK_LOCK_SCRIPT="$REPO_ROOT/scripts/task-lock.sh"
CURRENT_TASKS_DIR="$REPO_ROOT/current_tasks"

if [ -f "$TASK_LOCK_SCRIPT" ]; then
  # Check for locks - parse the output to detect if there are actual locks
  LOCK_OUTPUT=$("$TASK_LOCK_SCRIPT" list 2>/dev/null || echo "")

  # Check if there are actual locks (not just "no active locks" message)
  if echo "$LOCK_OUTPUT" | grep -q "no active locks"; then
    log_success "No active task locks"
  elif echo "$LOCK_OUTPUT" | grep -q "\.lock"; then
    log_warning "Active task locks found:"
    echo "$LOCK_OUTPUT" | grep "\.lock" | while IFS= read -r line; do
      echo "  - $line"
    done
    log_warning "Do not claim a task that is already locked"
  else
    log_success "No active task locks"
  fi

  # Check current_tasks directory
  if [ -d "$CURRENT_TASKS_DIR" ]; then
    TASK_COUNT=$(find "$CURRENT_TASKS_DIR" -type f 2>/dev/null | wc -l)
    if [ "$TASK_COUNT" -gt 0 ]; then
      log_info "Found $TASK_COUNT task file(s) in current_tasks/"
    fi
  fi
else
  log_warning "task-lock.sh not found, skipping lock check"
fi

# ============================================================================
# Check 10: Boot complete report
# ============================================================================
log_step "Step 10: Boot sequence complete"

if [ "$QUIET" = false ]; then
  echo ""
  echo "=========================================="
  echo "           BOOT SEQUENCE REPORT"
  echo "=========================================="
fi

if [ ${#CRITICAL_FAILURES[@]} -eq 0 ]; then
  echo -e "${GREEN}Boot complete${NC}"
  if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}Warnings (${#WARNINGS[@]}):${NC}"
    for warning in "${WARNINGS[@]}"; do
      echo "  - $warning"
    done
  fi
  exit 0
else
  echo -e "${RED}Boot FAILED${NC}"
  echo ""
  echo -e "${RED}Critical failures (${#CRITICAL_FAILURES[@]}):${NC}"
  for failure in "${CRITICAL_FAILURES[@]}"; do
    echo "  - $failure"
  done
  echo ""
  echo "Please fix these issues before starting work."
  exit 1
fi
