import { describe, it, expect } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceIndex } from '../workspace-index.js';

describe('WorkspaceIndex file loading', () => {
  it('indexes files from disk through chunk loading path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'workspace-index-'));
    try {
      const fileA = join(dir, 'a.pike');
      const fileB = join(dir, 'b.pike');
      await writeFile(fileA, 'int alpha = 1;\n', 'utf-8');
      await writeFile(fileB, 'int beta = 2;\n', 'utf-8');

      const bridge = {
        isRunning: () => true,
        batchParse: async (files: Array<{ code: string; filename: string }>) => ({
          results: files.map(file => ({
            filename: file.filename,
            symbols: [
              {
                name: file.filename.includes('a.pike') ? 'alpha' : 'beta',
                kind: 'variable',
                position: { line: 1 },
              },
            ],
          })),
        }),
        parse: async (_code: string, filename: string) => ({
          filename,
          symbols: [{ name: 'fallback', kind: 'variable', position: { line: 1 } }],
        }),
      };

      const index = new WorkspaceIndex(bridge as any);
      const indexed = await index.indexDirectory(dir, false);

      expect(indexed).toBe(2);
      const stats = index.getStats();
      expect(stats.documents).toBe(2);
      expect(stats.symbols).toBeGreaterThanOrEqual(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps symbol lookup consistent after removing one document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'workspace-index-remove-'));
    try {
      const fileA = join(dir, 'a.pike');
      const fileB = join(dir, 'b.pike');
      await writeFile(fileA, 'int shared = 1;\n', 'utf-8');
      await writeFile(fileB, 'int shared = 2;\n', 'utf-8');

      const bridge = {
        isRunning: () => true,
        batchParse: async (files: Array<{ code: string; filename: string }>) => ({
          results: files.map(file => ({
            filename: file.filename,
            symbols: [
              {
                name: 'shared',
                kind: 'variable',
                position: { line: 1 },
              },
            ],
          })),
        }),
        parse: async (_code: string, filename: string) => ({
          filename,
          symbols: [{ name: 'shared', kind: 'variable', position: { line: 1 } }],
        }),
      };

      const index = new WorkspaceIndex(bridge as any);
      await index.indexDirectory(dir, false);

      const beforeRemoval = index.searchSymbols('sh');
      expect(beforeRemoval.length).toBe(2);

      index.removeDocument(`file://${fileA}`);

      const afterRemoval = index.searchSymbols('sh');
      expect(afterRemoval.length).toBe(1);
      expect(afterRemoval[0].location.uri).toBe(`file://${fileB}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('invalidates only affected search cache entries on removeDocument', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'workspace-index-cache-remove-'));
    try {
      const fileAlpha = join(dir, 'alpha.pike');
      const fileBeta = join(dir, 'beta.pike');
      await writeFile(fileAlpha, 'int alphaValue = 1;\n', 'utf-8');
      await writeFile(fileBeta, 'int betaValue = 2;\n', 'utf-8');

      const bridge = {
        isRunning: () => true,
        batchParse: async (files: Array<{ filename: string }>) => ({
          results: files.map(file => ({
            filename: file.filename,
            symbols: [
              {
                name: file.filename.includes('alpha.pike') ? 'alphaValue' : 'betaValue',
                kind: 'variable',
                position: { line: 1 },
              },
            ],
          })),
        }),
        parse: async (_code: string, filename: string) => ({
          filename,
          symbols: [{ name: 'fallback', kind: 'variable', position: { line: 1 } }],
        }),
      };

      const index = new WorkspaceIndex(bridge as any);
      await index.indexDirectory(dir, false);

      index.searchSymbols('alpha');
      index.searchSymbols('beta');
      expect((index as any).searchCacheMisses).toBe(2);
      expect((index as any).searchCacheHits).toBe(0);
      expect((index as any).searchCache.size).toBe(2);

      index.removeDocument(`file://${fileAlpha}`);
      expect((index as any).searchCache.size).toBe(1);

      const betaAfterRemoval = index.searchSymbols('beta');
      expect((index as any).searchCacheHits).toBe(1);
      expect((index as any).searchCacheMisses).toBe(2);
      expect(betaAfterRemoval.length).toBe(1);
      expect(betaAfterRemoval[0]?.location.uri).toBe(`file://${fileBeta}`);

      const alphaAfterRemoval = index.searchSymbols('alpha');
      expect((index as any).searchCacheMisses).toBe(3);
      expect(alphaAfterRemoval.length).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('evicts the oldest search cache entry when the cache is full', () => {
    const index = new WorkspaceIndex({ isRunning: () => true } as any);

    for (let i = 0; i < 100; i++) {
      const results = index.searchSymbols(`query-${i}`, 1);
      expect(results).toEqual([]);
    }

    expect((index as any).searchCache.size).toBe(100);
    expect(Array.from((index as any).searchCache.keys())[0]).toBe('query-0:1');

    const evictedResults = index.searchSymbols('query-100', 1);
    expect(evictedResults).toEqual([]);
    expect((index as any).searchCache.size).toBe(100);
    expect((index as any).searchCache.has('query-0:1')).toBe(false);
    expect((index as any).searchCache.has('query-1:1')).toBe(true);
    expect((index as any).searchCache.has('query-100:1')).toBe(true);
  });

  it('keeps container metadata without mutating source symbols', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'workspace-index-container-'));
    try {
      const filePath = join(dir, 'nested.pike');
      await writeFile(filePath, 'class Outer { void innerMethod() {} }\n', 'utf-8');

      const nestedSymbols = [
        {
          name: 'Outer',
          kind: 'class',
          modifiers: [],
          position: { line: 1 },
          children: [
            {
              name: 'innerMethod',
              kind: 'method',
              modifiers: [],
              position: { line: 1 },
              argNames: [],
              argTypes: [],
            },
          ],
        },
      ];

      const bridge = {
        isRunning: () => true,
        batchParse: async (files: Array<{ filename: string }>) => ({
          results: files.map(file => ({
            filename: file.filename,
            symbols: nestedSymbols,
          })),
        }),
        parse: async (_code: string, filename: string) => ({
          filename,
          symbols: nestedSymbols,
        }),
      };

      const index = new WorkspaceIndex(bridge as any);
      await index.indexDirectory(dir, false);

      const childSymbol = nestedSymbols[0]?.children?.[0] as { parentName?: string } | undefined;
      expect(childSymbol?.parentName).toBeUndefined();

      const results = index.searchSymbols('inner');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.containerName).toBe('Outer');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
