#!/bin/bash
set -e

# Benchmark CI Runner
# Runs Mitata benchmarks and saves results

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT/packages/pike-lsp-server"

echo "Running benchmarks..."
# We use tsx to run the runner directly. 
# We'll rely on the runner to output JSON if we tell it to, 
# or we'll capture the stdout and process it.
# For now, let's assume we want to pass a flag.

BENCHMARK_OUTPUT_FILE="$PROJECT_ROOT/benchmark-results.json"

# Run benchmarks using pnpm. runner.ts now handles MITATA_JSON as a file path.
MITATA_JSON="$BENCHMARK_OUTPUT_FILE" pnpm benchmark

echo "Benchmarks completed. Results saved to $BENCHMARK_OUTPUT_FILE"
