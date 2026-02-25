import { spawnSync } from 'node:child_process';

type Options = {
  rounds: number;
  base: string;
  target: string;
  iterations: number;
  warmup: number;
  mitataTime: number;
  output: string;
  budget: string;
};

function parseArgs(): Options {
  const opts: Options = {
    rounds: 2,
    base: 'origin/main',
    target: 'HEAD',
    iterations: 2,
    warmup: 1,
    mitataTime: 200,
    output: 'benchmark-branch-compare.json',
    budget: 'scripts/benchmark-budgets.json',
  };

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.split('=');
    if (!key || value === undefined) continue;
    if (key === '--rounds') opts.rounds = Number(value);
    if (key === '--base') opts.base = value;
    if (key === '--target') opts.target = value;
    if (key === '--iterations') opts.iterations = Number(value);
    if (key === '--warmup') opts.warmup = Number(value);
    if (key === '--mitata-time') opts.mitataTime = Number(value);
    if (key === '--output') opts.output = value;
    if (key === '--budget') opts.budget = value;
  }

  if (!Number.isFinite(opts.rounds) || opts.rounds < 1) {
    throw new Error(`Invalid --rounds: ${opts.rounds}`);
  }

  return opts;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: '1',
      TZ: 'UTC',
      LANG: 'C',
      LC_ALL: 'C',
    },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}`);
  }
}

function main() {
  const opts = parseArgs();
  for (let round = 1; round <= opts.rounds; round++) {
    console.log(`\n=== Benchmark gate round ${round}/${opts.rounds} ===`);
    run('bun', [
      'run',
      'bench:compare-branches',
      '--',
      `--base=${opts.base}`,
      `--target=${opts.target}`,
      `--iterations=${opts.iterations}`,
      `--warmup=${opts.warmup}`,
      `--mitata-time=${opts.mitataTime}`,
      `--output=${opts.output}`,
    ]);
    run('bun', [
      'run',
      'bench:check-budgets',
      '--',
      `--report=${opts.output}`,
      `--budget=${opts.budget}`,
    ]);
  }
  console.log(`\nAll ${opts.rounds} benchmark gate rounds passed.`);
}

main();
