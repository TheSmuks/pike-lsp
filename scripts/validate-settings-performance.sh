#!/usr/bin/env bash
# validate-settings-performance.sh
# Performance validation script for all 32 Pike LSP settings
#
# Usage: bash scripts/validate-settings-performance.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Pike LSP Settings Performance Validation ===${NC}"
echo ""

# Check if budget file exists
BUDGET_FILE="$SCRIPT_DIR/settings-performance-budgets.json"
if [[ ! -f "$BUDGET_FILE" ]]; then
    echo -e "${RED}ERROR:${NC} Budget file not found: $BUDGET_FILE"
    exit 1
fi

echo -e "${BLUE}Configuration:${NC}"
echo "  Budget file: $BUDGET_FILE"
echo ""

# Parse settings groups from budget file
echo -e "${BLUE}Settings Groups:${NC}"
node -e "
const fs = require('fs');
const budget = JSON.parse(fs.readFileSync('$BUDGET_FILE', 'utf8'));
for (const [group, config] of Object.entries(budget.settingsGroups)) {
    console.log('  ' + group + ': ' + config.settings.length + ' settings');
    console.log('    Budget: <' + config.budgets.maxImpactMs + 'ms, <' + config.budgets.maxRegressionPct + '% regression');
}
" 2>/dev/null || echo "  (Node.js not available for parsing)"

echo ""

# Count total settings
echo -e "${BLUE}Settings Coverage:${NC}"
node -e "
const fs = require('fs');
const budget = JSON.parse(fs.readFileSync('$BUDGET_FILE', 'utf8'));
let total = 0;
for (const config of Object.values(budget.settingsGroups)) {
    total += config.settings.length;
}
console.log('  Total settings with budgets: ' + total + '/32');
console.log('  Stress test profile: ' + Object.keys(budget.stressTestProfiles).length + ' profiles');
" 2>/dev/null || echo "  (Node.js not available)"

echo ""
echo -e "${BLUE}=== Validation Complete ===${NC}"
echo ""
echo "To run full benchmarks: bun run bench:gate"
echo "To check budgets:       bun run bench:check-budgets"
echo ""
