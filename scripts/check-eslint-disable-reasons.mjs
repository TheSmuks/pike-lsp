import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.vscode-test',
]);
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const DISABLE_PATTERN = /(?:\/\/|\/\*+|\*)\s*eslint-disable(?:-next-line|-line)?(?:\s|$)/;
const REASON_PATTERN = /--\s*\S/;

function collectFiles(directory) {
  const entries = readdirSync(directory);
  const files = [];

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) {
      continue;
    }

    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    if (TARGET_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

function findViolations(filePath) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!DISABLE_PATTERN.test(line)) {
      continue;
    }

    if (!REASON_PATTERN.test(line)) {
      violations.push({
        filePath,
        line: i + 1,
        comment: line.trim(),
      });
    }
  }

  return violations;
}

function main() {
  const files = collectFiles(ROOT);
  const violations = files.flatMap(findViolations);

  if (violations.length === 0) {
    console.log('✅ All eslint-disable comments include an explicit reason.');
    return;
  }

  console.error('❌ Found eslint-disable comments without explicit reasons:');
  for (const violation of violations) {
    const relativePath = violation.filePath.replace(`${ROOT}/`, '');
    console.error(`- ${relativePath}:${violation.line} ${violation.comment}`);
  }
  console.error('Add a concise reason using: -- <reason>');
  process.exit(1);
}

main();
