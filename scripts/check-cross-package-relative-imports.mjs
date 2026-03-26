#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packagesDir = path.join(repoRoot, 'packages');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const IMPORT_REGEX = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"\n]+)['"]|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)|\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g;

const ignoredPathSegments = new Set([
  'dist',
  'build',
  'coverage',
  '.git',
  'node_modules',
  '.vscode-test',
]);

function walk(dirPath, visitor) {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredPathSegments.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walk(absolutePath, visitor);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    visitor(absolutePath);
  }
}

function packageNameFromPath(absolutePath) {
  const normalized = absolutePath.split(path.sep).join('/');
  const match = normalized.match(/\/packages\/([^/]+)\//);
  return match?.[1] ?? null;
}

function normalizedPath(value) {
  return value.split(path.sep).join('/');
}

const packageDirs = readdirSync(packagesDir)
  .map((entry) => path.join(packagesDir, entry))
  .filter((entryPath) => statSync(entryPath).isDirectory());

const violations = [];

for (const packageDir of packageDirs) {
  walk(packageDir, (absoluteFilePath) => {
    const sourcePackage = packageNameFromPath(absoluteFilePath);
    if (!sourcePackage) {
      return;
    }

    const content = readFileSync(absoluteFilePath, 'utf8');
    const importMatches = content.matchAll(IMPORT_REGEX);

    for (const match of importMatches) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier || !specifier.startsWith('../')) {
        continue;
      }

      const resolvedPath = path.resolve(path.dirname(absoluteFilePath), specifier);
      const targetPackage = packageNameFromPath(resolvedPath);

      if (!targetPackage || targetPackage === sourcePackage) {
        continue;
      }

      const lineNumber = content.slice(0, match.index ?? 0).split('\n').length;
      violations.push({
        file: normalizedPath(path.relative(repoRoot, absoluteFilePath)),
        line: lineNumber,
        specifier,
        sourcePackage,
        targetPackage,
      });
    }
  });
}

if (violations.length > 0) {
  console.error('Cross-package relative imports are not allowed.');
  console.error('Use workspace package imports (for example: @pike-lsp/core).');
  console.error('');

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line} (${violation.sourcePackage} -> ${violation.targetPackage}) ${violation.specifier}`
    );
  }

  process.exit(1);
}

console.log('No cross-package relative imports found.');
