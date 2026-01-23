#!/bin/bash
set -e

# Benchmark CI Runner
# Runs Mitata benchmarks and transforms output for benchmark-action

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT/packages/pike-lsp-server"

echo "Running benchmarks..."

# Run benchmarks and capture Mitata JSON output
MITATA_JSON="$PROJECT_ROOT/benchmark-results-mitata.json" pnpm benchmark

# Transform Mitata format to benchmark-action custom format
# Mitata: [{ name, group, iterations, total, average, min, max }]
# benchmark-action: [{ name, value, unit }]
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$PROJECT_ROOT/benchmark-results-mitata.json', 'utf8'));

const transformed = data.map(b => ({
  name: b.name,
  value: b.average,  // Use average time
  unit: 'ms',
  extra: JSON.stringify({
    min: b.min,
    max: b.max,
    iterations: b.iterations
  })
}));

fs.writeFileSync('$PROJECT_ROOT/benchmark-results.json', JSON.stringify(transformed, null, 2));
console.log('Transformed', transformed.length, 'benchmarks');
"

echo "Benchmarks completed. Results saved to $PROJECT_ROOT/benchmark-results.json"
