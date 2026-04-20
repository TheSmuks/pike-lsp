/**
 * Scenario: registerRenameHandlers exercised through the mock connection.
 *
 * Validates that calling registerRenameHandlers() wires up onPrepareRename
 * and onRenameRequest correctly. Tests the text-search fallback path
 * (no bridge) and name validation errors.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ResponseError } from 'vscode-languageserver/node.js';
import { registerRenameHandlers } from '../features/editing/rename.js';
import type { DocumentCacheEntry } from '../core/types.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import {
  createMockConnection,
  createMockDocuments,
  asConnection,
  asServices,
  asTextDocuments,
  makeCachedEntry,
} from '../tests/helpers/test-helpers.js';
import { buildMockServices } from '../tests/helpers/mock-services.js';

function createHarness(overrides?: {
  bridge?: unknown;
  cachedTexts?: Map<string, { text: string; symbols: PikeSymbol[] }>;
}) {
  const docs = createMockDocuments();
  const conn = createMockConnection();
  const cacheEntries = new Map<string, DocumentCacheEntry>();
  const allUris: string[] = [];

  if (overrides?.cachedTexts) {
    for (const [uri, { text, symbols }] of overrides.cachedTexts) {
      const entry = makeCachedEntry(text);
      entry.symbols = symbols;
      cacheEntries.set(uri, entry);
      allUris.push(uri);
    }
  }

  const services = buildMockServices({
    bridge: overrides?.bridge ?? null,
    cacheEntries,
    workspaceIndex: {
      searchSymbols: () => [],
      getDocumentSymbols: () => [],
      getAllDocumentUris: () => allUris,
      getUrisForSymbolName: () => [],
    },
  });

  registerRenameHandlers(asConnection(conn), asServices(services), asTextDocuments(docs));

  return { conn, docs, services };
}

describe('registerRenameHandlers', () => {
  it('registers onPrepareRename and onRenameRequest handlers', () => {
    const { conn } = createHarness();
    // Accessing the getters should not throw — proves handlers were registered
    assert.doesNotThrow(() => conn.prepareRenameHandler);
    assert.doesNotThrow(() => conn.renameRequestHandler);
  });

  describe('onPrepareRename', () => {
    it('returns null for non-existent document', async () => {
      const { conn } = createHarness();
      const result = await conn.prepareRenameHandler({
        textDocument: { uri: 'file:///nonexistent.pike' },
        position: { line: 0, character: 0 },
      });
      assert.strictEqual(result, null);
    });

    it('returns null when no identifier is at position (non-existent doc)', async () => {
      const { conn } = createHarness();
      const result = await conn.prepareRenameHandler({
        textDocument: { uri: 'file:///missing.pike' },
        position: { line: 99, character: 99 },
      });
      assert.strictEqual(result, null);
    });

    it('returns Range for identifier at position using text-search fallback', async () => {
      const uri = 'file:///test.pike';
      const text = 'int myVar = 1;\n';
      const { conn, docs } = createHarness({
        cachedTexts: new Map([
          [uri, { text, symbols: [{ name: 'myVar', kind: 'variable' } as PikeSymbol] }],
        ]),
      });

      const doc = TextDocument.create(uri, 'pike', 1, text);
      docs.emitOpen(doc);

      const result = await conn.prepareRenameHandler({
        textDocument: { uri },
        position: { line: 0, character: 4 }, // inside 'myVar'
      });

      assert.ok(result, 'Expected a Range');
      assert.strictEqual(result.start.line, 0);
      assert.strictEqual(result.start.character, 4);
      assert.strictEqual(result.end.line, 0);
      assert.strictEqual(result.end.character, 9);
    });
  });

  describe('onRenameRequest', () => {
    it('returns null for non-existent document', async () => {
      const { conn } = createHarness();
      const result = await conn.renameRequestHandler({
        textDocument: { uri: 'file:///nonexistent.pike' },
        position: { line: 0, character: 0 },
        newName: 'renamed',
      });
      assert.strictEqual(result, null);
    });

    it('rejects empty name with ResponseError(-32602)', async () => {
      const { conn } = createHarness();
      try {
        await conn.renameRequestHandler({
          textDocument: { uri: 'file:///any.pike' },
          position: { line: 0, character: 0 },
          newName: '',
        });
        assert.fail('Expected ResponseError');
      } catch (err) {
        assert.ok(err instanceof ResponseError);
        assert.strictEqual(err.code, -32602);
        assert.ok(err.message.includes('cannot be empty'));
      }
    });

    it('rejects Pike keyword name with ResponseError(-32602)', async () => {
      const { conn } = createHarness();
      try {
        await conn.renameRequestHandler({
          textDocument: { uri: 'file:///any.pike' },
          position: { line: 0, character: 0 },
          newName: 'int',
        });
        assert.fail('Expected ResponseError');
      } catch (err) {
        assert.ok(err instanceof ResponseError);
        assert.strictEqual(err.code, -32602);
        assert.ok(err.message.includes('reserved keyword'));
      }
    });

    it('rejects invalid identifier with ResponseError(-32602)', async () => {
      const { conn } = createHarness();
      try {
        await conn.renameRequestHandler({
          textDocument: { uri: 'file:///any.pike' },
          position: { line: 0, character: 0 },
          newName: '123invalid',
        });
        assert.fail('Expected ResponseError');
      } catch (err) {
        assert.ok(err instanceof ResponseError);
        assert.strictEqual(err.code, -32602);
        assert.ok(err.message.includes('Invalid identifier'));
      }
    });

    it('produces WorkspaceEdit with text-search edits (no bridge)', async () => {
      const uri = 'file:///rename-me.pike';
      const text = 'int myVar = 1;\nmyVar += 2;\n';
      const { conn, docs } = createHarness({
        cachedTexts: new Map([
          [uri, { text, symbols: [{ name: 'myVar', kind: 'variable' } as PikeSymbol] }],
        ]),
      });

      const doc = TextDocument.create(uri, 'pike', 1, text);
      docs.emitOpen(doc);

      const result = await conn.renameRequestHandler({
        textDocument: { uri },
        position: { line: 0, character: 4 },
        newName: 'newName',
      });

      assert.ok(result, 'Expected a WorkspaceEdit');
      assert.ok(result.documentChanges, 'Expected documentChanges');
      assert.ok(Array.isArray(result.documentChanges), 'documentChanges should be an array');
      assert.ok(result.documentChanges.length > 0, 'Expected at least one document change');

      // All edits should replace 'myVar' with 'newName'
      const edits = (result.documentChanges as Array<{ edits: Array<{ newText: string }> }>)[0]!
        .edits;
      for (const edit of edits) {
        assert.strictEqual(edit.newText, 'newName');
      }
    });
  });
});
