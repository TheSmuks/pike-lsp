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
