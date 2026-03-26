#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
cd "$REPO_ROOT"

LOCKFILES=(package-lock.json yarn.lock)

for lockfile in "${LOCKFILES[@]}"; do
  if git ls-files --error-unmatch "$lockfile" >/dev/null 2>&1 || [ -e "$lockfile" ]; then
    echo "ERROR: Forbidden lockfile present: $lockfile"
    echo "This repository uses bun exclusively. Remove the file and keep it untracked."
    exit 1
  fi
done

echo "OK: No forbidden package manager lockfiles found"
