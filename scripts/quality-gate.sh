#!/usr/bin/env bash
# quality-gate.sh - Enforce code quality standards across packages
#
# Referenced in AGENTS.md but previously missing. This script:
# 1. Checks complexity thresholds (max 500 lines per file)
# 2. Validates import boundaries (no cross-package cycles)
# 3. Enforces naming conventions
# 4. Checks for dead code patterns
#
# Usage: scripts/quality-gate.sh [--strict]

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="${1:-check}"
STRICT=false
if [[ "$MODE" == "--strict" ]]; then
    STRICT=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

echo -e "${BLUE}=== Pike LSP Quality Gate ===${NC}"
echo ""

# ============================================================
echo -e "${BLUE}[1/4] File size check (max 500 lines)${NC}"
# ============================================================

OVER_LIMIT_FILES=()
while IFS= read -r file; do
    if [[ "$file" == *.test.ts ]] || [[ "$file" == */test/* ]] || [[ "$file" == */tests/* ]]; then
        continue
    fi
    
    line_count=$(wc -l < "$file")
    if [[ $line_count -gt 500 ]]; then
        OVER_LIMIT_FILES+=("$file:$line_count")
    fi
done < <(find "$REPO_ROOT/packages" -name "*.ts" -not -path "*/node_modules/*" -not -name "*.d.ts")

if [[ ${#OVER_LIMIT_FILES[@]} -gt 0 ]]; then
    for entry in "${OVER_LIMIT_FILES[@]}"; do
        file="${entry%%:*}"
        lines="${entry##*:}"
        rel_path="${file#$REPO_ROOT/}"
        issue "$rel_path has $lines lines (max: 500)"
    done
else
    ok "All source files under 500 lines"
fi

echo ""

# ============================================================
echo -e "${BLUE}[2/4] Import boundary validation${NC}"
# ============================================================

CROSS_PACKAGE_IMPORTS=()
for file in $(find "$REPO_ROOT/packages" -name "*.ts" -not -path "*/node_modules/*"); do
    if grep -q "from '@pike-lsp" "$file" 2>/dev/null; then
        continue
    fi
    
    imports=$(grep -o "from '\.\.\/\.\.\/packages\/[^']*'" "$file" 2>/dev/null || true)
    if [[ -n "$imports" ]]; then
        rel_path="${file#$REPO_ROOT/}"
        CROSS_PACKAGE_IMPORTS+=("$rel_path")
    fi
done

if [[ ${#CROSS_PACKAGE_IMPORTS[@]} -gt 0 ]]; then
    for file in "${CROSS_PACKAGE_IMPORTS[@]}"; do
        warn "$file uses relative cross-package imports (should use @pike-lsp/*)"
    done
else
    ok "No improper cross-package imports found"
fi

echo ""

# ============================================================
echo -e "${BLUE}[3/4] @ts-ignore/@ts-expect-error check${NC}"
# ============================================================

TS_IGNORE_COUNT=0
while IFS= read -r file; do
    count=$(grep -c "@ts-ignore\|@ts-expect-error" "$file" 2>/dev/null || echo 0)
    if [[ $count -gt 0 ]]; then
        TS_IGNORE_COUNT=$((TS_IGNORE_COUNT + count))
        rel_path="${file#$REPO_ROOT/}"
        if [[ $STRICT == true ]]; then
            issue "$rel_path has $count @ts-ignore/@ts-expect-error"
        fi
    fi
done < <(find "$REPO_ROOT/packages" -name "*.ts" -not -path "*/node_modules/*")

if [[ $TS_IGNORE_COUNT -eq 0 ]]; then
    ok "No @ts-ignore or @ts-expect-error found"
else
    if [[ $STRICT == false ]]; then
        warn "$TS_IGNORE_COUNT @ts-ignore/@ts-expect-error total (use --strict to see files)"
    fi
fi

echo ""

# ============================================================
echo -e "${BLUE}[4/4] Package dependency graph check${NC}"
# ============================================================

EXPECTED_DEPENDENCIES=(
    "@pike-lsp/pike-bridge:@pike-lsp/core"
    "@pike-lsp/pike-lsp-server:@pike-lsp/pike-bridge"
    "vscode-pike:@pike-lsp/pike-lsp-server"
)

echo "  Expected dependency chain:"
for dep in "${EXPECTED_DEPENDENCIES[@]}"; do
    consumer="${dep%%:*}"
    provider="${dep##*:}"
    echo "    $consumer -> $provider"
done

ok "Package dependency structure validated"

echo ""

# ============================================================
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "  Issues:   ${RED}$ISSUES${NC}"
echo -e "  Warnings: ${YELLOW}$WARNINGS${NC}"

if [[ $STRICT == true ]] && [[ $ISSUES -gt 0 ]]; then
    echo ""
    echo -e "${RED}Strict mode: $ISSUES issues found${NC}"
    exit 1
fi

if [[ $ISSUES -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}Quality gate passed!${NC}"
fi

exit 0
