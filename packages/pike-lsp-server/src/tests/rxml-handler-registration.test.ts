import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { invalidateRXMLDefinitionCaches } from '../features/rxml/definition-provider.js';
import { invalidateRXMLReferenceCaches } from '../features/rxml/references-provider.js';
import { registerRXMLHandlers } from '../features/rxml/index.js';
import { createMockDocuments, createMockServices } from './helpers/mock-services.js';

const createdDirs: string[] = [];

afterEach(async () => {
  invalidateRXMLDefinitionCaches();
  invalidateRXMLReferenceCaches();
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('RXML handler registration', () => {
  it('invalidates caches on RXML document content change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-rxml-reg-change-'));
    createdDirs.push(root);

    const templatePath = join(root, 'page.rxml');
    const templateUri = `file://${templatePath}`;
    await writeFile(templatePath, '<emit />', 'utf-8');

    // Populate cache with initial scan
    const { findTagReferences } = await import('../features/rxml/references-provider.js');
    const initial = await findTagReferences('emit', [root], false, parseFn);
    expect(initial.length).toBeGreaterThan(0);

    const doc = TextDocument.create(templateUri, 'rxml', 2, '<set />');
    const docs = createMockDocuments(new Map([[templateUri, doc]]));
    registerRXMLHandlers({} as never, createMockServices() as never, docs as never);

    // Change file on disk and trigger change event
    await writeFile(templatePath, '<set />', 'utf-8');
    (docs as ReturnType<typeof createMockDocuments>).triggerDidChangeContent(templateUri);

    // Cache should be invalidated — stale 'emit' results gone, new 'set' results present
    const refreshedEmit = await findTagReferences('emit', [root], false, parseFn);
    expect(refreshedEmit.length).toBe(0);

    const refreshedSet = await findTagReferences('set', [root], false, parseFn);
    expect(refreshedSet.length).toBeGreaterThan(0);
  });

  it('invalidates caches on RXML document close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-rxml-reg-close-'));
    createdDirs.push(root);

    const templatePath = join(root, 'close.rxml');
    const templateUri = `file://${templatePath}`;
    await writeFile(templatePath, '<emit />', 'utf-8');

    const { findTagReferences } = await import('../features/rxml/references-provider.js');
    const initial = await findTagReferences('emit', [root], false, parseFn);
    expect(initial.length).toBeGreaterThan(0);

    const doc = TextDocument.create(templateUri, 'rxml', 2, '<set />');
    const docs = createMockDocuments(new Map([[templateUri, doc]]));
    registerRXMLHandlers({} as never, createMockServices() as never, docs as never);

    await writeFile(templatePath, '<set />', 'utf-8');
    (docs as ReturnType<typeof createMockDocuments>).triggerDidClose(templateUri);

    const refreshedEmit = await findTagReferences('emit', [root], false, parseFn);
    expect(refreshedEmit.length).toBe(0);

    const refreshedSet = await findTagReferences('set', [root], false, parseFn);
    expect(refreshedSet.length).toBeGreaterThan(0);
  });

  it('does not invalidate caches for non-RXML documents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-rxml-reg-skip-'));
    createdDirs.push(root);

    const templatePath = join(root, 'page.rxml');
    const templateUri = `file://${templatePath}`;
    await writeFile(templatePath, '<emit />', 'utf-8');

    // Populate cache for the RXML file
    const { findTagReferences } = await import('../features/rxml/references-provider.js');
    const initial = await findTagReferences('emit', [root], false, parseFn);
    expect(initial.length).toBeGreaterThan(0);

    // Change file on disk — without cache invalidation, stale results persist
    await writeFile(templatePath, '<set />', 'utf-8');

    // Register handlers with a Pike document (not RXML)
    const pikeUri = `file://${join(root, 'module.pike')}`;
    const pikeDoc = TextDocument.create(pikeUri, 'pike', 1, 'int x = 1;');
    const docs = createMockDocuments(new Map([[pikeUri, pikeDoc]]));
    registerRXMLHandlers({} as never, createMockServices() as never, docs as never);

    // Trigger change for the Pike document — should NOT invalidate RXML caches
    (docs as ReturnType<typeof createMockDocuments>).triggerDidChangeContent(pikeUri);

    // Stale 'emit' results should still be cached (file now has '<set />')
    const staleEmit = await findTagReferences('emit', [root], false, parseFn);
    expect(staleEmit.length).toBeGreaterThan(0);
  });
});
