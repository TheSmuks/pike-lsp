import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  findTagDefinition,
  invalidateRXMLDefinitionCaches,
} from '../features/rxml/definition-provider.js';
import {
  findTagReferences,
  invalidateRXMLReferenceCaches,
} from '../features/rxml/references-provider.js';
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

describe('RXML cache invalidation', () => {
  it('clears definition cache for changed module files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-rxml-def-'));
    createdDirs.push(root);

    const modulePath = join(root, 'module.pike');
    await writeFile(modulePath, 'simpletag foo() { return 1; }', 'utf-8');

    const first = await findTagDefinition('foo', [root]);
    expect(first).not.toBeNull();

    await writeFile(modulePath, 'simpletag bar() { return 1; }', 'utf-8');
    const stale = await findTagDefinition('foo', [root]);
    expect(stale).not.toBeNull();

    invalidateRXMLDefinitionCaches(`file://${modulePath}`);

    const refreshedFoo = await findTagDefinition('foo', [root]);
    const refreshedBar = await findTagDefinition('bar', [root]);
    expect(refreshedFoo).toBeNull();
    expect(refreshedBar).not.toBeNull();
  });

  it('clears reference cache for changed template files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-rxml-ref-'));
    createdDirs.push(root);

    const templatePath = join(root, 'page.rxml');
    await writeFile(templatePath, '<emit />', 'utf-8');

    const first = await findTagReferences('emit', [root], false);
    expect(first.length).toBeGreaterThan(0);

    await writeFile(templatePath, '<set />', 'utf-8');
    const stale = await findTagReferences('emit', [root], false);
    expect(stale.length).toBeGreaterThan(0);

    invalidateRXMLReferenceCaches(`file://${templatePath}`);

    const refreshedEmit = await findTagReferences('emit', [root], false);
    const refreshedSet = await findTagReferences('set', [root], false);
    expect(refreshedEmit.length).toBe(0);
    expect(refreshedSet.length).toBeGreaterThan(0);
  });

  it('invalidates RXML caches on document content change events', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-rxml-hook-'));
    createdDirs.push(root);

    const templatePath = join(root, 'hook.rxml');
    const templateUri = `file://${templatePath}`;
    await writeFile(templatePath, '<emit />', 'utf-8');

    const initial = await findTagReferences('emit', [root], false);
    expect(initial.length).toBeGreaterThan(0);

    const doc = TextDocument.create(templateUri, 'rxml', 2, '<set />');
    const docs = createMockDocuments(new Map([[templateUri, doc]]));
    registerRXMLHandlers({} as any, createMockServices() as any, docs as any);

    await writeFile(templatePath, '<set />', 'utf-8');
    (docs as any).triggerDidChangeContent(templateUri);

    const refreshedEmit = await findTagReferences('emit', [root], false);
    const refreshedSet = await findTagReferences('set', [root], false);
    expect(refreshedEmit.length).toBe(0);
    expect(refreshedSet.length).toBeGreaterThan(0);
  });
});
