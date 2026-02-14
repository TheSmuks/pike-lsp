#!/usr/bin/env bash
#
# CI Helper Script
#
# Provides clear, consistent commands for CI/PR workflow operations.
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Log file location
LOG_FILE="/tmp/ci-helper.log"

# Global flags
VERBOSE=0
QUIET=0

# ============================================================================
# FUNCTIONS
# ============================================================================

log() {
    [ $QUIET -eq 0 ] && echo "[$(date +%T%F %Y-%m-%d %H:%M:%S)] $*" >> "$LOG_FILE"
}

info() {
    [ $QUIET -eq 0 ] && log "$@"
    echo -e "${BLUE}[INFO]${NC}" "$*"
}

warn() {
    [ $QUIET -eq 0 ] && log "$@"
    echo -e "${YELLOW}[WARN]${NC}" "$*"
}

error() {
    [ $QUIET -eq 0 ] && log "$@"
    echo -e "${RED}[ERROR]${NC}" "$*"
}

success() {
    [ $QUIET -eq 0 ] && log "$@"
    echo -e "${GREEN}[SUCCESS]${NC}" "$*"
}

die() {
    error "$*"
    exit 1
}

# Check CI status for a specific PR
check_ci_status() {
    local pr_number="$1"
    local status="pending"

    local run_output
    run_output=$(gh pr checks "$pr_number" --json 2>/dev/null || true)

    if echo "$run_output" | grep -q '"status":"pending"'; then
        status="pending"
    elif echo "$run_output" | grep -q '"status":"in_progress"'; then
        status="running"
    elif echo "$run_output" | grep -q '"status":"completed"'; then
        status="completed"
    elif echo "$run_output" | grep -q '"status":"queued"'; then
        status="pending"
    fi

    echo "$status" | head -c1
}

# Wait for CI to complete
wait_for_ci() {
    local pr_number="$1"
    local timeout=300
    local elapsed=0
    local interval=5

    log "Waiting for CI to complete on PR #$pr_number..."

    while [ $elapsed -lt $timeout ]; do
        local current_status
        current_status=$(check_ci_status "$pr_number")
        if [ "$current_status" = "c" ]; then
            log "CI completed successfully after ${elapsed}s"
            return 0
        fi

        sleep $interval
        elapsed=$((elapsed + interval))
    done

    warn "CI wait timeout after ${timeout}s"
    return 1
}

# Get PR number from branch name
get_pr_number() {
    local branch="$1"
    pr_number=$(echo "$branch" | grep -oE '[0-9]+' | head -1)
    echo "${pr_number:-0}"
}

# List PR checks for a specific PR
list_pr_checks() {
    local pr_number="$1"
    gh pr checks "$pr_number" --json 2>/dev/null
}

# Get current branch
get_current_branch() {
    git branch --show-current
}

# Verify PR merge was successful
verify_merge() {
    local pr_number="$1"
    local expected_commit_msg="Merge pull request #${pr_number} from"

    local last_commit
    last_commit=$(git log -1 --pretty=%s | head -1)
    if echo "$last_commit" | grep -qF "$expected_commit_msg"; then
        success "Merge verification: PR #$pr_number merged successfully"
        return 0
    else
        error "Merge verification failed: expected '$expected_commit_msg' but got '$last_commit'"
        return 1
    fi
}

# Merge PR properly
merge_pr_main() {
    local pr_number="$1"
    local base_branch="main"

    info "Merging PR #$pr_number into $base_branch..."
    gh pr merge "$pr_number" --squash --delete-branch --merge "$base_branch"
}

# Show help
show_help() {
    cat << 'EOF'
CI Helper Commands:
  check-ci-status <pr-number>     - Check CI status for a PR
  list-pr-checks <pr-number>        - List all CI check statuses for a PR
  wait-for-ci <pr-number>            - Wait for CI to complete (max 5 min)
  get-pr-number <branch>            - Extract PR number from branch name
  list-checks <pr-number>          - List CI checks for current PR
  verify-merge <pr-number>          - Verify PR merge was successful
  merge-pr <pr-number>              - Merge PR using gh command
  current-branch                     - Show current git branch
  help                               - Show this help message

Flags:
  -v, --verbose                     - Enable verbose logging
  -q, --quiet                       - Suppress info messages

Examples:
  ci-helper.sh check-ci-status 123
  ci-helper.sh --verbose wait-for-ci 456
  ci-helper.sh verify-merge 789

EOF
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    local command=""

    # Ensure log directory exists
    if [ ! -d "$(dirname "$LOG_FILE")" ]; then
        mkdir -p "$(dirname "$LOG_FILE")"
    fi

    # Parse flags first
    while [ $# -gt 0 ]; do
        case "$1" in
            -v|--verbose)
                VERBOSE=1
                shift
                ;;
            -q|--quiet)
                QUIET=1
                shift
                ;;
            -*)
                error "Unknown flag: $1"
                exit 1
                ;;
            *)
                command="$1"
                shift
                break
                ;;
        esac
    done

    if [ -z "$command" ]; then
        error "No command specified"
        show_help
        exit 2
    fi

    # Execute command
    case "$command" in
        check-ci-status)
            if [ -z "$1" ]; then
                error "Usage: ci-helper.sh check-ci-status <pr-number>"
                exit 2
            fi
            check_ci_status "$1"
            ;;
        list-pr-checks)
            if [ -z "$1" ]; then
                error "Usage: ci-helper.sh list-pr-checks <pr-number>"
                exit 2
            fi
            list_pr_checks "$1"
            ;;
        wait-for-ci)
            if [ -z "$1" ]; then
                error "Usage: ci-helper.sh wait-for-ci <pr-number>"
                exit 2
            fi
            wait_for_ci "$1"
            ;;
        get-pr-number)
            if [ -z "$1" ]; then
                error "Usage: ci-helper.sh get-pr-number <branch-name>"
                exit 2
            fi
            get_pr_number "$1"
            ;;
        list-checks)
            local current_branch
            current_branch=$(get_current_branch)
            local pr_number
            pr_number=$(get_pr_number "$current_branch")
            info "Current branch: $current_branch (PR #$pr_number)"
            if [ "$pr_number" != "0" ]; then
                list_pr_checks "$pr_number"
            else
                warn "No PR number found in branch name"
            fi
            ;;
        verify-merge)
            if [ -z "$1" ]; then
                error "Usage: ci-helper.sh verify-merge <pr-number>"
                exit 2
            fi
            verify_merge "$1"
            ;;
        merge-pr)
            if [ -z "$1" ]; then
                error "Usage: ci-helper.sh merge-pr <pr-number>"
                exit 2
            fi
            merge_pr_main "$1"
            ;;
        current-branch)
            get_current_branch
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
