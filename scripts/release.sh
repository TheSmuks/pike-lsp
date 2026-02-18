#!/bin/bash
# release.sh - Deterministic release script
set -euo pipefail

VERSION="${1:-patch}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== RELEASE: $VERSION ==="

# 1. Get current version
CURRENT=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT"

# 2. Calculate new version
if [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$VERSION"
else
  NEW_VERSION=$(npm version "$VERSION" --no-git-tag-version 2>/dev/null | sed 's/v//')
fi
echo "New version: $NEW_VERSION"

# 3. Update workspace versions
for pkg in packages/*/package.json; do
  if [ -f "$pkg" ]; then
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$pkg"
    echo "  Updated: $pkg"
  fi
done

# 4. Update root version
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "  Updated: package.json"

# 5. Update CHANGELOG
if [ -f CHANGELOG.md ]; then
  {
    echo ""
    echo "## $NEW_VERSION"
    echo ""
    echo "Released: $(date '+%Y-%m-%d')"
    echo ""
    git log --oneline -20 2>/dev/null || echo "Changes since last release"
  } > CHANGELOG.tmp
  cat CHANGELOG.md >> CHANGELOG.tmp
  mv CHANGELOG.tmp CHANGELOG.md
  echo "  Updated: CHANGELOG.md"
fi

# 6. Build
echo "Building..."
bun run build

# 7. Create commit and tag
echo "Creating commit and tag..."
git add -A
git commit -m "Release v$NEW_VERSION" || echo "No changes to commit"
git tag "v$NEW_VERSION"

# 8. Push
echo "Pushing..."
git push origin main --tags 2>/dev/null || echo "Push skipped (may need authentication)"

echo ""
echo "=== RELEASED v$NEW_VERSION ==="
echo "Next steps:"
echo "  - Publish packages: npm publish --access public"
echo "  - Create GitHub release: gh release create v$NEW_VERSION"
