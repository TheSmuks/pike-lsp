import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { registerHierarchyHandlers } from '../../features/hierarchy.js';
import {
  createMockConnection,
  createMockDocuments,
  createMockServices,
  makeCacheEntry,
  sym,
} from '../helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';

describe('Hierarchy diagnostics ownership', () => {
  it('does not publish diagnostics on successful supertypes requests', async () => {
    const uri = 'file:///workspace/derived.pike';
    const baseUri = 'file:///workspace/base.pike';

    const derivedSymbols: PikeSymbol[] = [
      sym('Base', 'inherit', {
        position: { line: 2, column: 2 },
        classname: 'Base',
      }),
      sym('Derived', 'class', {
        position: { line: 1, column: 0 },
      }),
    ];

    const baseSymbols: PikeSymbol[] = [
      sym('Base', 'class', {
        position: { line: 1, column: 0 },
      }),
    ];

    const diagnostics = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        severity: 1,
        message: 'Existing parser diagnostic',
        source: 'pike',
      },
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols: derivedSymbols, diagnostics })],
      [baseUri, makeCacheEntry({ symbols: baseSymbols, diagnostics: [] })],
    ]);

    const services = createMockServices({
      cacheEntries,
      workspaceIndex: {
        getDocumentSymbols(documentUri: string) {
          if (documentUri === uri) return derivedSymbols;
          if (documentUri === baseUri) return baseSymbols;
          return [];
        },
        getAllDocumentUris() {
          return [uri, baseUri];
        },
      },
    });

    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [uri, TextDocument.create(uri, 'pike', 1, 'class Derived { inherit Base; }')],
        [baseUri, TextDocument.create(baseUri, 'pike', 1, 'class Base {}')],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: {
        name: 'Derived',
        kind: 5,
        uri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 7 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 7 },
        },
        detail: 'class Derived',
      },
      direction: 1,
    });

    expect(result?.some(item => item.name === 'Base')).toBe(true);
    expect(connection.getSentDiagnostics()).toEqual([]);
    expect(cacheEntries.get(uri)?.diagnostics).toEqual(diagnostics);
  });

  it('does not publish diagnostics when supertypes traversal throws', async () => {
    const uri = 'file:///workspace/derived.pike';

    const symbols: PikeSymbol[] = [
      sym('Base', 'inherit', {
        position: { line: 2, column: 2 },
        classname: 'Base',
      }),
      sym('Derived', 'class', {
        position: { line: 1, column: 0 },
      }),
    ];

    const services = createMockServices({
      cacheEntries: new Map<string, DocumentCacheEntry>([
        [uri, makeCacheEntry({ symbols, diagnostics: [] })],
      ]),
      workspaceIndex: {
        getAllDocumentUris() {
          throw new Error('forced failure');
        },
      },
    });

    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([[uri, TextDocument.create(uri, 'pike', 1, 'class Derived { inherit Base; }')]])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: {
        name: 'Derived',
        kind: 5,
        uri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 7 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 7 },
        },
        detail: 'class Derived',
      },
      direction: 1,
    });

    expect(result).toEqual([]);
    expect(connection.getSentDiagnostics()).toEqual([]);
  });
});
