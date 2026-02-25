import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SummaryRow = {
  unit: string;
  median: number;
  p95: number;
  mean: number;
  samples: number;
  raw: number[];
};

type CompareReport = {
  base: string;
  target: string;
  baseSummary: Record<string, SummaryRow>;
  targetSummary: Record<string, SummaryRow>;
};

type BudgetRule = {
  maxRegressionPct?: number;
  subMsMaxAbsoluteRegressionMs?: number;
};

type BudgetConfig = {
  defaultMaxRegressionPct: number;
  subMsCutoff: number;
  subMsMaxAbsoluteRegressionMs: number;
  benchmarks: Record<string, BudgetRule>;
};

function parseArgs(): { reportPath: string; budgetPath: string } {
  const defaults = {
    reportPath: 'benchmark-branch-compare.json',
    budgetPath: 'scripts/benchmark-budgets.json',
  };
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.split('=');
    if (!k || v === undefined) continue;
    if (k === '--report') defaults.reportPath = v;
    if (k === '--budget') defaults.budgetPath = v;
  }
  return defaults;
}

function loadJson<T>(filePath: string): T {
  const content = readFileSync(resolve(process.cwd(), filePath), 'utf8');
  return JSON.parse(content) as T;
}

function main() {
  const { reportPath, budgetPath } = parseArgs();
  const report = loadJson<CompareReport>(reportPath);
  const budgets = loadJson<BudgetConfig>(budgetPath);

  const failures: string[] = [];
  const checks = Object.entries(budgets.benchmarks);

  console.log(`Checking benchmark budgets for ${checks.length} critical paths`);
  console.log(`Base=${report.base} Target=${report.target}`);

  for (const [name, rule] of checks) {
    const base = report.baseSummary[name];
    const target = report.targetSummary[name];
    if (!base || !target) {
      failures.push(`${name}: missing in compare report`);
      continue;
    }

    const deltaMs = target.median - base.median;
    const deltaPct = base.median === 0 ? 0 : (deltaMs / base.median) * 100;
    const maxRegressionPct = rule.maxRegressionPct ?? budgets.defaultMaxRegressionPct;

    if (deltaPct <= maxRegressionPct) {
      console.log(
        `OK ${name}: base=${base.median.toFixed(3)}ms target=${target.median.toFixed(3)}ms delta=${deltaPct.toFixed(2)}%`
      );
      continue;
    }

    if (base.median < budgets.subMsCutoff) {
      const absLimit = rule.subMsMaxAbsoluteRegressionMs ?? budgets.subMsMaxAbsoluteRegressionMs;
      if (deltaMs <= absLimit) {
        console.log(
          `OK(noise) ${name}: delta=${deltaPct.toFixed(2)}% but abs=${deltaMs.toFixed(4)}ms <= ${absLimit.toFixed(4)}ms`
        );
        continue;
      }
    }

    failures.push(
      `${name}: regression ${deltaPct.toFixed(2)}% (base=${base.median.toFixed(3)}ms target=${target.median.toFixed(3)}ms)`
    );
  }

  if (failures.length > 0) {
    console.error('\nBenchmark budget failures:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\nAll benchmark budgets passed.');
}

main();
