import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PikeBridge, type AnalyzeResponse } from '@pike-lsp/pike-bridge';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Severity = 'error' | 'warning';

type Violation = {
  file: string;
  severity: Severity;
  message: string;
};

const RUN_SOURCE_TREE_E2E = process.env['PIKE_SOURCE_TREE_TEST'] === '1';
const PIKE_SRC = process.env['PIKE_SRC'] ?? process.env['PIKE_SOURCE_ROOT'];
const ROXEN_SRC = process.env['ROXEN_SRC'];

function splitPathEnv(value: string): string[] {
  return value
    .split(path.delimiter)
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const normalized = path.resolve(p);
    if (seen.has(normalized) || !fs.existsSync(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function inferPikeRoot(inputPath: string): string {
  const normalized = path.resolve(inputPath);
  if (normalized.endsWith(path.join('lib', 'modules'))) {
    return path.resolve(normalized, '..', '..');
  }
  if (normalized.endsWith(path.join('lib', 'include'))) {
    return path.resolve(normalized, '..', '..');
  }
  if (fs.existsSync(path.join(normalized, 'lib', 'modules'))) {
    return normalized;
  }
  return normalized;
}

function createBridgeForSourceTrees(mode: 'pike' | 'roxen'): PikeBridge {
  const pikeRoot = PIKE_SRC ? inferPikeRoot(PIKE_SRC) : '';
  const modulePaths = dedupePaths([
    ...splitPathEnv(process.env['PIKE_MODULE_PATH'] ?? ''),
    pikeRoot ? path.join(pikeRoot, 'lib', 'modules') : '',
    mode === 'roxen' && ROXEN_SRC ? path.join(ROXEN_SRC, 'server', 'etc', 'modules') : '',
    mode === 'roxen' && ROXEN_SRC ? path.join(ROXEN_SRC, 'server', 'modules') : '',
    mode === 'roxen' && ROXEN_SRC ? path.join(ROXEN_SRC, 'server', 'more_modules') : '',
  ]);

  const includePaths = dedupePaths([
    ...splitPathEnv(process.env['PIKE_INCLUDE_PATH'] ?? ''),
    pikeRoot ? path.join(pikeRoot, 'lib', 'include') : '',
    mode === 'roxen' && ROXEN_SRC ? path.join(ROXEN_SRC, 'server', 'etc', 'include') : '',
  ]);

  const programPaths = dedupePaths([
    ...splitPathEnv(process.env['PIKE_PROGRAM_PATH'] ?? ''),
    pikeRoot ? path.join(pikeRoot, 'lib') : '',
    mode === 'roxen' && ROXEN_SRC ? path.join(ROXEN_SRC, 'server', 'base_server') : '',
    mode === 'roxen' && ROXEN_SRC ? path.join(ROXEN_SRC, 'server') : '',
  ]);

  return new PikeBridge({
    env: {
      PIKE_MODULE_PATH: modulePaths.join(path.delimiter),
      PIKE_INCLUDE_PATH: includePaths.join(path.delimiter),
      PIKE_PROGRAM_PATH: programPaths.join(path.delimiter),
    },
  });
}

function discoverPikeFiles(root: string): string[] {
  const files: string[] = [];
  const skip = new Set(['.git', '.omc', 'build', 'node_modules']);

  const walk = (dir: string): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (skip.has(entry.name)) {
        continue;
      }

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      if (entry.isFile() && (entry.name.endsWith('.pike') || entry.name.endsWith('.pmod'))) {
        files.push(full);
      }
    }
  };

  walk(root);
  files.sort();
  return files;
}

function collectViolations(result: AnalyzeResponse, file: string): Violation[] {
  const violations: Violation[] = [];

  if (result.failures?.parse) {
    violations.push({
      file,
      severity: 'error',
      message: `parse failed: ${result.failures.parse.message}`,
    });
  }

  if (result.failures?.diagnostics) {
    violations.push({
      file,
      severity: 'error',
      message: `diagnostics failed: ${result.failures.diagnostics.message}`,
    });
  }

  for (const diag of result.result?.parse?.diagnostics ?? []) {
    if (diag.severity === 'error' || diag.severity === 'warning') {
      violations.push({ file, severity: diag.severity, message: diag.message });
    }
  }

  for (const diag of result.result?.diagnostics?.diagnostics ?? []) {
    violations.push({ file, severity: 'warning', message: diag.message });
  }

  return violations;
}

function shouldRunRoxenValidation(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  return normalized.includes('/server/modules/');
}

async function assertTreeHasNoWarningsOrErrors(
  bridge: PikeBridge,
  treeName: string,
  root: string,
  includeRoxenValidation: boolean
): Promise<void> {
  expect(fs.existsSync(root)).toBeTrue();
  const files = discoverPikeFiles(root);
  expect(files.length).toBeGreaterThan(0);

  const violations: Violation[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!;
    if ((i + 1) % 100 === 0) {
      console.log(`[${treeName}] ${i + 1}/${files.length}`);
    }

    let code = '';
    try {
      code = fs.readFileSync(file, 'utf-8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      violations.push({ file, severity: 'error', message: `read failed: ${message}` });
      continue;
    }

    try {
      const result = await bridge.analyze(code, ['parse'], file);
      violations.push(...collectViolations(result, file));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      violations.push({ file, severity: 'error', message: `analyze failed: ${message}` });
      continue;
    }

    if (includeRoxenValidation && shouldRunRoxenValidation(file)) {
      try {
        const roxenInfo = await bridge.roxenDetect(code, file);
        if (roxenInfo.is_roxen_module === 1) {
          const roxenValidation = await bridge.roxenValidate(code, file, roxenInfo);
          for (const diag of roxenValidation.diagnostics ?? []) {
            if (diag.severity === 'error' || diag.severity === 'warning') {
              violations.push({ file, severity: diag.severity, message: diag.message });
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        violations.push({
          file,
          severity: 'error',
          message: `roxen validation failed: ${message}`,
        });
      }
    }
  }

  if (violations.length > 0) {
    const preview = violations
      .slice(0, 25)
      .map(v => `${v.severity.toUpperCase()} ${path.relative(root, v.file)} :: ${v.message}`)
      .join('\n');

    throw new Error(
      `${treeName} produced ${violations.length} error/warning diagnostics across ${files.length} files.\n${preview}`
    );
  }
}

const describePike = RUN_SOURCE_TREE_E2E ? describe : describe.skip;
const describeRoxen = RUN_SOURCE_TREE_E2E ? describe : describe.skip;

describePike('Source Tree E2E - Pike 8 strict diagnostics', () => {
  let bridge: PikeBridge | undefined;

  beforeAll(async () => {
    if (!PIKE_SRC) {
      throw new Error('PIKE_SRC is required when PIKE_SOURCE_TREE_TEST=1');
    }

    bridge = createBridgeForSourceTrees('pike');
    await bridge.start();
    bridge.on('stderr', () => {});
  });

  afterAll(async () => {
    if (bridge) {
      await bridge.stop();
    }
  });

  it('all Pike source files pass without errors or warnings', { timeout: 5_400_000 }, async () => {
    await assertTreeHasNoWarningsOrErrors(bridge!, 'PIKE_SRC', PIKE_SRC!, false);
  });
});

describeRoxen('Source Tree E2E - Roxen strict diagnostics', () => {
  let bridge: PikeBridge | undefined;

  beforeAll(async () => {
    if (!ROXEN_SRC) {
      throw new Error('ROXEN_SRC is required when PIKE_SOURCE_TREE_TEST=1');
    }

    bridge = createBridgeForSourceTrees('roxen');
    await bridge.start();
    bridge.on('stderr', () => {});
  });

  afterAll(async () => {
    if (bridge) {
      await bridge.stop();
    }
  });

  it('all Roxen source files pass without errors or warnings', { timeout: 5_400_000 }, async () => {
    await assertTreeHasNoWarningsOrErrors(bridge!, 'ROXEN_SRC', ROXEN_SRC!, false);
  });
});
