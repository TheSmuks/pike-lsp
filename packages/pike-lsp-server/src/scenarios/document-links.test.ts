/**
 * Document Links Scenario Tests
 * #1344: Verifies document links are generated from cached data, not regex.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerDocumentLinksHandler } from '../features/advanced/document-links.js';
import type { DocumentCacheEntry, ResolvedInclude } from '../core/types.js';
import { createMockDocuments } from '../tests/helpers/test-helpers.js';
import type { InheritanceInfo } from '@pike-lsp/pike-bridge';

/**
 * Harness that captures document link requests through a mock connection.
 */
function createDocumentLinksHarness() {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();

  let linkHandler:
    | ((params: {
        textDocument: { uri: string };
      }) => Promise<import('vscode-languageserver/node.js').DocumentLink[]>)
    | null = null;

  const connection = {
    onDocumentLinks(
      handler: (params: {
        textDocument: { uri: string };
      }) => Promise<import('vscode-languageserver/node.js').DocumentLink[]>
    ) {
      linkHandler = handler;
    },
    onDocumentLinkResolve() {
      // No-op: resolve handler not needed for tests
    },
    onRequest() {},
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    console: { log() {}, warn() {}, error() {} },
  };

  const services = {
    bridge: null,
    documentCache: {
      get(uri: string) {
        return cache.get(uri);
      },
      set(uri: string, entry: DocumentCacheEntry) {
        cache.set(uri, entry);
      },
      setPending() {},
      waitFor: async () => {},
      delete(uri: string) {
        cache.delete(uri);
      },
      keys() {
        return cache.keys();
      },
    },
    typeDatabase: {
      setProgram() {},
      removeProgram() {},
      getMemoryStats() {
        return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
      },
    },
    workspaceIndex: {
      indexDocument() {},
      removeDocument() {},
      getAllDocumentUris() {
        return [...cache.keys()];
      },
    },
    includeResolver: null,
    stdlibIndex: null,
    includePaths: [] as string[],
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 5 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  registerDocumentLinksHandler(connection as never, services as never, docs as never);

  const requestLinks = async (uri: string) => {
    if (!linkHandler) return [];
    return linkHandler({ textDocument: { uri } });
  };

  const openDocument = (uri: string, text: string) => {
    const entry: DocumentCacheEntry = {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
    };
    cache.set(uri, entry);
    docs.emitOpen(TextDocument.create(uri, 'pike', 1, text));
  };

  const setInherits = (uri: string, inherits: InheritanceInfo[]) => {
    const entry = cache.get(uri);
    if (entry) {
      entry.inherits = inherits;
    }
  };

  const setDependencies = (uri: string, includes: ResolvedInclude[]) => {
    const entry = cache.get(uri);
    if (entry) {
      entry.dependencies = { includes, imports: [] };
    }
  };

  return { requestLinks, openDocument, setInherits, setDependencies, cache, services };
}

describe('Document Links', () => {
  it('should generate inherit links from cached InheritanceInfo', async () => {
    const harness = createDocumentLinksHarness();
    const mainUri = 'file:///project/main.pike';
    const otherUri = 'file:///project/OtherModule.pike';

    // Open both documents so resolveModulePath can find the target
    harness.openDocument(mainUri, 'inherit OtherModule;\nint main() { return 0; }');
    harness.openDocument(otherUri, 'class OtherModule {}');

    harness.setInherits(mainUri, [{ path: 'OtherModule', source_name: 'OtherModule' }]);

    const links = await harness.requestLinks(mainUri);

    // Should produce at least one link for the inherit
    assert.ok(links.length >= 1, `Expected at least 1 link, got ${links.length}`);

    const inheritLink = links.find(l => l.target?.includes('OtherModule.pike'));
    assert.ok(inheritLink, 'Inherit link should point to OtherModule.pike');
    assert.strictEqual(inheritLink!.range.start.line, 0);
  });

  it('should handle string-path inherits from cached data', async () => {
    const harness = createDocumentLinksHarness();
    const mainUri = 'file:///project/main.pike';
    const moduleUri = 'file:///project/submodule.pike';

    harness.openDocument(mainUri, 'inherit "submodule";\nint main() { return 0; }');
    harness.openDocument(moduleUri, 'class submodule {}');

    // String-path inherit — regex /inherit\s+([A-Z][\w.]*)/g would miss this
    harness.setInherits(mainUri, [{ path: 'submodule', source_name: '"submodule"' }]);

    const links = await harness.requestLinks(mainUri);
    const inheritLink = links.find(l => l.target?.includes('submodule.pike'));
    assert.ok(inheritLink, 'String-path inherit should be linked via cached data');
  });

  it('should handle lowercase module paths from cached data', async () => {
    const harness = createDocumentLinksHarness();
    const mainUri = 'file:///project/main.pike';
    const modUri = 'file:///project/mymodule.pike';

    harness.openDocument(mainUri, 'inherit mymodule;\nint main() { return 0; }');
    harness.openDocument(modUri, 'class mymodule {}');

    // Lowercase path — regex /inherit\s+([A-Z][\w.]*)/g requires uppercase start
    harness.setInherits(mainUri, [{ path: 'mymodule', source_name: 'mymodule' }]);

    const links = await harness.requestLinks(mainUri);
    const inheritLink = links.find(l => l.target?.includes('mymodule.pike'));
    assert.ok(inheritLink, 'Lowercase inherit should be linked via cached data');
  });

  it('should return empty when no cached inherits exist', async () => {
    const harness = createDocumentLinksHarness();
    const uri = 'file:///project/empty.pike';

    harness.openDocument(uri, 'int x = 1;');
    // No inherits set — cache entry has no inherits field

    const links = await harness.requestLinks(uri);

    // Should have zero inherit links (autodoc regex won't match anything either)
    const inheritLinks = links.filter(
      l => l.target?.includes('.pike') || l.target?.includes('.pmod')
    );
    assert.strictEqual(
      inheritLinks.length,
      0,
      'No inherit links expected for document without inherits'
    );
  });

  it('should generate autodoc @see links', async () => {
    const harness = createDocumentLinksHarness();
    const uri = 'file:///project/doc.pike';

    harness.openDocument(uri, '//! @see utils.pike\nint x = 1;');
    // Note: autodoc links resolve via filesystem (resolveIncludePath), which won't find
    // anything in this test since we don't create actual files. We just verify no crash.

    const links = await harness.requestLinks(uri);
    // Autodoc regex may or may not produce links depending on filesystem,
    // but the request must not throw.
    assert.ok(Array.isArray(links), 'Should return an array without crashing');
  });

  it('should generate include links from cached dependencies.includes', async () => {
    const harness = createDocumentLinksHarness();
    const mainUri = 'file:///project/main.pike';
    const includePath = '/project/utils.pike';

    harness.openDocument(mainUri, '#include "utils.pike"\nint main() { return 0; }');
    harness.setDependencies(mainUri, [
      {
        originalPath: '"utils.pike"',
        resolvedPath: includePath,
        symbols: [],
      },
    ]);

    const links = await harness.requestLinks(mainUri);

    // Should produce a link for the include using cached data, not regex
    const includeLink = links.find(l => l.target?.includes('utils.pike'));
    assert.ok(includeLink, 'Include link should be generated from cached dependencies');
    assert.ok(includeLink!.target?.startsWith('file://'), 'Target should be a file URI');
    assert.ok(
      includeLink!.target?.includes('/project/utils.pike'),
      'Target should point to resolved path'
    );
  });

  it('should handle multiple includes from cached dependencies', async () => {
    const harness = createDocumentLinksHarness();
    const mainUri = 'file:///project/main.pike';

    harness.openDocument(mainUri, '#include "a.pike"\n#include "b.pike"\nint main() {}');
    harness.setDependencies(mainUri, [
      {
        originalPath: '"a.pike"',
        resolvedPath: '/project/a.pike',
        symbols: [],
      },
      {
        originalPath: '"b.pike"',
        resolvedPath: '/project/b.pike',
        symbols: [],
      },
    ]);

    const links = await harness.requestLinks(mainUri);

    const aLink = links.find(l => l.target?.includes('/project/a.pike'));
    const bLink = links.find(l => l.target?.includes('/project/b.pike'));
    assert.ok(aLink, 'First include should be linked');
    assert.ok(bLink, 'Second include should be linked');
  });

  it('should skip includes with empty resolvedPath', async () => {
    const harness = createDocumentLinksHarness();
    const mainUri = 'file:///project/main.pike';

    harness.openDocument(mainUri, '#include "missing.pike"\nint x;');
    harness.setDependencies(mainUri, [
      {
        originalPath: '"missing.pike"',
        resolvedPath: '',
        symbols: [],
      },
    ]);

    const links = await harness.requestLinks(mainUri);

    const includeLinks = links.filter(l => l.target?.includes('missing.pike'));
    assert.strictEqual(includeLinks.length, 0, 'Empty resolvedPath should produce no include link');
  });
});
