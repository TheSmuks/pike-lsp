#!/bin/bash
# Pre-push release validation for pike-lsp
# Usage: scripts/check-release.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Checking release readiness..."

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 1. Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  Uncommitted changes detected${NC}"
    git status --short
    echo ""
fi

# 2. Get versions
ROOT_VERSION=$(node -p "require('./package.json').version")
EXT_VERSION=$(node -p "require('./packages/vscode-pike/package.json').version")

echo "📦 Version check:"
echo "  Root:    $ROOT_VERSION"
echo "  Ext:     $EXT_VERSION"

if [ "$ROOT_VERSION" != "$EXT_VERSION" ]; then
    echo -e "${RED}❌ Version mismatch!${NC}"
    echo "  package.json and packages/vscode-pike/package.json must match"
    exit 1
fi
echo -e "${GREEN}✅ Versions match${NC}"

# 3. Get latest tag
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
echo "🏷️  Latest tag: $LATEST_TAG"

# 4. Check if version bump needed
if [ "$LATEST_TAG" != "v$ROOT_VERSION" ]; then
    echo -e "${YELLOW}⚠️  Current version ($ROOT_VERSION) differs from latest tag ($LATEST_TAG)${NC}"
    echo "  This suggests a version bump is in progress or needed"
else
    echo -e "${GREEN}✅ Version matches latest tag${NC}"
fi

# 5. Check CHANGELOG
echo ""
echo "📝 CHANGELOG.md check:"
if grep -q "\[$ROOT_VERSION\]" CHANGELOG.md 2>/dev/null; then
    echo -e "${GREEN}✅ CHANGELOG has entry for $ROOT_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  No CHANGELOG entry found for $ROOT_VERSION${NC}"
    echo "  Add an entry before releasing"
fi

# 6. Check for existing GitHub release
if command -v gh &> /dev/null; then
    echo ""
    echo "🚀 GitHub releases:"
    gh release list --limit 3 2>/dev/null || echo "  (gh not configured)"
fi

# 7. Summary
echo ""
echo "────────────────────────────────────"
echo "Current version: $ROOT_VERSION"
echo "Latest tag: $LATEST_TAG"

if [ "$LATEST_TAG" = "v$ROOT_VERSION" ] && [ -z "$(git status --porcelain)" ]; then
    echo -e "${GREEN}✅ Ready to push (or bump version for new release)${NC}"
elif [ "$LATEST_TAG" != "v$ROOT_VERSION" ]; then
    echo -e "${YELLOW}⚠️  Version changed from $LATEST_TAG → $ROOT_VERSION${NC}"
    echo "  Commit version bump and tag with: git tag v$ROOT_VERSION"
else
    echo -e "${YELLOW}⚠️  Has uncommitted changes${NC}"
fi
