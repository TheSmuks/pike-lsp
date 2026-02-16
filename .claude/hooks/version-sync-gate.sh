#!/bin/bash
# version-sync-gate.sh — Warn when package.json versions drift from root.
#
# Hook: PostToolUse on Edit|Write
#
# Checks if the written file is a package.json and compares its version
# against the root package.json. Warns if they differ.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Edit and Write
if [[ "$TOOL" != "Edit" && "$TOOL" != "Write" ]]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only check package.json files
if [[ "$(basename "$FILE_PATH")" != "package.json" ]]; then
  exit 0
fi

# Find root package.json
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [[ -z "$REPO_ROOT" ]]; then
  exit 0
fi

ROOT_PKG="$REPO_ROOT/package.json"
if [[ ! -f "$ROOT_PKG" ]]; then
  exit 0
fi

# Skip if this IS the root package.json
if [[ "$(realpath "$FILE_PATH" 2>/dev/null)" == "$(realpath "$ROOT_PKG" 2>/dev/null)" ]]; then
  exit 0
fi

# Compare versions (read from disk — this is PostToolUse so file is already written)
ROOT_VERSION=$(jq -r '.version // empty' "$ROOT_PKG" 2>/dev/null)
FILE_VERSION=$(jq -r '.version // empty' "$FILE_PATH" 2>/dev/null)

if [[ -n "$ROOT_VERSION" && -n "$FILE_VERSION" && "$ROOT_VERSION" != "$FILE_VERSION" ]]; then
  echo "WARN: version-sync-gate | ${FILE_PATH} version ($FILE_VERSION) differs from root ($ROOT_VERSION) | Run: scripts/sync-versions.sh" >&2
fi

exit 0
