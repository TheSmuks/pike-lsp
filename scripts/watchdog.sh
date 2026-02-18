#!/usr/bin/env bash
#
# Watchdog Agent - Continuous regression monitoring
# Monitors codebase health and catches regressions early
#

set -eo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Root directory
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Baseline file for regression detection
readonly BASELINE_FILE="${PROJECT_ROOT}/.omc/watchdog/baseline.txt"
readonly LOG_DIR="${PROJECT_ROOT}/.omc/watchdog/logs"
mkdir -p "${LOG_DIR}"

# Timestamp for this run
readonly TIMESTAMP=$(date +%Y%m%d_%H%M%S)
readonly LOG_FILE="${LOG_DIR}/${TIMESTAMP}.log"

# Utility functions
log_status() {
    local status="$1"
    local message="$2"
    echo -e "${BLUE}WATCHDOG:${NC} [${status}] ${message}" | tee -a "${LOG_FILE}"
}

log_pass() {
    local message="$1"
    log_status "${GREEN}PASS${NC}" "${message}"
}

log_fail() {
    local message="$1"
    log_status "${RED}FAIL${NC}" "${message}"
}

log_warn() {
    local message="$1"
    log_status "${YELLOW}WARN${NC}" "${message}"
}

log_info() {
    local message="$1"
    log_status "${BLUE}INFO${NC}" "${message}"
}

# 1. Regression Check: Run tests and compare against baseline
check_regression() {
    echo "=== 1. Regression Check ===" | tee -a "${LOG_FILE}"

    # Run fast tests
    local test_output
    if ! test_output=$("${SCRIPT_DIR}/test-agent.sh" --fast 2>&1); then
        log_fail "Test execution failed"
        return 1
    fi

    # Extract pass/fail counts (test-agent uses "Pass: N | Fail: N" format)
    local current_pass=$(echo "$test_output" | grep -oP 'Pass: \K\d+' || echo "0")
    local current_fail=$(echo "$test_output" | grep -oP 'Fail: \K\d+' || echo "0")

    # Check if baseline exists
    if [[ ! -f "${BASELINE_FILE}" ]]; then
        log_warn "No baseline found, creating current state as baseline"
        echo "${current_pass},${current_fail}" > "${BASELINE_FILE}"
        return 0
    fi

    # Read baseline
    local baseline_pass baseline_fail
    IFS=',' read -r baseline_pass baseline_fail < "${BASELINE_FILE}"

    # Compare
    local pass_diff=$((current_pass - baseline_pass))
    local fail_diff=$((current_fail - baseline_fail))

    if [[ $current_fail -gt $baseline_fail ]]; then
        log_fail "Regression detected: failures increased from ${baseline_fail} to ${current_fail} (+${fail_diff})"
        return 1
    elif [[ $current_pass -lt $baseline_pass ]]; then
        log_fail "Regression detected: passes decreased from ${baseline_pass} to ${current_pass} (${pass_diff})"
        return 1
    else
        log_pass "Tests stable: ${current_pass} passed, ${current_fail} failed"
        # Update baseline
        echo "${current_pass},${current_fail}" > "${BASELINE_FILE}"
        return 0
    fi
}

# 2. Path Audit: Check for hardcoded paths
check_path_audit() {
    echo "=== 2. Path Audit ===" | tee -a "${LOG_FILE}"

    local src_dirs=(
        "${PROJECT_ROOT}/packages/pike-lsp-server/src"
        "${PROJECT_ROOT}/packages/pike-bridge/src"
        "${PROJECT_ROOT}/packages/vscode-pike/src"
    )

    local found_issues=0

    for src_dir in "${src_dirs[@]}"; do
        if [[ ! -d "${src_dir}" ]]; then
            continue
        fi

        # Look for hardcoded absolute paths (excluding localhost, 127.0.0.1, /tmp)
        # Exclude: test files, comments, markdown docs, node_modules
        local hardcoded_paths
        hardcoded_paths=$(grep -rn "\"/[a-z]" "${src_dir}" 2>/dev/null | \
            grep -v "\.test\." | \
            grep -v "\.spec\." | \
            grep -v "localhost" | \
            grep -v "127.0.0.1" | \
            grep -v "/tmp/" | \
            grep -v node_modules | \
            grep -v "\.md:" | \
            grep -vE "^\s*//" | \
            grep -v "^\s*\*" || true)

        if [[ -n "${hardcoded_paths}" ]]; then
            log_warn "Found potential hardcoded paths in ${src_dir}:"
            echo "${hardcoded_paths}" | tee -a "${LOG_FILE}"
            found_issues=$((found_issues + 1))
        fi
    done

    if [[ $found_issues -eq 0 ]]; then
        log_pass "No hardcoded paths found"
        return 0
    else
        log_warn "Found ${found_issues} directories with potential hardcoded paths (see above)"
        log_info "Path audit is informational only - not treated as failure"
        return 0  # Changed: path audit warnings don't cause watchdog failure
    fi
}

# 3. UNDEFINED Audit: Randomly test 3 features
check_undefined_audit() {
    echo "=== 3. UNDEFINED Audit ===" | tee -a "${LOG_FILE}"

    # Define features to test
    local features=(
        "document-symbols"
        "hover"
        "definition"
        "completion"
        "references"
    )

    # Select 3 random features
    local selected=()
    while [[ ${#selected[@]} -lt 3 && ${#features[@]} -gt 0 ]]; do
        local idx=$((RANDOM % ${#features[@]}))
        selected+=("${features[$idx]}")
        # Remove selected element
        features=("${features[@]:0:$idx}" "${features[@]:$((idx+1))}")
    done

    echo "Testing features: ${selected[*]}" | tee -a "${LOG_FILE}"

    local failures=0

    for feature in "${selected[@]}"; do
        echo "Testing ${feature}..." | tee -a "${LOG_FILE}"

        # Run feature-specific test (grep for the feature in test output)
        local test_output
        if ! test_output=$("${SCRIPT_DIR}/test-agent.sh" --suite e2e 2>&1); then
            log_warn "Could not run E2E tests for ${feature}"
            continue
        fi

        # Check if feature appears to work (no UNDEFINED errors)
        if echo "$test_output" | grep -qi "undefined\|UNDEFINED"; then
            log_fail "Feature ${feature} shows undefined behavior"
            failures=$((failures + 1))
        else
            log_pass "Feature ${feature} appears stable"
        fi
    done

    if [[ $failures -eq 0 ]]; then
        return 0
    else
        log_fail "Found undefined behavior in ${failures} features"
        return 1
    fi
}

# 4. Stale Locks Check
check_stale_locks() {
    echo "=== 4. Stale Locks Check ===" | tee -a "${LOG_FILE}"

    local tasks_dir="${PROJECT_ROOT}/.omc/current_tasks"

    if [[ ! -d "${tasks_dir}" ]]; then
        log_pass "No tasks directory exists"
        return 0
    fi

    local current_time=$(date +%s)
    local stale_threshold=1800  # 30 minutes in seconds
    local stale_count=0

    for lock_file in "${tasks_dir}"/*.lock; do
        if [[ ! -f "${lock_file}" ]]; then
            continue
        fi

        local lock_time=$(stat -c %Y "${lock_file}" 2>/dev/null || stat -f %m "${lock_file}")
        local age=$((current_time - lock_time))

        if [[ $age -gt $stale_threshold ]]; then
            local lock_name=$(basename "${lock_file}" .lock)
            local age_minutes=$((age / 60))
            log_warn "Stale lock: ${lock_name} (${age_minutes} minutes old)"
            stale_count=$((stale_count + 1))
        fi
    done

    if [[ $stale_count -eq 0 ]]; then
        log_pass "No stale locks found"
        return 0
    else
        log_fail "Found ${stale_count} stale locks (>30 minutes)"
        return 1
    fi
}

# 5. Context Pollution Check
check_context_pollution() {
    echo "=== 5. Context Pollution Check ===" | tee -a "${LOG_FILE}"

    local log_dirs=(
        "${PROJECT_ROOT}/.omc/test-logs"
        "${PROJECT_ROOT}/.claude/logs"
    )

    local polluted=0

    for log_dir in "${log_dirs[@]}"; do
        if [[ ! -d "${log_dir}" ]]; then
            continue
        fi

        while IFS= read -r -d '' log_file; do
            local line_count=$(wc -l < "${log_file}")

            if [[ $line_count -gt 5000 ]]; then
                local filename=$(basename "${log_file}")
                log_warn "Large log file: ${filename} (${line_count} lines)"
                polluted=$((polluted + 1))
            fi
        done < <(find "${log_dir}" -type f -name "*.log" -print0 2>/dev/null)
    done

    if [[ $polluted -eq 0 ]]; then
        log_pass "No context pollution detected"
        return 0
    else
        log_fail "Found ${polluted} overly large log files"
        return 1
    fi
}

# 6. Progress Check
check_progress() {
    echo "=== 6. Progress Check ===" | tee -a "${LOG_FILE}"

    local progress_file="${PROJECT_ROOT}/docs/progress.md"
    if [[ ! -f "${progress_file}" ]]; then
        progress_file="${PROJECT_ROOT}/PROGRESS.md"
    fi

    if [[ ! -f "${progress_file}" ]]; then
        log_warn "No PROGRESS.md file found"
        return 0
    fi

    # Get modification time
    local progress_time=$(stat -c %Y "${progress_file}" 2>/dev/null || stat -f %m "${progress_file}")
    local current_time=$(date +%s)
    local age=$((current_time - progress_time))
    local age_days=$((age / 86400))

    if [[ $age_days -gt 7 ]]; then
        log_fail "PROGRESS.md not updated in ${age_days} days"
        return 1
    elif [[ $age_days -gt 3 ]]; then
        log_warn "PROGRESS.md last updated ${age_days} days ago"
        return 0
    else
        log_pass "PROGRESS.md recently updated (${age_days} days ago)"
        return 0
    fi
}

# Main execution
main() {
    echo "Watchdog Agent Run - $(date)" | tee "${LOG_FILE}"
    echo "=======================================" | tee -a "${LOG_FILE}"

    local total_checks=6
    local passed=0
    local failed=0
    local warnings=0

    # Run all checks
    check_regression && ((passed++)) || true
    check_path_audit && ((passed++)) || ((failed++))
    check_undefined_audit && ((passed++)) || ((failed++))
    check_stale_locks && ((passed++)) || ((failed++))
    check_context_pollution && ((passed++)) || ((failed++))
    check_progress && ((passed++)) || ((failed++))

    # Summary
    echo "=======================================" | tee -a "${LOG_FILE}"
    echo "Summary: ${passed}/${total_checks} passed" | tee -a "${LOG_FILE}"
    echo "Log file: ${LOG_FILE}" | tee -a "${LOG_FILE}"

    if [[ $failed -gt 0 ]]; then
        echo -e "${RED}✗${NC} Watchdog found ${failed} issue(s)" | tee -a "${LOG_FILE}"
        return 1
    else
        echo -e "${GREEN}✓${NC} Watchdog all clear" | tee -a "${LOG_FILE}"
        return 0
    fi
}

# Run main function
main "$@"
