import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

type BenchmarkPoint = { name: string; value: number; unit: string };

type Options = {
  base: string;
  target: string;
  iterations: number;
  warmup: number;
  mitataTime: number;
  output: string;
};

function parseArgs(): Options {
  const defaults: Options = {
    base: 'origin/main',
    target: 'HEAD',
    iterations: 5,
    warmup: 1,
    mitataTime: 500,
    output: 'benchmark-branch-compare.json',
  };

  const args = process.argv.slice(2);
  for (const arg of args) {
    const [k, v] = arg.split('=');
    if (!k || v === undefined) continue;
    if (k === '--base') defaults.base = v;
    if (k === '--target') defaults.target = v;
    if (k === '--iterations') defaults.iterations = Number(v);
    if (k === '--warmup') defaults.warmup = Number(v);
    if (k === '--mitata-time') defaults.mitataTime = Number(v);
    if (k === '--output') defaults.output = v;
  }

  if (!Number.isFinite(defaults.iterations) || defaults.iterations <= 0) {
    throw new Error(`Invalid --iterations: ${defaults.iterations}`);
  }
  if (!Number.isFinite(defaults.warmup) || defaults.warmup < 0) {
    throw new Error(`Invalid --warmup: ${defaults.warmup}`);
  }
  if (!Number.isFinite(defaults.mitataTime) || defaults.mitataTime <= 0) {
    throw new Error(`Invalid --mitata-time: ${defaults.mitataTime}`);
  }

  return defaults;
}

function run(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  const res = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 100 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed in ${cwd}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`
    );
  }
  return res.stdout.trim();
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[index] ?? 0;
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function loadBenchmarkResults(repoPath: string): BenchmarkPoint[] {
  const raw = readFileSync(join(repoPath, 'benchmark-results.json'), 'utf8');
  const parsed = JSON.parse(raw) as BenchmarkPoint[];
  return parsed.filter(v => typeof v.name === 'string' && typeof v.value === 'number');
}

function transformMitataResult(mitataPath: string): BenchmarkPoint[] {
  const raw = readFileSync(mitataPath, 'utf8');
  const parsed = JSON.parse(raw) as {
    benchmarks?: Array<{ alias?: string; runs?: Array<{ stats?: { avg?: number } }> }>;
  };
  const rows = parsed.benchmarks ?? [];
  return rows.map(row => {
    const avgNs = row.runs?.[0]?.stats?.avg ?? 0;
    return {
      name: row.alias ?? 'unknown',
      value: avgNs / 1_000_000,
      unit: 'ms',
    };
  });
}

function runBenchmarkIteration(
  repoPath: string,
  mitataTime: number,
  tag: string
): BenchmarkPoint[] {
  const mitataOutput = join(repoPath, `benchmark-results-mitata-${tag}.json`);
  run('bun', ['run', 'benchmark'], join(repoPath, 'packages/pike-lsp-server'), {
    CI: '1',
    TZ: 'UTC',
    LANG: 'C',
    LC_ALL: 'C',
    MITATA_TIME: String(mitataTime),
    MITATA_JSON: mitataOutput,
  });

  if (!existsSync(mitataOutput)) {
    throw new Error(`Missing mitata output: ${mitataOutput}`);
  }

  return transformMitataResult(mitataOutput);
}

function aggregateRuns(
  runs: BenchmarkPoint[][]
): Record<string, { unit: string; values: number[] }> {
  const out: Record<string, { unit: string; values: number[] }> = {};
  for (const runValues of runs) {
    for (const row of runValues) {
      if (!out[row.name]) {
        out[row.name] = { unit: row.unit, values: [] };
      }
      out[row.name].values.push(row.value);
    }
  }
  return out;
}

function summarize(label: string, runs: BenchmarkPoint[][]) {
  const agg = aggregateRuns(runs);
  return Object.fromEntries(
    Object.entries(agg).map(([name, bucket]) => [
      name,
      {
        unit: bucket.unit,
        median: median(bucket.values),
        p95: percentile(bucket.values, 0.95),
        mean: mean(bucket.values),
        samples: bucket.values.length,
        raw: bucket.values,
      },
    ])
  );
}

function printComparison(baseSummary: Record<string, any>, targetSummary: Record<string, any>) {
  const names = Array.from(
    new Set([...Object.keys(baseSummary), ...Object.keys(targetSummary)])
  ).sort();
  console.log('Benchmark comparison (lower is better, based on median):');
  for (const name of names) {
    const b = baseSummary[name];
    const t = targetSummary[name];
    if (!b || !t) {
      console.log(`- ${name}: missing on ${!b ? 'base' : 'target'}`);
      continue;
    }
    const delta = t.median - b.median;
    const pct = b.median === 0 ? 0 : (delta / b.median) * 100;
    const sign = pct > 0 ? '+' : '';
    console.log(
      `- ${name}: base=${b.median.toFixed(3)}${b.unit}, target=${t.median.toFixed(3)}${t.unit}, delta=${sign}${pct.toFixed(2)}%`
    );
  }
}

function runBenchForRef(repoPath: string, ref: string, opts: Options): BenchmarkPoint[][] {
  run('git', ['checkout', '--quiet', ref], repoPath);
  run('bun', ['install', '--frozen-lockfile'], repoPath, {
    CI: '1',
    TZ: 'UTC',
    LANG: 'C',
    LC_ALL: 'C',
  });
  run('bash', ['scripts/setup-workspace-links.sh'], repoPath, {
    CI: '1',
    TZ: 'UTC',
    LANG: 'C',
    LC_ALL: 'C',
  });
  run('bun', ['run', 'build'], repoPath, {
    CI: '1',
    TZ: 'UTC',
    LANG: 'C',
    LC_ALL: 'C',
  });

  for (let i = 0; i < opts.warmup; i++) {
    runBenchmarkIteration(
      repoPath,
      opts.mitataTime,
      `${ref.replace(/[^a-zA-Z0-9_-]/g, '_')}-warmup-${i}`
    );
  }

  const runs: BenchmarkPoint[][] = [];
  for (let i = 0; i < opts.iterations; i++) {
    runs.push(
      runBenchmarkIteration(
        repoPath,
        opts.mitataTime,
        `${ref.replace(/[^a-zA-Z0-9_-]/g, '_')}-run-${i}`
      )
    );
  }
  return runs;
}

function main() {
  const opts = parseArgs();
  const sourceRepo = resolve(process.cwd());
  const tempRoot = mkdtempSync(join(tmpdir(), 'pike-bench-compare-'));
  const clonePath = join(tempRoot, 'repo');

  try {
    run('git', ['clone', '--no-local', sourceRepo, clonePath], sourceRepo);
    run('git', ['fetch', '--all', '--quiet'], clonePath);

    console.log(`Comparing base=${opts.base} vs target=${opts.target}`);
    console.log(
      `Iterations=${opts.iterations}, warmup=${opts.warmup}, mitataTime=${opts.mitataTime}`
    );

    const baseRuns = runBenchForRef(clonePath, opts.base, opts);
    const targetRuns = runBenchForRef(clonePath, opts.target, opts);

    const baseSummary = summarize('base', baseRuns);
    const targetSummary = summarize('target', targetRuns);
    printComparison(baseSummary, targetSummary);

    const output = {
      generatedAt: new Date().toISOString(),
      base: opts.base,
      target: opts.target,
      iterations: opts.iterations,
      warmup: opts.warmup,
      mitataTime: opts.mitataTime,
      baseSummary,
      targetSummary,
    };

    const outputPath = resolve(process.cwd(), opts.output);
    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Wrote comparison report: ${outputPath}`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
