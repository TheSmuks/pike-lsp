#!/usr/bin/env bash
# check-knowledge-base-updates.sh
# Enforces knowledge base freshness by checking for recent updates
#
# Usage:
#   scripts/check-knowledge-base-updates.sh          # Check mode
#   scripts/check-knowledge-base-updates.sh --warn    # Warn if stale
#   scripts/check-knowledge-base-updates.sh --strict  # Exit 1 if stale
#
# This script should run as part of pre-commit or CI to ensure
# agents are keeping the knowledge base up to date.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="${1:-check}"
WARN=false
STRICT=false

if [[ "$MODE" == "--warn" ]]; then
    WARN=true
elif [[ "$MODE" == "--strict" ]]; then
    STRICT=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STALE_DAYS=7
ISSUES=0
WARNINGS=0

issue() {
    echo -e "  ${RED}ISSUE${NC} $1"
    ISSUES=$((ISSUES + 1))
}

warn() {
    echo -e "  ${YELLOW}WARN${NC}  $1"
    WARNINGS=$((WARNINGS + 1))
}

ok() {
    echo -e "  ${GREEN}OK${NC}   $1"
}

echo -e "${BLUE}=== Knowledge Base Freshness Check ===${NC}"
echo ""

# Check for AGENT_VERIFICATION_MARKER in INDEX.md
echo -e "${BLUE}[1/4] Checking INDEX.md verification marker${NC}"
if grep -q "AGENT_VERIFICATION_MARKER" "$REPO_ROOT/.agent-knowledge/INDEX.md"; then
    marker=$(grep "AGENT_VERIFICATION_MARKER" "$REPO_ROOT/.agent-knowledge/INDEX.md" | head -1)
    ok "Verification marker found: $marker"
else
    issue "No AGENT_VERIFICATION_MARKER found in INDEX.md"
fi

# Check for SESSION_START.md
echo ""
echo -e "${BLUE}[2/4] Checking SESSION_START.md exists${NC}"
if [[ -f "$REPO_ROOT/.agent-knowledge/SESSION_START.md" ]]; then
    ok "SESSION_START.md exists"
    
    # Check if it has mandatory checklist
    if grep -q "MANDATORY" "$REPO_ROOT/.agent-knowledge/SESSION_START.md"; then
        ok "SESSION_START.md has mandatory checklist marker"
    else
        warn "SESSION_START.md missing mandatory marker"
    fi
else
    issue "SESSION_START.md does not exist - agents have no pre-task checklist"
fi

# Check for recent updates to knowledge base
echo ""
echo -e "${BLUE}[3/4] Checking for recent knowledge base updates${NC}"

KB_FILES=(
    "$REPO_ROOT/.agent-knowledge/INDEX.md"
    "$REPO_ROOT/.agent-knowledge/discoveries.md"
    "$REPO_ROOT/.agent-knowledge/patterns.md"
    "$REPO_ROOT/.agent-knowledge/gotchas.md"
    "$REPO_ROOT/.agent-knowledge/special-cases.md"
    "$REPO_ROOT/.agent-knowledge/SESSION_START.md"
)

most_recent_update=0
for file in "${KB_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        # Get last modification time in days since epoch
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            mod_time=$(stat -f %m "$file" 2>/dev/null || echo 0)
        else
            # Linux
            mod_time=$(stat -c %Y "$file" 2>/dev/null || echo 0)
        fi
        
        if [[ $mod_time -gt $most_recent_update ]]; then
            most_recent_update=$mod_time
        fi
    fi
done

if [[ $most_recent_update -gt 0 ]]; then
    current_time=$(date +%s)
    days_since_update=$(( (current_time - most_recent_update) / 86400 ))
    
    if [[ $days_since_update -gt $STALE_DAYS ]]; then
        if [[ $STRICT == true ]]; then
            issue "Knowledge base not updated in $days_since_update days (max: $STALE_DAYS)"
        else
            warn "Knowledge base not updated in $days_since_update days (max: $STALE_DAYS)"
        fi
    else
        ok "Knowledge base updated $days_since_update days ago (within $STALE_DAYS day limit)"
    fi
else
    warn "Could not determine knowledge base modification time"
fi

# Check for outdated entries in discoveries.md
echo ""
echo -e "${BLUE}[4/4] Checking discoveries.md for outdated entries${NC}"

# Count entries older than 30 days (simplified check)
discovery_count=$(grep -c "^## " "$REPO_ROOT/.agent-knowledge/discoveries.md" 2>/dev/null || echo 0)
if [[ $discovery_count -gt 0 ]]; then
    ok "Found $discovery_count discoveries documented"
    
    # Check for date format (YYYY-MM-DD)
    dated_entries=$(grep -c "## [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}" "$REPO_ROOT/.agent-knowledge/discoveries.md" 2>/dev/null || echo 0)
    if [[ $dated_entries -eq $discovery_count ]]; then
        ok "All discoveries have proper dates"
    else
        warn "Some discoveries missing proper date format (YYYY-MM-DD)"
    fi
else
    warn "No discoveries found in discoveries.md"
fi

# Summary
echo ""
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "  Issues:   ${RED}$ISSUES${NC}"
echo -e "  Warnings: ${YELLOW}$WARNINGS${NC}"

if [[ $STRICT == true ]] && [[ $ISSUES -gt 0 ]]; then
    echo ""
    echo -e "${RED}Strict mode: $ISSUES issues found. Knowledge base requires updates.${NC}"
    exit 1
fi

if [[ $ISSUES -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}Knowledge base freshness check passed!${NC}"
fi

exit 0
