import { describe, expect, it } from 'bun:test';
import { SymbolKind } from 'vscode-languageserver/node.js';
import { registerSymbolsHandlers } from '../../features/symbols.js';

describe('Workspace symbol handler', () => {
  it('prefers live document cache symbols over stale workspace index entries for same URI', () => {
    const uri = 'file:///workspace/demo.pike';
    let workspaceSymbolHandler:
      | ((params: { query: string }) => Array<{ name: string; location: { uri: string } }>)
      | undefined;

    const connection = {
      onDocumentSymbol() {},
      onWorkspaceSymbol(handler: typeof workspaceSymbolHandler) {
        workspaceSymbolHandler = handler;
      },
      console: {
        log() {},
      },
    };

    const documentCacheEntries = new Map([
      [
        uri,
        {
          symbols: [
            {
              name: 'EditedClass',
              kind: 'class',
              modifiers: [],
              position: { line: 2, character: 0 },
            },
          ],
        },
      ],
    ]);

    const services = {
      documentCache: {
        entries() {
          return documentCacheEntries.entries();
        },
      },
      workspaceIndex: {
        searchSymbols() {
          return [
            {
              name: 'StaleClass',
              kind: SymbolKind.Class,
              location: {
                uri,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 10 },
                },
              },
            },
            {
              name: 'ExternalClass',
              kind: SymbolKind.Class,
              location: {
                uri: 'file:///workspace/other.pike',
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 13 },
                },
              },
            },
          ];
        },
      },
      bridge: null,
    };

    registerSymbolsHandlers(connection as any, services as any, { get: () => undefined } as any);

    expect(workspaceSymbolHandler).toBeDefined();
    const results = workspaceSymbolHandler!({ query: 'Class' });

    expect(results.some(symbol => symbol.name === 'EditedClass')).toBe(true);
    expect(results.some(symbol => symbol.name === 'StaleClass')).toBe(false);
    expect(results.some(symbol => symbol.name === 'ExternalClass')).toBe(true);
  });
});
