#!/usr/bin/env bash
# start-work.sh — Blessed entry point for all development work
#
# This is the ONLY supported way to start work in this repository.
# It creates a linked worktree with proper isolation for parallel development.
#
# Usage:
#   ./start-work.sh fix/bug-description
#   ./start-work.sh feat/new-feature
#   ./start-work.sh refactor/component-name
#
# The script will:
#   1. Sync with latest main
#   2. Create a linked worktree at ../pike-lsp-<branch>
#   3. Set up the branch and environment
#   4. Tell you where to work

set -euo pipefail

# Colors for readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

# Validate arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Error: Branch name required${NC}"
    echo ""
    echo "Usage:"
    echo "  ./start-work.sh fix/short-description"
    echo "  ./start-work.sh feat/feature-name"
    echo "  ./start-work.sh refactor/component"
    echo ""
    echo "Examples:"
    echo "  ./start-work.sh fix/completion-race"
    echo "  ./start-work.sh feat/hover-types"
    echo "  ./start-work.sh refactor/bridge-pool"
    exit 1
fi

BRANCH_NAME="$1"

# Validate branch name format
if [[ ! "$BRANCH_NAME" =~ ^(fix|feat|refactor|docs|test|chore|perf)/[a-z0-9-]+$ ]]; then
    echo -e "${YELLOW}Warning: Branch name '$BRANCH_NAME' doesn't follow recommended pattern${NC}"
    echo "Recommended: {type}/short-description"
    echo "  Types: fix, feat, refactor, docs, test, chore, perf"
    echo "  Example: fix/completion-race"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if scripts/worktree.sh exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_SCRIPT="$SCRIPT_DIR/scripts/worktree.sh"

if [ ! -x "$WORKTREE_SCRIPT" ]; then
    echo -e "${RED}Error: worktree.sh not found at $WORKTREE_SCRIPT${NC}"
    echo "Repository may be in an unexpected state."
    exit 1
fi

# Run the actual worktree creation
echo -e "${BLUE}Creating worktree for branch: $BRANCH_NAME${NC}"
"$WORKTREE_SCRIPT" create "$BRANCH_NAME"

# Get the worktree path for the success message
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
PARENT_DIR=$(dirname "$REPO_ROOT")
SANITIZED_BRANCH=$(echo "$BRANCH_NAME" | sed 's|/|-|g')
WORKTREE_PATH="${PARENT_DIR}/${REPO_NAME}-${SANITIZED_BRANCH}"

echo ""
echo -e "${GREEN}✓ Worktree created successfully${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Navigate to your worktree:"
echo -e "     ${YELLOW}cd $WORKTREE_PATH${NC}"
echo ""
echo "  2. Install dependencies (if first time):"
echo -e "     ${YELLOW}bun install${NC}"
echo ""
echo "  3. Start working on your changes"
echo ""
echo "  4. When done, create a PR from this worktree"
echo ""
echo "  5. Clean up when merged:"
echo -e "     ${YELLOW}cd $REPO_ROOT && ./start-work.sh --cleanup${NC}"
echo ""

# Show current worktrees
echo -e "${BLUE}Your active worktrees:${NC}"
git worktree list --porcelain 2>/dev/null | grep "^worktree " | sed 's/^worktree /  - /' || true
echo ""
