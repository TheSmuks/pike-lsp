#!/bin/bash
set -e

# Benchmark CI Runner - Simplified for CI
# Runs a subset of benchmarks with minimal output

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT/packages/pike-lsp-server"

echo "Running CI benchmarks (subset)..."

# Run benchmarks with minimal output to stdout
# MITATA_JSON=file ensures JSON goes to file, not console
MITATA_JSON="$PROJECT_ROOT/benchmark-results-mitata.json" \
  MITATA_TIME=1000 \
  pnpm benchmark > /dev/null 2>&1

# Transform Mitata format to benchmark-action custom format
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$PROJECT_ROOT/benchmark-results-mitata.json', 'utf8'));

const transformed = data.map(b => ({
  name: b.name,
  value: b.average,
  unit: 'ms'
}));

fs.writeFileSync('$PROJECT_ROOT/benchmark-results.json', JSON.stringify(transformed, null, 2));
console.log('Transformed', transformed.length, 'benchmarks');
"

echo "CI benchmarks completed."
