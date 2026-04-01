import { describe, expect, it } from 'bun:test';
import { PikeBridge, type AnalyzeResponse, type PikeBridgeOptions } from '@pike-lsp/pike-bridge';
import { BridgePool } from '@pike-lsp/pike-bridge/dist/src/test-utils/bridge-pool.js';
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
const BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 4;
const CONCURRENCY = parseInt(
  process.env['PIKE_SOURCE_TREE_CONCURRENCY'] ?? String(DEFAULT_CONCURRENCY),
  10
);

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

function getBridgeOptionsForSourceTrees(mode: 'pike' | 'roxen'): PikeBridgeOptions {
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

  return {
    env: {
      PIKE_MODULE_PATH: modulePaths.join(path.delimiter),
      PIKE_INCLUDE_PATH: includePaths.join(path.delimiter),
      PIKE_PROGRAM_PATH: programPaths.join(path.delimiter),
    },
  };
}

function createBridgeForSourceTrees(mode: 'pike' | 'roxen'): PikeBridge {
  return new PikeBridge(getBridgeOptionsForSourceTrees(mode));
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
  treeName: string,
  root: string,
  mode: 'pike' | 'roxen',
  includeRoxenValidation: boolean
): Promise<void> {
  expect(fs.existsSync(root)).toBeTrue();
  const files = discoverPikeFiles(root);
  expect(files.length).toBeGreaterThan(0);

  console.log(
    `[${treeName}] Parsing ${files.length} files with ${CONCURRENCY} bridges (batch ${BATCH_SIZE})`
  );

  const pool = new BridgePool(getBridgeOptionsForSourceTrees(mode), { concurrency: CONCURRENCY });
  await pool.start();

  const violations: Violation[] = [];

  try {
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      chunks.push(files.slice(i, i + BATCH_SIZE));
    }

    let chunksDone = 0;
    await pool.dispatch(chunks, async (chunk, bridge) => {
      const inputs: Array<{ code: string; filename: string }> = [];

      for (const file of chunk) {
        try {
          inputs.push({ code: fs.readFileSync(file, 'utf-8'), filename: file });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          violations.push({ file, severity: 'error', message: `read failed: ${message}` });
        }
      }

      if (inputs.length === 0) return;

      try {
        const result = await bridge.batchParse(inputs);
        for (const fileResult of result.results) {
          for (const diag of fileResult.diagnostics) {
            if (diag.severity === 'error' || diag.severity === 'warning') {
              violations.push({
                file: fileResult.filename,
                severity: diag.severity,
                message: diag.message,
              });
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const input of inputs) {
          violations.push({
            file: input.filename,
            severity: 'error',
            message: `batchParse failed: ${message}`,
          });
        }
      }

      chunksDone++;
      if (chunksDone % 20 === 0 || chunksDone === chunks.length) {
        console.log(
          `[${treeName}] batchParse ${Math.min(chunksDone * BATCH_SIZE, files.length)}/${files.length}`
        );
      }
    });

    if (includeRoxenValidation) {
      const roxenFiles = files.filter(shouldRunRoxenValidation);
      if (roxenFiles.length > 0) {
        await pool.dispatch(roxenFiles, async (file, bridge) => {
          let code: string;
          try {
            code = fs.readFileSync(file, 'utf-8');
          } catch {
            return;
          }

          try {
            const roxenInfo = await bridge.roxenDetect(code, file);
            if (roxenInfo.is_roxen_module === 1) {
              const validation = await bridge.roxenValidate(
                code,
                file,
                roxenInfo as unknown as Record<string, unknown>
              );
              for (const diag of validation.diagnostics ?? []) {
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
        });
      }
    }
  } finally {
    await pool.stop();
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
  it('all Pike source files pass without errors or warnings', { timeout: 5_400_000 }, async () => {
    if (!PIKE_SRC) {
      throw new Error('PIKE_SRC is required when PIKE_SOURCE_TREE_TEST=1');
    }

    await assertTreeHasNoWarningsOrErrors('PIKE_SRC', PIKE_SRC, 'pike', false);
  });
});

describeRoxen('Source Tree E2E - Roxen strict diagnostics', () => {
  it('all Roxen source files pass without errors or warnings', { timeout: 5_400_000 }, async () => {
    if (!ROXEN_SRC) {
      throw new Error('ROXEN_SRC is required when PIKE_SOURCE_TREE_TEST=1');
    }

    await assertTreeHasNoWarningsOrErrors('ROXEN_SRC', ROXEN_SRC, 'roxen', false);
  });
});
