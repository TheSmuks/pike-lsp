#!/bin/bash
# Automated release preparation for pike-lsp
# Usage: scripts/prepare-release.sh [patch|minor|major|final] [--dry-run]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse args
BUMP_TYPE="${1:-}"
DRY_RUN=0

if [ "$2" = "--dry-run" ] || [ "$1" = "--dry-run" ]; then
    DRY_RUN=1
    echo -e "${BLUE}🔬 DRY RUN MODE - No changes will be made${NC}"
    echo ""
fi

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Get current version
CURRENT=$(node -p "require('./packages/vscode-pike/package.json').version")

# Function to bump version
bump_version() {
    local version="$1"
    local bump="$2"

    # Split version
    if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-([a-z]+)\.([0-9]+))?$ ]]; then
        local major="${BASH_REMATCH[1]}"
        local minor="${BASH_REMATCH[2]}"
        local patch="${BASH_REMATCH[3]}"
        local prereq="${BASH_REMATCH[4]}"
        local pretype="${BASH_REMATCH[5]}"
        local prenum="${BASH_REMATCH[6]}"

        case "$bump" in
            patch)
                if [ -n "$prereq" ]; then
                    # Increment pre-release number: alpha.3 -> alpha.4
                    prenum=$((prenum + 1))
                    echo "${major}.${minor}.${patch}-${pretype}.${prenum}"
                else
                    patch=$((patch + 1))
                    echo "${major}.${minor}.${patch}"
                fi
                ;;
            minor)
                minor=$((minor + 1))
                echo "${major}.${minor}.0"
                ;;
            major)
                major=$((major + 1))
                echo "${major}.0.0"
                ;;
            final)
                # Strip pre-release suffix: 0.1.0-alpha.3 -> 0.1.0
                echo "${major}.${minor}.${patch}"
                ;;
            *)
                echo "$version"
                ;;
        esac
    else
        echo "$version"
    fi
}

# Determine new version
if [ -z "$BUMP_TYPE" ]; then
    echo "Current version: $CURRENT"
    echo ""
    echo "Select bump type:"
    echo "  1) patch    - Bug fixes (0.1.0-alpha.3 → 0.1.0-alpha.4)"
    echo "  2) minor    - New features (0.1.0 → 0.2.0)"
    echo "  3) major    - Breaking changes (0.1.0 → 1.0.0)"
    echo "  4) final    - Stable release (0.1.0-alpha.3 → 0.1.0)"
    echo "  5) custom   - Enter version manually"
    echo ""
    read -p "Choice [1-5]: " choice

    case "$choice" in
        1) BUMP_TYPE="patch" ;;
        2) BUMP_TYPE="minor" ;;
        3) BUMP_TYPE="major" ;;
        4) BUMP_TYPE="final" ;;
        5)
            read -p "Enter new version: " NEW_VERSION
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            exit 1
            ;;
    esac
fi

if [ -z "$NEW_VERSION" ]; then
    NEW_VERSION=$(bump_version "$CURRENT" "$BUMP_TYPE")
fi

echo ""
echo -e "${BLUE}Version bump: $CURRENT → $NEW_VERSION${NC}"
echo ""

# Get git log for changelog
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LATEST_TAG" ]; then
    GIT_LOG=$(git log "$LATEST_TAG..HEAD" --oneline --no-merges 2>/dev/null || git log -1 --oneline)
else
    GIT_LOG=$(git log -10 --oneline --no-merges)
fi

# Generate CHANGELOG entry
TODAY=$(date +%Y-%m-%d)
CHANGELOG_ENTRY="## [$NEW_VERSION] - $TODAY

"

# Categorize commits
ADDED=""
CHANGED=""
FIXED=""
PERFORMANCE=""
DOCS=""

echo "Recent commits:"
echo "$GIT_LOG"
echo ""

# Parse commit messages for categorization
while IFS= read -r line; do
    if [[ $line =~ ^[a-f0-9]+\ (feat|add|new)(\(.*?\))?\:(.*)$ ]]; then
        ADDED="$ADDED${BASH_REMATCH[3]}\n"
    elif [[ $line =~ ^[a-f0-9]+\ (refactor|change|update)(\(.*?\))?\:(.*)$ ]]; then
        CHANGED="$CHANGED${BASH_REMATCH[3]}\n"
    elif [[ $line =~ ^[a-f0-9]+\ (fix|bugfix)(\(.*?\))?\:(.*)$ ]]; then
        FIXED="$FIXED${BASH_REMATCH[3]}\n"
    elif [[ $line =~ ^[a-f0-9]+\ (perf|performance)(\(.*?\))?\:(.*)$ ]]; then
        PERFORMANCE="$PERFORMANCE${BASH_REMATCH[3]}\n"
    elif [[ $line =~ ^[a-f0-9]+\ (docs|doc)(\(.*?\))?\:(.*)$ ]]; then
        DOCS="$DOCS${BASH_REMATCH[3]}\n"
    fi
done <<< "$GIT_LOG"

# Build changelog
if [ -n "$ADDED" ]; then
    CHANGELOG_ENTRY="${CHANGELOG_ENTRY}### Added
$(echo -e "$ADDED" | sed 's/^/- /' | sed 's/^[[:space:]]*//')
"
fi

if [ -n "$CHANGED" ]; then
    CHANGELOG_ENTRY="${CHANGELOG_ENTRY}### Changed
$(echo -e "$CHANGED" | sed 's/^/- /' | sed 's/^[[:space:]]*//')
"
fi

if [ -n "$FIXED" ]; then
    CHANGELOG_ENTRY="${CHANGELOG_ENTRY}### Fixed
$(echo -e "$FIXED" | sed 's/^/- /' | sed 's/^[[:space:]]*//')
"
fi

if [ -n "$PERFORMANCE" ]; then
    CHANGELOG_ENTRY="${CHANGELOG_ENTRY}### Performance
$(echo -e "$PERFORMANCE" | sed 's/^/- /' | sed 's/^[[:space:]]*//')
"
fi

if [ -n "$DOCS" ]; then
    CHANGELOG_ENTRY="${CHANGELOG_ENTRY}### Documentation
$(echo -e "$DOCS" | sed 's/^/- /' | sed 's/^[[:space:]]*//')
"
fi

echo "Generated CHANGELOG entry:"
echo "────────────────────────────────────"
echo -e "$CHANGELOG_ENTRY"
echo "────────────────────────────────────"
echo ""

# Confirmation
if [ $DRY_RUN -eq 0 ]; then
    read -p "Proceed with release? [y/N] " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo "Aborted"
        exit 0
    fi
fi

# 1. Update versions
echo -e "${BLUE}📦 Updating versions...${NC}"

if [ $DRY_RUN -eq 1 ]; then
    echo "  [DRY RUN] Would update package.json files to $NEW_VERSION"
else
    # Update root package.json
    temp=$(mktemp)
    jq ".version = \"$NEW_VERSION\"" package.json > "$temp" && mv "$temp" package.json

    # Sync version to ALL workspace packages
    bash scripts/sync-versions.sh

    echo -e "${GREEN}✅ Versions updated${NC}"
fi

# 2. Update CHANGELOG
echo -e "${BLUE}📝 Updating CHANGELOG.md...${NC}"

if [ $DRY_RUN -eq 1 ]; then
    echo "  [DRY RUN] Would insert CHANGELOG entry"
else
    # Insert after the first line (header)
    temp=$(mktemp)
    head -n 2 CHANGELOG.md > "$temp"
    echo -e "$CHANGELOG_ENTRY" >> "$temp"
    tail -n +3 CHANGELOG.md >> "$temp"
    mv "$temp" CHANGELOG.md

    echo -e "${GREEN}✅ CHANGELOG updated${NC}"
fi

# 3. Commit changes
if [ $DRY_RUN -eq 0 ]; then
    echo -e "${BLUE}📤 Committing changes...${NC}"
    git add package.json packages/*/package.json CHANGELOG.md
    git commit -m "chore(release): bump version to $NEW_VERSION"
    echo -e "${GREEN}✅ Committed${NC}"
fi

# 4. Create tag
if [ $DRY_RUN -eq 0 ]; then
    echo -e "${BLUE}🏷️  Creating git tag...${NC}"
    git tag "v$NEW_VERSION"
    echo -e "${GREEN}✅ Tag v$NEW_VERSION created${NC}"
else
    echo "  [DRY RUN] Would create tag v$NEW_VERSION"
fi

# 5. Push instructions
echo ""
echo "────────────────────────────────────"
echo -e "${GREEN}✅ Release prepared!${NC}"
echo ""
echo "Next steps:"
if [ $DRY_RUN -eq 0 ]; then
    echo "  1. Review changes: git log -1"
    echo "  2. Push to trigger release:"
    echo "     git push && git push --tags"
else
    echo "  [DRY RUN] Run without --dry-run to apply changes"
fi
echo ""
echo "This will trigger GitHub Actions to:"
echo "  - Build and test"
echo "  - Create GitHub release"
echo "  - Publish VSIX artifact"
echo "────────────────────────────────────"
