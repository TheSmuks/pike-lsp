#!/bin/bash
# Sync version numbers from root package.json to all workspace packages

set -e

# Get version from root package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "Root version: $VERSION"

# Update all workspace packages
for pkg_dir in packages/*/; do
  pkg_json="$pkg_dir/package.json"
  if [ -f "$pkg_json" ]; then
    echo "Updating $pkg_json"
    # Update version field (preserve formatting)
    tmp=$(mktemp)
    jq --arg v "$VERSION" '.version = $v' "$pkg_json" > "$tmp"
    mv "$tmp" "$pkg_json"
  fi
done

echo "Version synced to $VERSION"
echo "Run 'git add packages/*/package.json' to commit changes."
