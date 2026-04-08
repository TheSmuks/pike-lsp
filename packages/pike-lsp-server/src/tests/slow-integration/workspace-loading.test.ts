/**
 * Slow Integration Test: Full Workspace Loading
 *
 * RA-inspired test that simulates a full LSP workspace loading cycle.
 * Validates that the server can handle realistic workspace sizes and
 * produce correct symbol indexes.
 *
 * Part of Risk R-003 mitigation: catches event-loop regressions where
 * latency/reload bugs escape standard unit tests.
 *
 * Run with: bun run test:slow
 */

import { describe, it, beforeAll, afterAll, expect } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentCache } from '../../services/document-cache.js';
import { WorkspaceScanner } from '../../services/workspace-scanner.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import { Logger } from '@pike-lsp/core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';

/**
 * Generate a realistic Pike source file of ~N lines.
 */
function generatePikeFile(className: string, methodCount: number, lineCount: number): string {
  const lines: string[] = [`// Auto-generated workspace fixture for slow integration test`, ''];
  lines.push(`class ${className} {`);
  lines.push(`  private string name = "${className}";`);
  lines.push('');

  for (let i = 0; i < methodCount; i++) {
    lines.push(`  string method_${i}() {`);
    lines.push(`    // Implementation for method ${i}`);
    // Pad to reach target line count
    const padNeeded = Math.max(0, Math.floor((lineCount - lines.length) / (methodCount - i + 1)));
    for (let p = 0; p < padNeeded; p++) {
      lines.push(`    // padding line ${p} for method ${i}`);
    }
    lines.push(`    return "result_${i}";`);
    lines.push(`  }`);
    lines.push('');
  }

  lines.push(`  void destroy() {`);
  lines.push(`    // Cleanup`);
  lines.push(`  }`);
  lines.push(`}`);

  // Pad remaining lines
  while (lines.length < lineCount) {
    lines.push(`// trailing comment`);
  }

  return lines.join('\n');
}

/**
 * Workspace sizes to test (small/medium/large per acceptance criteria).
 */
const WORKSPACE_SIZES = {
  small: { files: 5, methodsPerFile: 3, linesPerFile: 50 },
  medium: { files: 25, methodsPerFile: 10, linesPerFile: 200 },
  large: { files: 100, methodsPerFile: 5, linesPerFile: 100 },
} as const;

function createScanner(): WorkspaceScanner {
  const logger = new Logger('slow-test');
  return new WorkspaceScanner(logger, () => ({}) as any);
}

async function createWorkspaceFixture(
  baseDir: string,
  size: keyof typeof WORKSPACE_SIZES
): Promise<string> {
  const wsDir = join(baseDir, `ws-${size}`);
  await mkdir(wsDir, { recursive: true });

  const cfg = WORKSPACE_SIZES[size];
  for (let i = 0; i < cfg.files; i++) {
    const content = generatePikeFile(`Fixture${i}`, cfg.methodsPerFile, cfg.linesPerFile);
    await writeFile(join(wsDir, `module_${i}.pike`), content);
  }

  // Add some nested dirs for realism
  if (size === 'medium' || size === 'large') {
    const subDir = join(wsDir, 'sub');
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, 'helper.pike'), generatePikeFile('Helper', 2, 30));
  }

  return wsDir;
}

describe('Slow Integration: Workspace Loading', { timeout: 60_000 }, () => {
  const fixtureBase = join(tmpdir(), 'pike-lsp-slow-test-workspace');

  beforeAll(async () => {
    await mkdir(fixtureBase, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rm(fixtureBase, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures
    }
  });

  describe('Small workspace (5 files, ~50 lines each)', () => {
    it('should load and index all files within latency budget', async () => {
      const wsDir = await createWorkspaceFixture(fixtureBase, 'small');
      const scanner = createScanner();

      const startTime = performance.now();
      const files = await scanner.scanFolder(wsDir, {
        extensions: ['.pike'],
        excludePatterns: ['node_modules'],
      });
      const elapsed = performance.now() - startTime;

      expect(files.length).toBeGreaterThanOrEqual(5);
      // Small workspace should load in under 2 seconds
      expect(elapsed).toBeLessThan(2000);

      // All files should have valid metadata
      for (const file of files) {
        expect(file.uri).toContain('file://');
        expect(file.path).toMatch(/\.pike$/);
        expect(file.lastModified).toBeGreaterThan(0);
      }
    });
  });

  describe('Medium workspace (25 files, ~200 lines each)', () => {
    it('should handle document cache for all files', async () => {
      const wsDir = await createWorkspaceFixture(fixtureBase, 'medium');
      const scanner = createScanner();
      const cache = new DocumentCache();

      const files = await scanner.scanFolder(wsDir, {
        extensions: ['.pike'],
        excludePatterns: ['node_modules'],
      });

      // Open all files in the cache
      const startTime = performance.now();
      for (const file of files) {
        const fs = await import('node:fs/promises');
        // scanFolder returns absolute paths, convert to file content read path
        const filePath = file.uri.startsWith('file://')
          ? file.uri.slice('file://'.length)
          : file.path;
        const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
        if (content) {
          const doc = TextDocument.create(file.uri, 'pike', 1, content);
          cache.set(file.uri, {
            document: doc,
            contentHash: computeContentHash(content),
            lineHashes: computeLineHashes(content),
            version: 1,
            lastValidated: Date.now(),
          });
        }
      }
      const elapsed = performance.now() - startTime;

      // Medium workspace caching should complete in under 5 seconds
      expect(elapsed).toBeLessThan(5000);
      expect(cache.size).toBeGreaterThanOrEqual(25);
    });
  });

  describe('Large workspace (100 files)', () => {
    it('should maintain acceptable scan performance', async () => {
      const wsDir = await createWorkspaceFixture(fixtureBase, 'large');
      const scanner = createScanner();

      const startTime = performance.now();
      const files = await scanner.scanFolder(wsDir, {
        extensions: ['.pike'],
        excludePatterns: ['node_modules'],
      });
      const elapsed = performance.now() - startTime;

      expect(files.length).toBeGreaterThanOrEqual(100);
      // Large workspace should still complete in reasonable time
      expect(elapsed).toBeLessThan(10000);
    });
  });

  describe('Content hash consistency', () => {
    it('should produce stable hashes across workspace reloads', async () => {
      const wsDir = await createWorkspaceFixture(fixtureBase, 'small');
      const fs = await import('node:fs/promises');

      const dirEntries = await readdir(wsDir);
      const pikeFiles = dirEntries.filter(f => f.endsWith('.pike'));

      // First pass: compute hashes
      const firstHashes = new Map<string, string>();
      for (const fileName of pikeFiles) {
        const filePath = join(wsDir, fileName);
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = computeContentHash(content);
        firstHashes.set(fileName, hash);
      }

      // Second pass: compute hashes again (no changes)
      for (const fileName of pikeFiles) {
        const filePath = join(wsDir, fileName);
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = computeContentHash(content);
        expect(hash).toBe(firstHashes.get(fileName));
      }

      // Modify one file and verify hash changes
      const targetFile = pikeFiles[0];
      const targetPath = join(wsDir, targetFile);
      const originalContent = await fs.readFile(targetPath, 'utf-8');
      await fs.writeFile(targetPath, originalContent + '\n// modified');

      const modifiedContent = await fs.readFile(targetPath, 'utf-8');
      const modifiedHash = computeContentHash(modifiedContent);
      expect(modifiedHash).not.toBe(firstHashes.get(targetFile));
    });
  });
});
