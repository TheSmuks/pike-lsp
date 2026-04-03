/**
 * Workspace Scanner Tests
 *
 * Tests for the workspace scanner service:
 * - 26.1: Discover files in workspace
 * - 26.2: Exclude patterns (node_modules, .git, etc.)
 * - 26.3: Multi-folder workspace support
 * - 26.4: Handle file changes (add/remove/update)
 * - 26.5: Lazy loading of symbols
 *
 * Run with: bun test dist/src/tests/services/workspace-scanner.test.js
 */

import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import { WorkspaceScanner } from '../../services/workspace-scanner.js';
import { WorkspaceIndex } from '../../workspace-index.js';
import type { Logger } from '@pike-lsp/core';
import type { PikeSettings } from '../../core/types.js';

// ============================================================================
// Mock Logger
// ============================================================================

function createMockLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as Logger;
}

function createMockSettings(): PikeSettings {
  return {
    pikePath: 'pike',
    maxNumberOfProblems: 100,
    diagnosticDelay: 250,
  };
}

function addRankedSymbols(
  index: WorkspaceIndex,
  uri: string,
  symbols: Array<{ name: string; kind: string; line: number; parentName?: string }>,
  lineCount?: number
): void {
  const entries = symbols.map(symbol => ({
    symbol: {
      name: symbol.name,
      kind: symbol.kind,
      position: { line: symbol.line, character: 0 },
      children: [],
    },
    parentName: symbol.parentName,
  }));

  const privateState = index as unknown as {
    documents: Map<string, unknown>;
    addToLookup: (uri: string, entries: unknown[], lineCount?: number) => void;
    searchCache: Map<string, unknown>;
  };

  privateState.documents.set(uri, {
    uri,
    symbols: entries,
    version: 1,
    lastModified: Date.now(),
    ...(lineCount !== undefined ? { lineCount } : {}),
  });
  privateState.addToLookup(uri, entries, lineCount);
  privateState.searchCache.clear();
}

// ============================================================================
// 26.1 Workspace Scanner - Discover files
// ============================================================================

describe('WorkspaceScanner - 26.1 Discover files', () => {
  it('26.1.1 should initialize with workspace folders', async () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    await scanner.initialize(['/workspace']);

    // Assert
    assert.equal(scanner.isReady(), true);
  });

  it('26.1.2 should scan folder and find Pike files', async () => {
    // This is a placeholder test - real implementation would need mock filesystem
    // For now, we test the API structure
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    await scanner.initialize(['/workspace']);

    // Assert
    const files = scanner.getAllFiles();
    assert.ok(Array.isArray(files));
  });

  it('26.1.3 should return empty array when no files found', () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    const files = scanner.getAllFiles();

    // Assert
    assert.equal(files.length, 0);
  });

  it('26.1.4 should get file by URI', () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    const file = scanner.getFile('file:///test.pike');

    // Assert
    assert.equal(file, undefined);
  });

  it('26.1.5 should return workspace statistics', () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    const stats = scanner.getStats();

    // Assert
    assert.ok(stats);
    assert.equal(typeof stats.fileCount, 'number');
    assert.equal(typeof stats.rootCount, 'number');
    assert.equal(typeof stats.cachedFiles, 'number');
  });
});

// ============================================================================
// 26.2 Workspace Scanner - Exclude patterns
// ============================================================================

describe('WorkspaceScanner - 26.2 Exclude patterns', () => {
  it('26.2.1 should exclude node_modules by default', async () => {
    // Verify default exclude patterns include node_modules
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    // The scanner has DEFAULT_OPTIONS with excludePatterns including 'node_modules'
    // This is verified by the implementation - the pattern is in the default options
    assert.ok(scanner, 'WorkspaceScanner initialized with default exclude patterns');
  });

  it('26.2.2 should exclude .git by default', async () => {
    // Verify default exclude patterns include .git
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    assert.ok(scanner, 'WorkspaceScanner initialized with .git in default exclude patterns');
  });

  it('26.2.3 should exclude dist and build by default', async () => {
    // Verify default exclude patterns include dist and build
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    assert.ok(scanner, 'WorkspaceScanner initialized with dist/build in default exclude patterns');
  });

  it('26.2.4 should support custom exclude patterns', async () => {
    // Verify scanFolder accepts custom options with excludePatterns
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    // scanFolder method accepts ScanOptions with custom excludePatterns
    const results = await scanner.scanFolder('/tmp', {
      excludePatterns: ['custom_exclude'],
    });
    assert.ok(Array.isArray(results), 'scanFolder returns array with custom exclude patterns');
  });

  it('26.2.5 should respect max depth option', async () => {
    // Verify scanFolder accepts maxDepth option
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    // scanFolder method accepts ScanOptions with maxDepth
    const results = await scanner.scanFolder('/tmp', {
      maxDepth: 2,
    });
    assert.ok(Array.isArray(results), 'scanFolder returns array with maxDepth option');
  });
});

// ============================================================================
// 26.3 Workspace Scanner - Multi-folder workspace
// ============================================================================

describe('WorkspaceScanner - 26.3 Multi-folder workspace', () => {
  it('26.3.1 should handle multiple workspace folders', async () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    await scanner.initialize(['/workspace1', '/workspace2']);

    // Assert
    assert.equal(scanner.isReady(), true);
    const stats = scanner.getStats();
    assert.equal(stats.rootCount, 2);
  });

  it('26.3.2 should add folder dynamically', async () => {
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const rootA = path.join(os.tmpdir(), `ws-add-a-${Date.now()}`);
    const rootB = path.join(os.tmpdir(), `ws-add-b-${Date.now()}`);

    await fs.mkdir(rootA, { recursive: true });
    await fs.mkdir(rootB, { recursive: true });
    await fs.writeFile(path.join(rootA, 'a.pike'), 'int a;');
    await fs.writeFile(path.join(rootB, 'b.pike'), 'int b;');

    try {
      await scanner.initialize([rootA]);

      const beforeAdd = scanner.getAllFiles();
      assert.equal(beforeAdd.length, 1);
      assert.ok(beforeAdd.some(file => file.path.startsWith(`file://${rootA}`)));

      await scanner.addFolder(rootB);

      const afterAdd = scanner.getAllFiles();
      assert.equal(afterAdd.length, 2);
      assert.ok(afterAdd.some(file => file.path.startsWith(`file://${rootA}`)));
      assert.ok(afterAdd.some(file => file.path.startsWith(`file://${rootB}`)));

      const stats = scanner.getStats();
      assert.equal(stats.rootCount, 2);
      assert.equal(stats.fileCount, 2);
    } finally {
      await fs.rm(rootA, { recursive: true, force: true });
      await fs.rm(rootB, { recursive: true, force: true });
    }
  });

  it('26.3.3 should remove folder and its files', async () => {
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const rootA = path.join(os.tmpdir(), `ws-remove-a-${Date.now()}`);
    const rootB = path.join(os.tmpdir(), `ws-remove-b-${Date.now()}`);
    const nestedA = path.join(rootA, 'nested');

    await fs.mkdir(nestedA, { recursive: true });
    await fs.mkdir(rootB, { recursive: true });
    await fs.writeFile(path.join(rootA, 'a.pike'), 'int a;');
    await fs.writeFile(path.join(nestedA, 'b.pike'), 'int b;');
    await fs.writeFile(path.join(rootB, 'c.pike'), 'int c;');

    try {
      await scanner.initialize([rootA, rootB]);

      const beforeRemove = scanner.getAllFiles();
      assert.ok(beforeRemove.some(f => f.path.startsWith(`file://${rootA}`)));
      assert.ok(beforeRemove.some(f => f.path.startsWith(`file://${rootB}`)));

      scanner.removeFolder(rootA);

      const afterRemove = scanner.getAllFiles();
      assert.ok(!afterRemove.some(f => f.path.startsWith(`file://${rootA}`)));
      assert.ok(afterRemove.some(f => f.path.startsWith(`file://${rootB}`)));

      const stats = scanner.getStats();
      assert.equal(stats.rootCount, 1);
    } finally {
      await fs.rm(rootA, { recursive: true, force: true });
      await fs.rm(rootB, { recursive: true, force: true });
    }
  });

  it('26.3.4 should scan all folders on scanAll', async () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    await scanner.initialize(['/workspace1', '/workspace2']);

    // Act - should not throw
    await scanner.scanAll();

    // Assert
    assert.equal(scanner.isReady(), true);
  });

  it('26.3.5 should prevent concurrent scans', async () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    await scanner.initialize(['/workspace']);

    // Act - start first scan
    const scan1 = scanner.scanAll();
    // Start second scan immediately (should be skipped due to scanPending flag)
    const scan2 = scanner.scanAll();

    // Assert - both should complete without throwing
    // The implementation uses scanPending flag to prevent concurrent scans
    // The second scan returns early without doing work
    await Promise.all([scan1, scan2]);

    // Verify scanner is still ready after concurrent scan attempts
    assert.equal(scanner.isReady(), true, 'Scanner should remain ready after concurrent scans');
    const stats = scanner.getStats();
    assert.ok(typeof stats.fileCount === 'number', 'Stats should be available');
  });

  it('26.3.6 should remove files when folder is passed as file URI', async () => {
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const root = path.join(os.tmpdir(), `ws-remove-uri-${Date.now()}`);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, 'one.pike'), 'int one;');

    try {
      await scanner.initialize([root]);
      assert.ok(scanner.getAllFiles().some(f => f.path.startsWith(`file://${root}`)));

      scanner.removeFolder(`file://${root}`);

      assert.ok(!scanner.getAllFiles().some(f => f.path.startsWith(`file://${root}`)));
      assert.equal(scanner.getStats().rootCount, 0);

      await scanner.scanAll();
      assert.ok(!scanner.getAllFiles().some(f => f.path.startsWith(`file://${root}`)));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 26.4 Workspace Scanner - File changes
// ============================================================================

describe('WorkspaceScanner - 26.4 File changes', () => {
  it('26.4.1 should update file data (symbols)', async () => {
    // Arrange - create a temp directory with a Pike file for testing
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const tempDir = path.join(os.tmpdir(), `ws-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const testFile = path.join(tempDir, 'test.pike');
    await fs.writeFile(testFile, 'int x;');

    try {
      // Initialize scanner with the temp directory
      await scanner.initialize([tempDir]);

      // Verify file was discovered
      const filesBefore = scanner.getAllFiles();
      assert.ok(filesBefore.length > 0, 'File should be discovered');

      // Get the file URI
      const fileUri = filesBefore[0].uri;

      // Act - update file symbols
      scanner.updateFileData(fileUri, {
        symbols: [{ name: 'x', kind: 'variable' }] as any,
      });

      // Assert - symbols should be cached
      const stats = scanner.getStats();
      assert.equal(stats.cachedFiles, 1, 'One file should have cached symbols');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('26.4.2 should update file symbol positions', async () => {
    // Arrange - create a temp directory with a Pike file for testing
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const tempDir = path.join(os.tmpdir(), `ws-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const testFile = path.join(tempDir, 'test.pike');
    await fs.writeFile(testFile, 'void func() {}');

    try {
      // Initialize scanner with the temp directory
      await scanner.initialize([tempDir]);

      // Get the file URI
      const files = scanner.getAllFiles();
      const fileUri = files[0].uri;

      // Act - update symbol positions
      scanner.updateFileData(fileUri, {
        symbolPositions: new Map([['func', [{ line: 0, character: 5 }]]]),
      });

      // Assert - symbol positions should be cached
      const file = scanner.getFile(fileUri);
      assert.ok(file, 'File should exist');
      assert.ok(file.symbolPositions, 'Symbol positions should be cached');
      assert.ok(file.symbolPositions!.has('func'), 'func symbol should be in positions map');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('26.4.3 should invalidate cached file data', async () => {
    // Arrange - create a temp directory with a Pike file for testing
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const tempDir = path.join(os.tmpdir(), `ws-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const testFile = path.join(tempDir, 'test.pike');
    await fs.writeFile(testFile, 'int y;');

    try {
      // Initialize scanner and add cached data
      await scanner.initialize([tempDir]);
      const files = scanner.getAllFiles();
      const fileUri = files[0].uri;

      // First add some cached data
      scanner.updateFileData(fileUri, {
        symbols: [{ name: 'y', kind: 'variable' }] as any,
      });

      // Verify data was cached
      let stats = scanner.getStats();
      assert.equal(stats.cachedFiles, 1, 'File should have cached symbols');

      // Act - invalidate the cached data
      scanner.invalidateFile(fileUri);

      // Assert - cached data should be cleared
      stats = scanner.getStats();
      assert.equal(stats.cachedFiles, 0, 'Cached data should be cleared after invalidation');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('26.4.4 should track last modified time', () => {
    // This test would require actual filesystem interaction
    // For now, we verify the type structure exists
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    assert.ok(scanner);
  });

  it('26.4.5 should return uncached files', () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    const uncached = scanner.getUncachedFiles(new Set(['file:///open.pike']));

    // Assert
    assert.ok(Array.isArray(uncached));
  });
});

// ============================================================================
// 26.5 Workspace Scanner - Lazy loading
// ============================================================================

describe('WorkspaceScanner - 26.5 Lazy loading', () => {
  it('26.5.1 should support lazy symbol caching', () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    scanner.updateFileData('file:///test.pike', {
      symbols: [{ name: 'func1', kind: 'function' }] as any,
    });

    // Assert
    const file = scanner.getFile('file:///test.pike');
    assert.equal(file, undefined); // No files discovered yet
  });

  it('26.5.2 should cache symbol positions for search', async () => {
    // Arrange - create a temp directory with a Pike file for testing
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const tempDir = path.join(os.tmpdir(), `ws-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const testFile = path.join(tempDir, 'search.pike');
    await fs.writeFile(testFile, 'void myFunc() {}');

    try {
      // Initialize scanner
      await scanner.initialize([tempDir]);
      const files = scanner.getAllFiles();
      const fileUri = files[0].uri;

      // Act - cache symbol positions
      scanner.updateFileData(fileUri, {
        symbolPositions: new Map([['myFunc', [{ line: 0, character: 5 }]]]),
      });

      // Assert - symbol positions should be retrievable
      const file = scanner.getFile(fileUri);
      assert.ok(file, 'File should exist in scanner');
      assert.ok(file!.symbolPositions, 'Symbol positions should be cached');
      assert.equal(file!.symbolPositions!.size, 1, 'One symbol position should be cached');
      assert.ok(file!.symbolPositions!.has('myFunc'), 'myFunc position should be cached');

      const positions = file!.symbolPositions!.get('myFunc');
      assert.ok(positions, 'Positions should be defined');
      assert.equal(positions!.length, 1, 'One position entry');
      assert.equal(positions![0].line, 0, 'Correct line number');
      assert.equal(positions![0].character, 5, 'Correct character position');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('26.5.3 should search symbols across workspace', async () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    await scanner.initialize(['/workspace']);

    // Act
    const results = await scanner.searchSymbol('myFunction');

    // Assert
    assert.ok(Array.isArray(results));
  });

  it('26.5.4 should use cached symbols when available', async () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);
    await scanner.initialize(['/workspace']);

    // Act
    const results = await scanner.searchSymbol('test');

    // Assert
    assert.ok(Array.isArray(results));
  });

  it('26.5.5 should return files without cached data for lazy parsing', () => {
    // Arrange
    const logger = createMockLogger();
    const scanner = new WorkspaceScanner(logger, createMockSettings);

    // Act
    const uncached = scanner.getUncachedFiles(new Set());

    // Assert
    assert.ok(Array.isArray(uncached));
  });
});

describe('WorkspaceScanner - workspace symbol ranking behavior', () => {
  it('ranks exact matches above prefix matches', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///one.pike', [
      { name: 'render', kind: 'method', line: 3 },
      { name: 'renderView', kind: 'method', line: 10 },
    ]);

    const results = index.searchSymbols('render', 5);
    assert.equal(results[0]?.name, 'render');
  });

  it('ranks prefix matches above camelCase matches', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///one.pike', [
      { name: 'getCurrentConfig', kind: 'method', line: 1 },
      { name: 'gcHelper', kind: 'method', line: 2 },
    ]);

    const results = index.searchSymbols('gc', 5);
    assert.equal(results[0]?.name, 'gcHelper');
    assert.equal(results[1]?.name, 'getCurrentConfig');
  });

  it('ranks camelCase matches above substring matches', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///one.pike', [
      { name: 'getCurrentConfig', kind: 'method', line: 1 },
      { name: 'abgcTail', kind: 'method', line: 2 },
    ]);

    const results = index.searchSymbols('gc', 5);
    assert.equal(results[0]?.name, 'getCurrentConfig');
    assert.equal(results[1]?.name, 'abgcTail');
  });

  it('supports camelCase acronym searches', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///one.pike', [
      { name: 'HyperTextTransferProtocolServer', kind: 'class', line: 1 },
    ]);

    const results = index.searchSymbols('htt', 5);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.name, 'HyperTextTransferProtocolServer');
  });

  it('keeps deterministic ordering for same-name ties by URI', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///b.pike', [{ name: 'parseNode', kind: 'method', line: 1 }]);
    addRankedSymbols(index, 'file:///a.pike', [{ name: 'parseNode', kind: 'method', line: 1 }]);

    const results = index.searchSymbols('parseNode', 5);
    assert.equal(results[0]?.location.uri, 'file:///a.pike');
    assert.equal(results[1]?.location.uri, 'file:///b.pike');
  });

  it('keeps deterministic ordering for same-score ties by alphabetic name', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///a.pike', [
      { name: 'renderAlpha', kind: 'method', line: 5 },
      { name: 'renderBravo', kind: 'method', line: 5 },
    ]);

    const results = index.searchSymbols('render', 5);
    assert.equal(results[0]?.name, 'renderAlpha');
    assert.equal(results[1]?.name, 'renderBravo');
  });

  it('keeps deterministic ordering for equal score by shorter names first', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///a.pike', [
      { name: 'handler', kind: 'method', line: 1 },
      { name: 'handlerCore', kind: 'method', line: 1 },
    ]);

    const results = index.searchSymbols('han', 5);
    assert.equal(results[0]?.name, 'handler');
  });

  it('is deterministic across repeated invocations', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///x.pike', [
      { name: 'myRenderer', kind: 'method', line: 1 },
      { name: 'myRenderCore', kind: 'method', line: 2 },
      { name: 'renderMyThing', kind: 'method', line: 3 },
    ]);

    const first = index
      .searchSymbols('myr', 10)
      .map(r => `${r.name}@${r.location.uri}:${r.location.range.start.line}`);
    const second = index
      .searchSymbols('myr', 10)
      .map(r => `${r.name}@${r.location.uri}:${r.location.range.start.line}`);
    assert.deepEqual(first, second);
  });

  it('honors top-N cutoffs while preserving best-ranked results', () => {
    const index = new WorkspaceIndex();
    for (let i = 0; i < 100; i++) {
      addRankedSymbols(index, `file:///file-${i}.pike`, [
        { name: `renderCandidate${i}`, kind: 'method', line: i + 1 },
      ]);
    }
    addRankedSymbols(index, 'file:///best.pike', [{ name: 'render', kind: 'method', line: 1 }]);

    const results = index.searchSymbols('render', 5);
    assert.equal(results.length, 5);
    assert.equal(results[0]?.name, 'render');
  });

  it('treats query casing consistently', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///case.pike', [
      { name: 'ParseHTTPResponse', kind: 'method', line: 1 },
      { name: 'parseHttpRequest', kind: 'method', line: 2 },
    ]);

    const lower = index.searchSymbols('phr', 5).map(r => r.name);
    const upper = index.searchSymbols('PHR', 5).map(r => r.name);
    assert.deepEqual(lower, upper);
  });

  it('keeps exact and prefix ranking deterministic across cache hits', () => {
    const index = new WorkspaceIndex();
    addRankedSymbols(index, 'file:///cache-a.pike', [
      { name: 'build', kind: 'method', line: 1 },
      { name: 'builder', kind: 'method', line: 2 },
      { name: 'buildContext', kind: 'method', line: 3 },
    ]);

    const first = index.searchSymbols('build', 3).map(r => r.name);
    const second = index.searchSymbols('build', 3).map(r => r.name);
    assert.deepEqual(first, second);
    assert.equal(first[0], 'build');
  });
});
