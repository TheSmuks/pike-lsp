/**
 * Scenario: RXML file content cache has bounded size (LRU eviction)
 *
 * Validates the fix for issue #1274: the fileContentCache was a module-scoped
 * Map with no max-size eviction. It is now backed by an LRU cache shared
 * between definition-provider and references-provider, capped at 200 entries.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findTagDefinition,
  invalidateRXMLDefinitionCaches,
} from '../features/rxml/definition-provider.js';
import {
  findTagReferences,
  invalidateRXMLReferenceCaches,
} from '../features/rxml/references-provider.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { getFileContentCacheSize } from '../features/rxml/file-content-cache.js';

const createdDirs: string[] = [];

// Lightweight parser for tag function symbols
function mockParse(code: string): PikeSymbol[] {
  const symbols: PikeSymbol[] = [];
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line?.match(/\b(simpletag|container)[_\s](\w+)/);
    if (match) {
      symbols.push({
        name: `${match[1]}_${match[2]}`,
        kind: 'method',
        modifiers: [],
        position: { line: i + 1, column: 1, file: '' },
      });
    }
  }
  return symbols;
}
const parseFn = (text: string) => Promise.resolve(mockParse(text));

async function cleanup() {
  invalidateRXMLDefinitionCaches();
  invalidateRXMLReferenceCaches();
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

describe('RXML file content cache LRU eviction', () => {
  it('should evict oldest entries when cache exceeds max size', async () => {
    // Create a workspace with many .pike files — enough to exceed the 200-entry limit
    const root = await mkdtemp(join(tmpdir(), 'pike-lru-eviction-'));
    createdDirs.push(root);

    const FILE_COUNT = 210; // exceed the default 200-entry max
    for (let i = 0; i < FILE_COUNT; i++) {
      const filePath = join(root, `module-${i}.pike`);
      await writeFile(filePath, `simpletag tag_${i}() { return 1; }`, 'utf-8');
    }

    // Querying definitions causes readFileCached to populate the shared cache
    await findTagDefinition(`tag_0`, [root], parseFn);
    assert.equal(
      getFileContentCacheSize() > 0,
      true,
      'cache should have entries after first query'
    );

    // Query the last file — this should trigger eviction of earlier entries
    await findTagDefinition(`tag_${FILE_COUNT - 1}`, [root], parseFn);

    // The cache should not exceed the max size of 200
    const size = getFileContentCacheSize();
    assert.equal(
      size <= 200,
      true,
      `cache size (${size}) should not exceed 200 after querying ${FILE_COUNT} files`
    );

    await cleanup();
  });

  it('should still resolve definitions after eviction (re-reads from disk)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-lru-re read-'));
    createdDirs.push(root);

    const FILE_COUNT = 210;
    for (let i = 0; i < FILE_COUNT; i++) {
      const filePath = join(root, `module-${i}.pike`);
      await writeFile(filePath, `simpletag tag_${i}() { return 1; }`, 'utf-8');
    }

    // Populate the cache past capacity to trigger eviction
    for (let i = 0; i < FILE_COUNT; i++) {
      await findTagDefinition(`tag_${i}`, [root], parseFn);
    }

    // The first file's entry should have been evicted; but findTagDefinition
    // must still return the correct result by re-reading from disk.
    const result = await findTagDefinition(`tag_0`, [root], parseFn);
    assert.notEqual(result, null, 'evicted entry should be re-readable from disk');
    assert.equal(result?.tagName, 'tag_0');
    assert.equal(result?.functionName, 'simpletag_tag_0');

    await cleanup();
  });

  it('should share cache between definition and references providers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-lru-shared-'));
    createdDirs.push(root);

    // Create files that both providers will read
    for (let i = 0; i < 50; i++) {
      const filePath = join(root, `module-${i}.pike`);
      await writeFile(filePath, `simpletag tag_${i}() { return 1; }`, 'utf-8');
    }

    // Populate via definition provider
    await findTagDefinition('tag_0', [root], parseFn);
    const sizeAfterDef = getFileContentCacheSize();

    // Populate via references provider — should reuse same cache entries
    await findTagReferences('tag_0', [root], true, parseFn);
    const sizeAfterRef = getFileContentCacheSize();

    // Size should not double because providers share the cache
    assert.equal(
      sizeAfterRef <= sizeAfterDef + 5, // small margin for index-related reads
      true,
      `shared cache should not double: was ${sizeAfterDef}, now ${sizeAfterRef}`
    );

    await cleanup();
  });

  it('should clear entire cache when no URI is provided', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-lru-clear-'));
    createdDirs.push(root);

    const filePath = join(root, 'module.pike');
    await writeFile(filePath, 'simpletag foo() { return 1; }', 'utf-8');

    await findTagDefinition('foo', [root], parseFn);
    assert.equal(getFileContentCacheSize() > 0, true, 'cache should have entries');

    // Clear via definition provider (no URI)
    invalidateRXMLDefinitionCaches();
    assert.equal(getFileContentCacheSize(), 0, 'cache should be empty after full clear');

    // Re-populate and clear via references provider (no URI)
    await findTagReferences('foo', [root], true, parseFn);
    assert.equal(
      getFileContentCacheSize() > 0,
      true,
      'cache should have entries after re-populate'
    );

    invalidateRXMLReferenceCaches();
    assert.equal(getFileContentCacheSize(), 0, 'cache should be empty after references clear');

    await cleanup();
  });

  it('should invalidate a single file by URI without clearing the rest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-lru-single-'));
    createdDirs.push(root);

    const fileA = join(root, 'module-a.pike');
    const fileB = join(root, 'module-b.pike');
    await writeFile(fileA, 'simpletag alpha() { return 1; }', 'utf-8');
    await writeFile(fileB, 'simpletag beta() { return 1; }', 'utf-8');

    await findTagDefinition('alpha', [root], parseFn);
    await findTagDefinition('beta', [root], parseFn);
    assert.equal(getFileContentCacheSize(), 2, 'both files should be cached');

    // Invalidate only fileA
    invalidateRXMLDefinitionCaches(`file://${fileA}`);
    assert.equal(
      getFileContentCacheSize(),
      1,
      'only one file should remain after targeted invalidation'
    );

    await cleanup();
  });
});

/**
 * Index caches (tagDefinitionIndexCache, defvarDefinitionIndexCache,
 * tagReferenceIndexCache, tagDeclarationIndexCache) were unbounded Map
 * instances — issue #1274. They are now LRUCache capped at 20 workspace
 * keys so multi-workspace setups cannot grow them indefinitely.
 */
describe('RXML index cache LRU eviction', () => {
  it('should cap workspace index entries across many distinct workspaces', async () => {
    // Create 25 distinct workspaces — exceeding the 20-entry LRU cap
    const dirs: string[] = [];
    try {
      for (let w = 0; w < 25; w++) {
        const root = await mkdtemp(join(tmpdir(), `pike-idx-lru-${w}-`));
        dirs.push(root);
        await writeFile(
          join(root, `mod-${w}.pike`),
          `simpletag tag_w${w}() { return ${w}; }`,
          'utf-8'
        );

        // Force the definition provider to build a per-workspace index
        const result = await findTagDefinition(`tag_w${w}`, [root], parseFn);
        assert.notEqual(result, null, `tag_w${w} should be found in workspace ${w}`);
        assert.equal(result?.tagName, `tag_w${w}`);
      }

      // The LRU cache should have evicted the oldest workspace indexes.
      // Re-querying the earliest workspace should still work (rebuilds index).
      const earliestRoot = dirs[0];
      if (earliestRoot) {
        const reRead = await findTagDefinition('tag_w0', [earliestRoot], parseFn);
        assert.notEqual(reRead, null, 'evicted index should rebuild on demand');
        assert.equal(reRead?.tagName, 'tag_w0');
      }
    } finally {
      invalidateRXMLDefinitionCaches();
      invalidateRXMLReferenceCaches();
      for (const dir of dirs) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('should cap reference index entries across many distinct workspaces', async () => {
    const dirs: string[] = [];
    try {
      for (let w = 0; w < 25; w++) {
        const root = await mkdtemp(join(tmpdir(), `pike-ref-idx-${w}-`));
        dirs.push(root);
        await writeFile(
          join(root, `mod-${w}.pike`),
          `simpletag tag_w${w}() { return ${w}; }`,
          'utf-8'
        );

        // Build the per-workspace reference + declaration index (includeDeclaration
        // scans .pike files for simpletag/container declarations, no RXML parser needed)
        const refs = await findTagReferences(`tag_w${w}`, [root], true, parseFn);
        assert.ok(refs.length > 0, `tag_w${w} should have references in workspace ${w}`);
      }

      // Re-query earliest workspace — its index was evicted but rebuilds
      const earliestRoot = dirs[0];
      if (earliestRoot) {
        const reRefs = await findTagReferences('tag_w0', [earliestRoot], true, parseFn);
        assert.ok(reRefs.length > 0, 'evicted reference index should rebuild on demand');
      }
    } finally {
      invalidateRXMLDefinitionCaches();
      invalidateRXMLReferenceCaches();
      for (const dir of dirs) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });
});
