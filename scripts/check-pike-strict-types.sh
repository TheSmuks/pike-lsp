#!/bin/bash
set -euo pipefail

has_strict_types_at_top() {
  local file="$1"
  local line
  local line_no=0

  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))

    if [ "$line_no" -eq 1 ] && [[ "$line" =~ ^#! ]]; then
      continue
    fi

    if [[ "$line" =~ ^[[:space:]]*#pike[[:space:]]+ ]]; then
      continue
    fi

    if [[ "$line" =~ ^[[:space:]]*$ ]]; then
      continue
    fi

    if [[ "$line" =~ ^[[:space:]]*#pragma[[:space:]]+strict_types([[:space:]]|$) ]]; then
      return 0
    fi

    return 1
  done < "$file"

  return 1
}

failures=()

while IFS= read -r file; do
  if ! has_strict_types_at_top "$file"; then
    failures+=("$file")
  fi
done < <(git ls-files '*.pike' '*.pmod')

if [ "${#failures[@]}" -gt 0 ]; then
  echo "FAILED: Missing or misplaced '#pragma strict_types' in Pike files:"
  for file in "${failures[@]}"; do
    echo "  - $file"
  done
  exit 1
fi

echo "strict_types guard passed (${#failures[@]} violations)"
