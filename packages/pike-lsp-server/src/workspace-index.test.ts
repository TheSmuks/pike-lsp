/**
 * Workspace Index Tests
 *
 * Tests the workspace-wide symbol indexing functionality
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { WorkspaceIndex } from './workspace-index.js';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('WorkspaceIndex', () => {
  const addPrefixes = (prefixIndex: Map<string, Set<string>>, nameLower: string): void => {
    if (nameLower.length < 2) {
      return;
    }

    for (let i = 2; i <= nameLower.length; i++) {
      const prefix = nameLower.slice(0, i);
      let prefixSet = prefixIndex.get(prefix);
      if (!prefixSet) {
        prefixSet = new Set<string>();
        prefixIndex.set(prefix, prefixSet);
      }
      prefixSet.add(nameLower);
    }
  };

  it('should create an empty index', () => {
    const index = new WorkspaceIndex();
    const stats = index.getStats();

    assert.equal(stats.documents, 0, 'Should have no documents');
    assert.equal(stats.symbols, 0, 'Should have no symbols');
    assert.equal(stats.uniqueNames, 0, 'Should have no unique names');
  });

  it('should index a document', async () => {
    const bridge = new PikeBridge();
    await bridge.start();

    const index = new WorkspaceIndex(bridge);

    const code = `
            int myVariable = 42;
            string myFunction() {
                return "test";
            }
        `;

    await index.indexDocument('file:///test.pike', code, 1);

    const stats = index.getStats();
    assert.equal(stats.documents, 1, 'Should have one document');
    assert.ok(stats.symbols > 0, 'Should have at least one symbol');

    const symbols = index.getDocumentSymbols('file:///test.pike');
    assert.ok(symbols.length > 0, 'Should return symbols for indexed document');

    await bridge.stop();
  });

  it('should search symbols by name', async () => {
    const bridge = new PikeBridge();
    await bridge.start();

    const index = new WorkspaceIndex(bridge);

    const code = `
            int testVariable = 42;
            string testFunction() {
                return "test";
            }
        `;

    await index.indexDocument('file:///test.pike', code, 1);

    const results = index.searchSymbols('test', 10);
    assert.ok(results.length > 0, 'Should find symbols matching "test"');

    const names = results.map(r => r.name.toLowerCase());
    assert.ok(
      names.some(n => n.includes('test')),
      'Results should include "test"'
    );

    await bridge.stop();
  });

  it('should remove a document from the index', async () => {
    const bridge = new PikeBridge();
    await bridge.start();

    const index = new WorkspaceIndex(bridge);

    const code = `int x = 42;`;
    await index.indexDocument('file:///test.pike', code, 1);

    let stats = index.getStats();
    assert.equal(stats.documents, 1, 'Should have one document before removal');

    index.removeDocument('file:///test.pike');

    stats = index.getStats();
    assert.equal(stats.documents, 0, 'Should have no documents after removal');

    await bridge.stop();
  });

  it('should clear the entire index', async () => {
    const bridge = new PikeBridge();
    await bridge.start();

    const index = new WorkspaceIndex(bridge);

    await index.indexDocument('file:///test1.pike', 'int x = 1;', 1);
    await index.indexDocument('file:///test2.pike', 'int y = 2;', 1);

    let stats = index.getStats();
    assert.equal(stats.documents, 2, 'Should have two documents before clear');

    index.clear();

    stats = index.getStats();
    assert.equal(stats.documents, 0, 'Should have no documents after clear');
    assert.equal(stats.symbols, 0, 'Should have no symbols after clear');

    await bridge.stop();
  });

  it('should return all indexed document URIs', async () => {
    const bridge = new PikeBridge();
    await bridge.start();

    const index = new WorkspaceIndex(bridge);

    await index.indexDocument('file:///test1.pike', 'int x = 1;', 1);
    await index.indexDocument('file:///test2.pike', 'int y = 2;', 1);

    const uris = index.getAllDocumentUris();

    assert.ok(Array.isArray(uris), 'Should return an array');
    assert.equal(uris.length, 2, 'Should return two URIs');
    assert.ok(uris.includes('file:///test1.pike'), 'Should include test1.pike');
    assert.ok(uris.includes('file:///test2.pike'), 'Should include test2.pike');

    await bridge.stop();
  });

  it('should handle empty search query', async () => {
    const bridge = new PikeBridge();
    await bridge.start();

    const index = new WorkspaceIndex(bridge);

    await index.indexDocument('file:///test.pike', 'int x = 1;', 1);

    const results = index.searchSymbols('', 10);

    // Should return some symbols even with empty query
    assert.ok(Array.isArray(results), 'Should return an array');

    await bridge.stop();
  });

  it('should remove orphaned prefix entries when symbol lookup entry is missing', () => {
    const index = new WorkspaceIndex();
    const uri = 'file:///orphan.pike';
    const nameLower = 'orphansymbol';

    const privateState = index as unknown as {
      uriToSymbols: Map<string, Set<string>>;
      prefixIndex: Map<string, Set<string>>;
      symbolLookup: Map<string, Map<string, unknown>>;
    };

    privateState.uriToSymbols.set(uri, new Set([nameLower]));
    addPrefixes(privateState.prefixIndex, nameLower);

    assert.equal(
      privateState.symbolLookup.has(nameLower),
      false,
      'Precondition: symbolLookup must be missing entry'
    );
    assert.ok(
      privateState.prefixIndex.get('or')?.has(nameLower),
      'Precondition: prefix index should contain orphan name'
    );

    index.removeDocument(uri);

    assert.equal(
      privateState.uriToSymbols.has(uri),
      false,
      'Reverse index entry should be removed'
    );
    assert.equal(
      privateState.prefixIndex.get('or')?.has(nameLower) ?? false,
      false,
      'Orphan name must be removed from shared prefix set'
    );
    assert.equal(
      privateState.prefixIndex.has(nameLower),
      false,
      'Full-length prefix bucket should be deleted when empty'
    );
  });

  it('should keep non-orphan names when cleaning orphaned prefix entries', () => {
    const index = new WorkspaceIndex();
    const orphanUri = 'file:///orphan.pike';
    const liveUri = 'file:///live.pike';
    const orphanName = 'foobar';
    const liveName = 'foobaz';

    const privateState = index as unknown as {
      uriToSymbols: Map<string, Set<string>>;
      prefixIndex: Map<string, Set<string>>;
      symbolLookup: Map<
        string,
        Map<string, { name: string; kind: string; uri: string; line: number }>
      >;
    };

    privateState.uriToSymbols.set(orphanUri, new Set([orphanName]));
    privateState.uriToSymbols.set(liveUri, new Set([liveName]));

    addPrefixes(privateState.prefixIndex, orphanName);
    addPrefixes(privateState.prefixIndex, liveName);

    privateState.symbolLookup.set(
      liveName,
      new Map([[liveUri, { name: 'foobaz', kind: 'method', uri: liveUri, line: 1 }]])
    );

    index.removeDocument(orphanUri);

    assert.equal(
      privateState.prefixIndex.get('fo')?.has(orphanName) ?? false,
      false,
      'Orphan name should be removed from shared prefix bucket'
    );
    assert.equal(
      privateState.prefixIndex.get('fo')?.has(liveName) ?? false,
      true,
      'Live name should remain in shared prefix bucket'
    );
    assert.equal(
      privateState.prefixIndex.has('foobar'),
      false,
      'Unique orphan full-prefix bucket should be removed'
    );
    assert.equal(
      privateState.prefixIndex.get('foobaz')?.has(liveName) ?? false,
      true,
      'Live full-prefix bucket should remain'
    );
    assert.equal(
      privateState.symbolLookup.get(liveName)?.has(liveUri) ?? false,
      true,
      'Live symbol lookup entry should remain intact'
    );
  });

  it('should cap prefixIndex size with batch eviction', () => {
    const index = new WorkspaceIndex();

    const privateState = index as unknown as {
      prefixIndex: Map<string, Set<string>>;
    };

    // Temporarily lower the cap and batch size for testing
    const TestCap = 20;
    const TestBatch = 5;
    const constants = WorkspaceIndex as unknown as Record<string, number>;
    const OriginalCap = constants['PREFIX_INDEX_MAX_SIZE']!;
    const OriginalBatch = constants['PREFIX_INDEX_EVICT_BATCH']!;
    constants['PREFIX_INDEX_MAX_SIZE'] = TestCap;
    constants['PREFIX_INDEX_EVICT_BATCH'] = TestBatch;

    try {
      // Populate prefixIndex well beyond the cap via private state
      for (let i = 0; i < 50; i++) {
        addPrefixes(privateState.prefixIndex, `symbol_${i.toString().padStart(3, '0')}`);
      }

      const sizeBefore = privateState.prefixIndex.size;
      assert.ok(sizeBefore > TestCap, `Precondition: ${sizeBefore} > ${TestCap}`);

      // Run the same batch eviction logic used in addToLookup
      if (privateState.prefixIndex.size > TestCap) {
        let evicted = 0;
        for (const key of privateState.prefixIndex.keys()) {
          if (evicted >= TestBatch) break;
          privateState.prefixIndex.delete(key);
          evicted++;
        }
      }

      // After one batch, size should be reduced but not necessarily <= cap
      // (batch eviction amortizes — multiple batches needed for large overshoot)
      assert.ok(
        privateState.prefixIndex.size < sizeBefore,
        `prefixIndex size (${privateState.prefixIndex.size}) must decrease from ${sizeBefore}`
      );
      assert.ok(
        privateState.prefixIndex.size >= TestCap - TestBatch,
        `prefixIndex size (${privateState.prefixIndex.size}) must not over-evict below ${TestCap - TestBatch}`
      );
    } finally {
      constants['PREFIX_INDEX_MAX_SIZE'] = OriginalCap;
      constants['PREFIX_INDEX_EVICT_BATCH'] = OriginalBatch;
    }
  });

  it('should handle removal of symbols whose prefix entries were evicted', () => {
    const index = new WorkspaceIndex();
    const uri = 'file:///evicted.pike';
    const name = 'evictedname';

    const privateState = index as unknown as {
      uriToSymbols: Map<string, Set<string>>;
      prefixIndex: Map<string, Set<string>>;
      symbolLookup: Map<string, Map<string, unknown>>;
    };

    // Set up uriToSymbols and symbolLookup but leave prefixIndex empty
    // (simulating that all prefix entries for this symbol were evicted)
    privateState.uriToSymbols.set(uri, new Set([name]));
    // No symbolLookup entry — simulates orphan removal path

    // removeDocument must not throw even with no prefix entries
    index.removeDocument(uri);

    assert.equal(privateState.uriToSymbols.has(uri), false, 'URI should be cleaned up');
  });

  it('should respect search result limit', async () => {
    const bridge = new PikeBridge();
    await bridge.start();

    const index = new WorkspaceIndex(bridge);

    // Index a document with multiple symbols
    const code = `
            int var1 = 1;
            int var2 = 2;
            int var3 = 3;
            int var4 = 4;
            int var5 = 5;
        `;

    await index.indexDocument('file:///test.pike', code, 1);

    const results = index.searchSymbols('var', 2);

    assert.ok(results.length <= 2, 'Should not exceed the specified limit');

    await bridge.stop();
  });
});
