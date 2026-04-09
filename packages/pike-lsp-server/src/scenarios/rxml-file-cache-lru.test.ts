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
import { getFileContentCacheSize } from '../features/rxml/file-content-cache.js';

const createdDirs: string[] = [];

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
    await findTagDefinition(`tag_0`, [root]);
    assert.equal(
      getFileContentCacheSize() > 0,
      true,
      'cache should have entries after first query'
    );

    // Query the last file — this should trigger eviction of earlier entries
    await findTagDefinition(`tag_${FILE_COUNT - 1}`, [root]);

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
      await findTagDefinition(`tag_${i}`, [root]);
    }

    // The first file's entry should have been evicted; but findTagDefinition
    // must still return the correct result by re-reading from disk.
    const result = await findTagDefinition(`tag_0`, [root]);
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
    await findTagDefinition('tag_0', [root]);
    const sizeAfterDef = getFileContentCacheSize();

    // Populate via references provider — should reuse same cache entries
    await findTagReferences('tag_0', [root], true);
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

    await findTagDefinition('foo', [root]);
    assert.equal(getFileContentCacheSize() > 0, true, 'cache should have entries');

    // Clear via definition provider (no URI)
    invalidateRXMLDefinitionCaches();
    assert.equal(getFileContentCacheSize(), 0, 'cache should be empty after full clear');

    // Re-populate and clear via references provider (no URI)
    await findTagReferences('foo', [root], true);
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

    await findTagDefinition('alpha', [root]);
    await findTagDefinition('beta', [root]);
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
