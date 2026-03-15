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
});
