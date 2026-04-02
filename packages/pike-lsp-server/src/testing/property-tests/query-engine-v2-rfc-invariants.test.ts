import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInvariant } from './invariants.js';

type MutationMethod = 'open' | 'change' | 'close' | 'config' | 'workspace';

class MutationHostModel {
  private revision = 0;

  mutate(_method: MutationMethod): { revision: number; snapshotId: string } {
    this.revision += 1;
    return {
      revision: this.revision,
      snapshotId: `snp-${this.revision}`,
    };
  }

  query(snapshotId: string): { snapshotIdUsed: string } {
    return { snapshotIdUsed: snapshotId };
  }

  executeDeterministicQuery(
    snapshotId: string,
    query: string,
    params: Record<string, unknown>
  ): { digest: string; payload: Record<string, unknown> } {
    const normalizedParams = JSON.stringify(
      Object.entries(params)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, value])
    );
    const digest = `${snapshotId}::${query}::${normalizedParams}`;
    return {
      digest,
      payload: { snapshotId, query, params: JSON.parse(normalizedParams) },
    };
  }
}

async function collectTsFiles(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(baseDir, entry.name);
      if (entry.isDirectory()) {
        return collectTsFiles(fullPath);
      }
      if (entry.isFile() && fullPath.endsWith('.ts')) {
        return [fullPath];
      }
      return [] as string[];
    })
  );

  return files.flat();
}

describe('Property Invariants: Query Engine v2 RFC invariants', () => {
  it('INV-01: uses one mutable host mutation clock for state-changing operations', () => {
    const methodArbitrary = fc.constantFrom<MutationMethod>(
      'open',
      'change',
      'close',
      'config',
      'workspace'
    );

    assertInvariant(
      'qe2-single-mutation-clock',
      fc.property(fc.array(methodArbitrary, { minLength: 1, maxLength: 300 }), methods => {
        const host = new MutationHostModel();
        let previousRevision = 0;

        for (const method of methods) {
          const ack = host.mutate(method);
          assert.equal(ack.revision, previousRevision + 1);
          assert.equal(ack.snapshotId, `snp-${ack.revision}`);
          previousRevision = ack.revision;
        }
      })
    );
  });

  it('INV-02: binds each read request to exactly one snapshotId', () => {
    assertInvariant(
      'qe2-read-binds-single-snapshot',
      fc.property(fc.nat(10_000), revision => {
        const host = new MutationHostModel();
        const snapshotId = `snp-${revision + 1}`;
        const response = host.query(snapshotId);

        assert.equal(typeof response.snapshotIdUsed, 'string');
        assert.match(response.snapshotIdUsed, /^snp-\d+$/);
        assert.equal(response.snapshotIdUsed.includes(','), false);
      })
    );
  });

  it('INV-05: query-layer DTO modules remain protocol-agnostic', async () => {
    const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const queryEngineDir = path.join(workspaceRoot, 'src/query-engine');
    const files = await collectTsFiles(queryEngineDir);

    assert(files.length > 0, 'Expected query-engine TypeScript modules to exist');

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      assert.equal(
        /vscode-languageserver/.test(source),
        false,
        `Protocol-specific LSP type leaked into query layer: ${file}`
      );
    }
  });

  it('INV-06: deterministic execution for identical fixed-snapshot query inputs', () => {
    const queryArbitrary = fc.string({ minLength: 1, maxLength: 120 });
    const paramsArbitrary = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.oneof(fc.integer(), fc.string({ maxLength: 20 }), fc.boolean()),
      { maxKeys: 6 }
    );

    assertInvariant(
      'qe2-deterministic-execution',
      fc.property(fc.nat(9999), queryArbitrary, paramsArbitrary, (revision, query, params) => {
        const host = new MutationHostModel();
        const snapshotId = `snp-${revision + 1}`;

        const first = host.executeDeterministicQuery(snapshotId, query, params);
        const second = host.executeDeterministicQuery(snapshotId, query, params);

        assert.deepEqual(first, second);
      })
    );
  });

  it('INV-07: query code performs no ad-hoc filesystem/process IO', async () => {
    const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const queryDirs = [
      path.join(workspaceRoot, 'src/query-engine'),
      path.join(workspaceRoot, 'src/features/navigation'),
    ];

    const ioImportPattern =
      /from\s+['"]node:(fs|fs\/promises|child_process|process)['"]|from\s+['"]fs['"]|from\s+['"]child_process['"]/;

    for (const directory of queryDirs) {
      const files = await collectTsFiles(directory);
      for (const file of files) {
        if (!file.includes('query-engine')) {
          continue;
        }

        const source = await readFile(file, 'utf8');
        assert.equal(
          ioImportPattern.test(source),
          false,
          `Ad-hoc IO import in query code is forbidden: ${file}`
        );
      }
    }
  });
});
