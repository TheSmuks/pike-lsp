/**
 * Slow Integration Test: Cross-Platform File Operations
 *
 * RA-inspired test for cross-platform path handling, file rename,
 * and workspace restructuring. Mirrors rust-analyzer's
 * `test_will_rename_files_same_level` and related file operation tests.
 *
 * Validates that path resolution, URI construction, and file rename
 * work correctly across different workspace structures.
 *
 * Part of Risk R-003 mitigation.
 *
 * Run with: bun run test:slow
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { computeContentHash } from '../../services/document-cache.js';
import { tmpdir } from 'node:os';
import { join, sep, posix, win32, normalize, isAbsolute } from 'node:path';
import { mkdir, writeFile, rm, rename, readdir, stat } from 'node:fs/promises';

describe('Slow Integration: Cross-Platform File Operations', { timeout: 30_000 }, () => {
  const fixtureBase = join(tmpdir(), 'pike-lsp-slow-fileops');

  beforeAll(async () => {
    await mkdir(fixtureBase, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rm(fixtureBase, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('URI construction from file paths', () => {
    it('handles POSIX-style paths correctly', () => {
      const paths = [
        '/home/user/project/main.pike',
        '/tmp/test/module.pike',
        '/workspace/src/lib/helper.pike',
      ];

      for (const p of paths) {
        const uri = `file://${p}`;
        expect(uri).toMatch(/^file:\/\/\//);
        expect(uri).toMatch(/\.pike$/);
      }
    });

    it('handles paths with spaces and special characters', () => {
      const paths = [
        '/home/user/my project/main.pike',
        '/tmp/test @work/module.pike',
        '/workspace/héllo/wörld.pike',
      ];

      for (const p of paths) {
        const uri = `file://${encodeURI(p)}`;
        expect(uri).toContain('file://');
      }
    });

    it('normalizes relative path components', () => {
      const cases = [
        { input: 'foo/bar/../baz.pike', expected: normalize('foo/baz.pike') },
        { input: './main.pike', expected: normalize('main.pike') },
        { input: 'a/./b/./c.pike', expected: normalize('a/b/c.pike') },
      ];

      for (const { input, expected } of cases) {
        const result = normalize(input);
        expect(result).toBe(expected);
      }
    });
  });

  describe('File rename operations', () => {
    it('tracks content hash through rename', async () => {
      const originalPath = join(fixtureBase, 'original.pike');
      const renamedPath = join(fixtureBase, 'renamed.pike');

      const content = 'class Original { void run() {} }';
      await writeFile(originalPath, content);

      const hashBefore = computeContentHash(content);

      // Rename file
      await rename(originalPath, renamedPath);

      // Verify file moved
      const oldExists = await stat(originalPath)
        .then(() => true)
        .catch(() => false);
      const newExists = await stat(renamedPath)
        .then(() => true)
        .catch(() => false);
      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);

      // Content hash should be the same after rename
      const { readFile } = await import('node:fs/promises');
      const contentAfter = await readFile(renamedPath, 'utf-8');
      const hashAfter = computeContentHash(contentAfter);
      expect(hashAfter).toBe(hashBefore);

      // Cleanup
      await rm(renamedPath).catch(() => {});
    });

    it('handles same-level rename (directory sibling)', async () => {
      const dir = join(fixtureBase, 'same-level-test');
      await mkdir(dir, { recursive: true });

      const fileA = join(dir, 'module_a.pike');
      const fileB = join(dir, 'module_b.pike');

      await writeFile(fileA, 'class A {}');
      await writeFile(fileB, 'class B {}');

      // Rename A to C (same directory level)
      const fileC = join(dir, 'module_c.pike');
      await rename(fileA, fileC);

      const entries = await readdir(dir);
      const pikeFiles = entries.filter(f => f.endsWith('.pike')).sort();

      expect(pikeFiles).toEqual(['module_b.pike', 'module_c.pike']);

      // Cleanup
      await rm(dir, { recursive: true, force: true });
    });

    it('handles rename across directories', async () => {
      const srcDir = join(fixtureBase, 'src-dir');
      const dstDir = join(fixtureBase, 'dst-dir');
      await mkdir(srcDir, { recursive: true });
      await mkdir(dstDir, { recursive: true });

      const srcFile = join(srcDir, 'mover.pike');
      await writeFile(srcFile, 'class Mover {}');

      const dstFile = join(dstDir, 'mover.pike');
      await rename(srcFile, dstFile);

      const srcExists = await stat(srcFile)
        .then(() => true)
        .catch(() => false);
      const dstExists = await stat(dstFile)
        .then(() => true)
        .catch(() => false);
      expect(srcExists).toBe(false);
      expect(dstExists).toBe(true);

      // Cleanup
      await rm(srcDir, { recursive: true, force: true });
      await rm(dstDir, { recursive: true, force: true });
    });
  });

  describe('Document URI updates after rename', () => {
    it('document cache correctly updates URI after rename', () => {
      // Simulates the LSP's willRenameFiles / didRenameFiles flow
      const { DocumentCache } =
        require('../../services/document-cache.js') as typeof import('../../services/document-cache.js');
      const cache = new DocumentCache();

      const oldUri = 'file:///workspace/old-name.pike';
      const newUri = 'file:///workspace/new-name.pike';
      const content = 'class MyModule { void init() {} }';

      // Open document under old name
      const doc = TextDocument.create(oldUri, 'pike', 1, content);
      cache.set(oldUri, {
        document: doc,
        contentHash: computeContentHash(content),
        lineHashes: [],
        version: 1,
        lastValidated: Date.now(),
      });

      expect(cache.has(oldUri)).toBe(true);

      // Simulate rename: create new entry, delete old
      const newDoc = TextDocument.create(newUri, 'pike', 1, content);
      cache.set(newUri, {
        document: newDoc,
        contentHash: computeContentHash(content),
        lineHashes: [],
        version: 1,
        lastValidated: Date.now(),
      });
      cache.delete(oldUri);

      expect(cache.has(oldUri)).toBe(false);
      expect(cache.has(newUri)).toBe(true);
    });

    it('batch rename of multiple files maintains cache integrity', () => {
      // E.g., renaming a directory affects all contained files
      const { DocumentCache } =
        require('../../services/document-cache.js') as typeof import('../../services/document-cache.js');
      const cache = new DocumentCache();

      const oldPrefix = 'file:///workspace/old-pkg/';
      const newPrefix = 'file:///workspace/new-pkg/';
      const files = ['main.pike', 'utils.pike', 'types.pike'];

      // Open all files
      for (const f of files) {
        const uri = `${oldPrefix}${f}`;
        const doc = TextDocument.create(uri, 'pike', 1, `// ${f}`);
        cache.set(uri, {
          document: doc,
          contentHash: computeContentHash(`// ${f}`),
          lineHashes: [],
          version: 1,
          lastValidated: Date.now(),
        });
      }

      expect(cache.size).toBe(3);

      // Batch rename
      for (const f of files) {
        const oldUri = `${oldPrefix}${f}`;
        const newUri = `${newPrefix}${f}`;
        const entry = cache.get(oldUri);
        expect(entry).toBeDefined();

        const newDoc = TextDocument.create(newUri, 'pike', 1, entry!.document.getText());
        cache.set(newUri, {
          document: newDoc,
          contentHash: entry!.contentHash,
          lineHashes: entry!.lineHashes,
          version: entry!.version,
          lastValidated: entry!.lastValidated,
        });
        cache.delete(oldUri);
      }

      // Verify: old entries gone, new entries present
      for (const f of files) {
        expect(cache.has(`${oldPrefix}${f}`)).toBe(false);
        expect(cache.has(`${newPrefix}${f}`)).toBe(true);
      }

      expect(cache.size).toBe(3);
    });
  });
});
