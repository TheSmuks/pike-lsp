#!/bin/bash
set -e

# Benchmark CI Runner - Uses mitata for benchmarking
# Runs benchmarks with minimal output and transforms mitata format

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT/packages/pike-lsp-server"

echo "Running CI benchmarks..."

# Run benchmarks with JSON output to file
MITATA_JSON="$PROJECT_ROOT/benchmark-results-mitata.json" \
  MITATA_TIME=500 \
  bun run benchmark > /dev/null 2>&1

# Transform Mitata format to benchmark-action custom format
# Mitata: { benchmarks: [{ alias, runs: [{ stats: { avg } }] }] }
# benchmark-action: [{ name, value, unit }]
node -e "
const fs = require('fs');
const mitata = JSON.parse(fs.readFileSync('$PROJECT_ROOT/benchmark-results-mitata.json', 'utf8'));

const transformed = mitata.benchmarks.map(b => {
  // Get average time from first run (in nanoseconds)
  const avgNs = b.runs?.[0]?.stats?.avg || 0;
  // Convert to milliseconds
  const avgMs = avgNs / 1000000;
  return {
    name: b.alias || 'unknown',
    value: avgMs,
    unit: 'ms'
  };
});

fs.writeFileSync('$PROJECT_ROOT/benchmark-results.json', JSON.stringify(transformed, null, 2));
console.log('Transformed', transformed.length, 'benchmarks');
"

echo "CI benchmarks completed."
