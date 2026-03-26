import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverSrcDir = path.resolve(testDir, '..');

async function readServerFile(relativePath: string): Promise<string> {
  return readFile(path.join(serverSrcDir, relativePath), 'utf-8');
}

describe('Architecture regressions', () => {
  it('keeps definition and rename hot paths free of synchronous file reads', async () => {
    const definitionSource = await readServerFile('features/navigation/definition.ts');
    const renameSource = await readServerFile('features/editing/rename.ts');
    const workspaceIndexSource = await readServerFile('workspace-index.ts');

    assert.equal(
      definitionSource.includes('readFileSync('),
      false,
      'definition hot path should not use readFileSync'
    );
    assert.equal(
      renameSource.includes('readFileSync('),
      false,
      'rename hot path should not use readFileSync'
    );
    assert.equal(
      workspaceIndexSource.includes('readdirSync('),
      false,
      'workspace discovery should not use readdirSync'
    );
    assert.equal(
      workspaceIndexSource.includes('statSync('),
      false,
      'workspace discovery should not use statSync'
    );
  });

  it('cleans validationVersions state on document close', async () => {
    const diagnosticsSource = await readServerFile('features/diagnostics/lifecycle.ts');
    const didCloseIndex = diagnosticsSource.indexOf('documents.onDidClose(async event => {');
    const cleanupIndex = diagnosticsSource.indexOf(
      'validationVersions.delete(event.document.uri);'
    );

    assert.equal(
      didCloseIndex >= 0,
      true,
      'expected diagnostics lifecycle onDidClose handler block'
    );
    assert.equal(
      cleanupIndex > didCloseIndex,
      true,
      'onDidClose must clear validationVersions entry'
    );
  });
});
