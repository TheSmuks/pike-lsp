#!/bin/bash
set -euo pipefail

PATTERN="from ['\"]node:test['\"]|require\(['\"]node:test['\"]\)"

matches=""

while IFS= read -r file; do
  case "$file" in
    docs/*|packages/*/dist/*|dist/*)
      continue
      ;;
  esac

  if grep -nE "$PATTERN" "$file" >/dev/null 2>&1; then
    hits=$(grep -nE "$PATTERN" "$file")
    matches+="$file\n$hits\n"
  fi
done < <(git ls-files '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs')

if [ -n "$matches" ]; then
  echo "FAILED: Found forbidden node:test imports. Use bun:test instead."
  echo ""
  printf "%b" "$matches"
  exit 1
fi

echo "node:test guard passed"
