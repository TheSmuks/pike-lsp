#!/bin/bash
# Manual release for alpha.39
set -euo pipefail

NEW_VERSION="0.1.0-alpha.39"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== RELEASING v$NEW_VERSION ==="

# Update workspace versions
for pkg in packages/*/package.json; do
  if [ -f "$pkg" ]; then
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$pkg"
    echo "Updated: $pkg"
  fi
done

# Update root version
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "Updated: package.json"

echo "Done updating versions to $NEW_VERSION"
