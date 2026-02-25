#!/usr/bin/env bash
set -euo pipefail

bun run typecheck
bun run build

bun test "packages/pike-lsp-server/src/tests/query-engine-perf-gates.test.ts"

bun run bench:gate -- --rounds=2 --base=origin/main --target=HEAD --iterations=2 --warmup=1 --mitata-time=200 --output=benchmark-branch-compare.json --budget=scripts/benchmark-budgets.json

pike test/tests/cross-version-tests.pike

printf "\nqe2 promotion gates passed\n"
