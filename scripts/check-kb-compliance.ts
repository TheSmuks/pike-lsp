#!/usr/bin/env bun
/**
 * KB Compliance Checker
 *
 * Validates Knowledge Base entries against the enforcement policy.
 *
 * Usage:
 *   bun run scripts/check-kb-compliance.ts
 *   bun run scripts/check-kb-compliance.ts --staged
 *   bun run scripts/check-kb-compliance.ts --pr-base main
 */

import { parseArgs } from 'util';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Parse arguments
const { values } = parseArgs({
  args: Bun.argv,
  options: {
    staged: { type: 'boolean' },
    'pr-base': { type: 'string' },
  },
  strict: false,
  allowPositionals: true,
});

const isStaged = values.staged ?? false;
const prBase = values['pr-base'];

// Domain enum
const VALID_DOMAINS = ['ARCH', 'PATTERN', 'DEBUG', 'TEST', 'CI', 'WORKFLOW'];

// KB ID regex: KB-{DOMAIN}-{YYYYMMDD}-{SEQ}
const KB_ID_REGEX = /^KB-(ARCH|PATTERN|DEBUG|TEST|CI|WORKFLOW)-\d{8}-\d{3}$/;

// @kb annotation regex
const KB_ANNOTATION_REGEX = /\/\/\s*@kb\s+(KB-[A-Z]+-\d{8}-\d{3})/g;

interface KBEntry {
  id: string;
  domain: string;
  date: string;
  summary: string;
  codeReferences: string[];
  filePath: string;
}

interface Violation {
  type: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
}

const violations: Violation[] = [];

// Get changed files
function getChangedFiles(): string[] {
  if (isStaged) {
    return execSync('git diff --cached --name-only', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(f => f.length > 0);
  }
  if (prBase) {
    return execSync(`git diff --name-only ${prBase}...HEAD`, { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(f => f.length > 0);
  }
  // Default: all files
  return execSync('git ls-files', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(f => f.length > 0);
}

// Get all KB files
function getKBFiles(): string[] {
  const kbFiles: string[] = [];
  const domains = ['architecture', 'testing', 'ci-cd', 'workflows', 'reference'];

  for (const domain of domains) {
    try {
      const files = glob.sync(`.agent-knowledge/${domain}/*.md`);
      kbFiles.push(...files);
    } catch {
      // Directory might not exist
    }
  }

  return kbFiles.filter(f => !f.endsWith('INDEX.md'));
}

// Parse frontmatter from markdown
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter: Record<string, unknown> = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    // Handle arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(s => s.length > 0);
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return frontmatter;
}

// Validate KB entry
function validateKBEntry(filePath: string): KBEntry | null {
  const content = readFileSync(filePath, 'utf-8');
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter) {
    violations.push({
      type: 'error',
      message: `Missing frontmatter in ${filePath}`,
      file: filePath,
    });
    return null;
  }

  // Required fields
  const required = ['id', 'domain', 'date', 'summary', 'code_references'];
  for (const field of required) {
    if (!frontmatter[field]) {
      violations.push({
        type: 'error',
        message: `Missing required field '${field}' in ${filePath}`,
        file: filePath,
      });
    }
  }

  // Validate ID format
  const id = frontmatter.id as string;
  if (id && !KB_ID_REGEX.test(id)) {
    violations.push({
      type: 'error',
      message: `Invalid KB ID format: ${id}. Expected: KB-{DOMAIN}-{YYYYMMDD}-{SEQ}`,
      file: filePath,
    });
  }

  // Validate domain
  const domain = frontmatter.domain as string;
  if (domain && !VALID_DOMAINS.includes(domain)) {
    violations.push({
      type: 'error',
      message: `Invalid domain: ${domain}. Valid: ${VALID_DOMAINS.join(', ')}`,
      file: filePath,
    });
  }

  // Validate date
  const date = frontmatter.date as string;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    violations.push({
      type: 'error',
      message: `Invalid date format: ${date}. Expected: YYYY-MM-DD`,
      file: filePath,
    });
  }

  return {
    id: id || '',
    domain: domain || '',
    date: date || '',
    summary: (frontmatter.summary as string) || '',
    codeReferences: (frontmatter.code_references as string[]) || [],
    filePath,
  };
}

// Extract @kb annotations from code
function extractKBAnnotations(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const annotations: string[] = [];

  let match;
  while ((match = KB_ANNOTATION_REGEX.exec(content)) !== null) {
    annotations.push(match[1]);
  }

  return annotations;
}

// Main
async function main() {
  console.log('🔍 KB Compliance Check\n');

  const changedFiles = getChangedFiles();
  const kbFiles = getKBFiles();
  const changedKBFiles = changedFiles.filter(f => f.startsWith('.agent-knowledge/'));
  const changedCodeFiles = changedFiles.filter(
    f => f.startsWith('packages/') || f.startsWith('src/')
  );

  console.log(`Changed files: ${changedFiles.length}`);
  console.log(`  KB files: ${changedKBFiles.length}`);
  console.log(`  Code files: ${changedCodeFiles.length}\n`);

  // Collect all KB entries
  const kbEntries: KBEntry[] = [];
  const kbIds = new Set<string>();

  for (const file of kbFiles) {
    const entry = validateKBEntry(file);
    if (entry) {
      // Check for duplicates
      if (kbIds.has(entry.id)) {
        violations.push({
          type: 'error',
          message: `Duplicate KB ID: ${entry.id}`,
          file: entry.filePath,
        });
      }
      kbIds.add(entry.id);
      kbEntries.push(entry);
    }
  }

  console.log(`✓ Validated ${kbEntries.length} KB entries\n`);

  // Check code references
  const codeFiles = changedCodeFiles.filter(
    f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.pike')
  );

  for (const file of codeFiles) {
    try {
      const annotations = extractKBAnnotations(file);
      for (const id of annotations) {
        if (!kbIds.has(id)) {
          violations.push({
            type: 'error',
            message: `Code references non-existent KB ID: ${id}`,
            file,
          });
        }
      }
    } catch {
      // File might not exist
    }
  }

  // Check coupling: code changes require KB update
  if (changedCodeFiles.length > 0 && changedKBFiles.length === 0) {
    // Only warn if there are no exemptions
    const exemptFiles = changedCodeFiles.filter(
      f =>
        f.includes('.test.ts') ||
        f.endsWith('.md') ||
        f.includes('__tests__') ||
        f.includes('scenario')
    );

    if (exemptFiles.length !== changedCodeFiles.length) {
      violations.push({
        type: 'warning',
        message: `Code files changed but no KB entry added/updated. Consider if this requires documentation.`,
      });
    }
  }

  // Report
  const errors = violations.filter(v => v.type === 'error');
  const warnings = violations.filter(v => v.type === 'warning');

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All KB compliance checks passed!\n');
    process.exit(0);
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} Error(s):`);
    for (const v of errors) {
      console.log(`  [ERROR] ${v.message}${v.file ? ` (${v.file})` : ''}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} Warning(s):`);
    for (const v of warnings) {
      console.log(`  [WARN] ${v.message}${v.file ? ` (${v.file})` : ''}`);
    }
  }

  console.log('\n');
  console.log('📚 KB Enforcement Policy: docs/kb-enforcement-policy.md\n');

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Check failed:', e);
  process.exit(1);
});
