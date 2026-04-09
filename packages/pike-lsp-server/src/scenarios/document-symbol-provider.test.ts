/**
 * Document Symbol Provider Scenario Tests (#1263)
 *
 * Tests the new document-symbol handler in navigation/document-symbol.ts.
 * Covers symbol kind mapping, hierarchy, range handling, resilience, and cancellation.
 */

import { describe, it, expect } from 'bun:test';
import { SymbolKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import {
  mapSymbolKind,
  buildDetail,
  convertToDocumentSymbol,
  registerDocumentSymbolHandler,
} from '../features/navigation/document-symbol.js';
import {
  createMockConnection,
  createMockServices,
  makeCacheEntry,
  sym,
} from '../tests/helpers/mock-services.js';
import type { DocumentCacheEntry } from '../core/types.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface SetupOptions {
  symbols?: PikeSymbol[];
  uri?: string;
  noCache?: boolean;
  bridge?: unknown;
  documents?: Map<string, TextDocument>;
}

function setup(opts: SetupOptions) {
  const uri = opts.uri ?? 'file:///test.pike';
  const cacheEntries = new Map<string, DocumentCacheEntry>();

  if (!opts.noCache) {
    cacheEntries.set(
      uri,
      makeCacheEntry({
        symbols: opts.symbols ?? [],
      })
    );
  }

  const services = createMockServices({
    cacheEntries,
    bridge: opts.bridge,
  });
  const conn = createMockConnection();

  const mockDocuments = opts.documents;
  const documents = {
    get: (docUri: string) => mockDocuments?.get(docUri),
  };

  registerDocumentSymbolHandler(conn as unknown as any, services as unknown as any, documents as unknown as any);

  return {
    documentSymbol: () => conn.documentSymbolHandler({ textDocument: { uri } }),
    uri,
  };
}

// ---------------------------------------------------------------------------
// Unit: mapSymbolKind
// ---------------------------------------------------------------------------

describe('mapSymbolKind (#1263)', () => {
  it('should map class to Class', () => {
    expect(mapSymbolKind('class')).toBe(SymbolKind.Class);
  });

  it('should map method to Method', () => {
    expect(mapSymbolKind('method')).toBe(SymbolKind.Method);
  });

  it('should map function to Function', () => {
    expect(mapSymbolKind('function')).toBe(SymbolKind.Function);
  });

  it('should map variable to Variable', () => {
    expect(mapSymbolKind('variable')).toBe(SymbolKind.Variable);
  });

  it('should map constant to Constant', () => {
    expect(mapSymbolKind('constant')).toBe(SymbolKind.Constant);
  });

  it('should map inherit to Namespace', () => {
    expect(mapSymbolKind('inherit')).toBe(SymbolKind.Namespace);
  });

  it('should map typedef to TypeParameter', () => {
    expect(mapSymbolKind('typedef')).toBe(SymbolKind.TypeParameter);
  });

  it('should map enum to Enum', () => {
    expect(mapSymbolKind('enum')).toBe(SymbolKind.Enum);
  });

  it('should map enum_constant to EnumMember', () => {
    expect(mapSymbolKind('enum_constant')).toBe(SymbolKind.EnumMember);
  });

  it('should map import to Module', () => {
    expect(mapSymbolKind('import')).toBe(SymbolKind.Module);
  });

  it('should map module to Module', () => {
    expect(mapSymbolKind('module')).toBe(SymbolKind.Module);
  });

  it('should map unknown kinds to Variable', () => {
    expect(mapSymbolKind('')).toBe(SymbolKind.Variable);
    expect(mapSymbolKind('foobar')).toBe(SymbolKind.Variable);
  });
});

// ---------------------------------------------------------------------------
// Unit: buildDetail
// ---------------------------------------------------------------------------

describe('buildDetail (#1263)', () => {
  it('should format return type with argument types', () => {
    const symbol = {
      name: 'add',
      kind: 'method' as const,
      modifiers: [],
      returnType: { name: 'int' },
      argTypes: [{ name: 'int' }, { name: 'string' }],
    } as unknown as PikeSymbol;
    expect(buildDetail(symbol)).toBe('int(int, string)');
  });

  it('should use mixed as default returnType', () => {
    const symbol = {
      name: 'func',
      kind: 'method' as const,
      modifiers: [],
      returnType: {},
      argTypes: [{ name: 'int' }],
    } as unknown as PikeSymbol;
    expect(buildDetail(symbol)).toBe('mixed(int)');
  });

  it('should format type name for variables', () => {
    const symbol = {
      name: 'x',
      kind: 'variable' as const,
      modifiers: [],
      type: { name: 'int' },
    } as unknown as PikeSymbol;
    expect(buildDetail(symbol)).toBe('int');
  });

  it('should return undefined when no type info', () => {
    const symbol = sym('plain', 'variable');
    expect(buildDetail(symbol)).toBeUndefined();
  });

  it('should add inheritance info', () => {
    const symbol = {
      name: 'm',
      kind: 'method' as const,
      modifiers: [],
      inherited: true,
      inheritedFrom: 'Base',
      returnType: { name: 'void' },
      argTypes: [],
    } as unknown as PikeSymbol;
    expect(buildDetail(symbol)).toBe('void() (from Base)');
  });

  it('should add conditional info', () => {
    const symbol = {
      name: 'debug_var',
      kind: 'variable' as const,
      modifiers: [],
      conditional: true as const,
      condition: 'DEBUG',
      branch: 0,
    } as unknown as PikeSymbol;
    expect(buildDetail(symbol)).toBe('[#if DEBUG]');
  });
});

// ---------------------------------------------------------------------------
// Unit: convertToDocumentSymbol
// ---------------------------------------------------------------------------

describe('convertToDocumentSymbol (#1263)', () => {
  it('should use PikeSymbol.range when available', () => {
    const symbol: PikeSymbol = {
      name: 'MyClass',
      kind: 'class',
      modifiers: [],
      range: {
        start: { line: 0, character: 0 },
        end: { line: 10, character: 1 },
      },
      selectionRange: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 13 },
      },
    };

    const result = convertToDocumentSymbol(symbol);
    expect(result.range.start).toEqual({ line: 0, character: 0 });
    expect(result.range.end).toEqual({ line: 10, character: 1 });
    expect(result.selectionRange.start).toEqual({ line: 0, character: 6 });
    expect(result.selectionRange.end).toEqual({ line: 0, character: 13 });
  });

  it('should fall back to computed ranges when PikeSymbol.range is absent', () => {
    const symbol = sym('x', 'variable', {
      position: { file: 'test.pike', line: 5, column: 4 },
    });

    const result = convertToDocumentSymbol(symbol);
    // Pike line 5 -> LSP line 4
    expect(result.range.start.line).toBe(4);
    // Column computed from position
    expect(result.selectionRange.start.character).toBe(3); // column 4 -> 0-indexed 3
    expect(result.selectionRange.end.character).toBe(3 + 1); // name "x" length 1
  });

  it('should convert children recursively', () => {
    const symbol: PikeSymbol = {
      name: 'Outer',
      kind: 'class',
      modifiers: [],
      children: [
        {
          name: 'inner_var',
          kind: 'variable',
          modifiers: [],
        },
        {
          name: 'InnerClass',
          kind: 'class',
          modifiers: [],
          children: [
            { name: 'deep', kind: 'method', modifiers: [] },
          ],
        },
      ],
    };

    const result = convertToDocumentSymbol(symbol);
    expect(result.name).toBe('Outer');
    expect(result.children).toHaveLength(2);
    expect(result.children![0]!.name).toBe('inner_var');
    expect(result.children![1]!.name).toBe('InnerClass');
    expect(result.children![1]!.children).toHaveLength(1);
    expect(result.children![1]!.children![0]!.name).toBe('deep');
  });

  it('should handle symbol with empty name as "unknown"', () => {
    const symbol = sym('', 'variable');
    const result = convertToDocumentSymbol(symbol);
    expect(result.name).toBe('unknown');
  });

  it('should handle missing position gracefully', () => {
    const symbol = sym('noPos', 'variable');
    const result = convertToDocumentSymbol(symbol);
    // No position -> line defaults to 0 (1 - 1 = 0)
    expect(result.range.start.line).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: handler through mock connection
// ---------------------------------------------------------------------------

describe('Document Symbol Handler (#1263)', () => {
  it('should return hierarchical symbols from cache', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('MyClass', 'class', {
          position: { file: 'test.pike', line: 1 },
          children: [
            sym('myMethod', 'method', {
              position: { file: 'test.pike', line: 2 },
            }),
          ],
        }),
        sym('globalVar', 'variable', {
          position: { file: 'test.pike', line: 10 },
        }),
      ],
    });

    const result = await documentSymbol();
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0]!.name).toBe('MyClass');
    expect(result![0]!.kind).toBe(SymbolKind.Class);
    expect(result![0]!.children).toHaveLength(1);
    expect(result![0]!.children![0]!.name).toBe('myMethod');
    expect(result![1]!.name).toBe('globalVar');
  });

  it('should return null when no cache entry', async () => {
    const { documentSymbol } = setup({ noCache: true });
    const result = await documentSymbol();
    expect(result).toBeNull();
  });

  it('should return empty array when symbols are all invalid', async () => {
    const { documentSymbol } = setup({
      symbols: [
        { name: null as any, kind: 'variable', modifiers: [] } as any,
      ],
    });
    const result = await documentSymbol();
    expect(result).toEqual([]);
  });

  it('should filter out null-name symbols but keep valid ones', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('valid', 'variable', { position: { file: 'test.pike', line: 1 } }),
        { name: null as any, kind: 'variable', modifiers: [] } as any,
      ],
    });
    const result = await documentSymbol();
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0]!.name).toBe('valid');
  });

  it('should use correct symbol kinds per #1263 spec', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('MyClass', 'class', { position: { file: 'test.pike', line: 1 } }),
        sym('myMethod', 'method', { position: { file: 'test.pike', line: 2 } }),
        sym('myVar', 'variable', { position: { file: 'test.pike', line: 3 } }),
        sym('MY_CONST', 'constant', { position: { file: 'test.pike', line: 4 } }),
        sym('Base', 'inherit', { position: { file: 'test.pike', line: 5 } }),
        sym('MyType', 'typedef', { position: { file: 'test.pike', line: 6 } }),
      ],
    });

    const result = await documentSymbol();
    expect(result).not.toBeNull();
    expect(result!.length).toBe(6);

    expect(result![0]!.kind).toBe(SymbolKind.Class);
    expect(result![1]!.kind).toBe(SymbolKind.Method);
    expect(result![2]!.kind).toBe(SymbolKind.Variable);
    expect(result![3]!.kind).toBe(SymbolKind.Constant);
    expect(result![4]!.kind).toBe(SymbolKind.Namespace);
    expect(result![5]!.kind).toBe(SymbolKind.TypeParameter);
  });

  it('should convert Pike 1-indexed lines to LSP 0-indexed', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('line1', 'variable', { position: { file: 'test.pike', line: 1 } }),
        sym('line5', 'variable', { position: { file: 'test.pike', line: 5 } }),
        sym('line100', 'variable', { position: { file: 'test.pike', line: 100 } }),
      ],
    });

    const result = await documentSymbol();
    expect(result).not.toBeNull();

    expect(result![0]!.range.start.line).toBe(0);
    expect(result![1]!.range.start.line).toBe(4);
    expect(result![2]!.range.start.line).toBe(99);
  });

  it('should include detail with type info', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'myMethod',
          kind: 'method' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
          returnType: { name: 'int' },
          argTypes: [{ name: 'string' }],
        } as unknown as PikeSymbol,
      ],
    });

    const result = await documentSymbol();
    expect(result).not.toBeNull();
    expect(result![0]!.detail).toBe('int(string)');
  });

  it('should handle 3-level nesting', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('A', 'class', {
          position: { file: 'test.pike', line: 1 },
          children: [
            sym('B', 'class', {
              position: { file: 'test.pike', line: 2 },
              children: [
                sym('C', 'class', {
                  position: { file: 'test.pike', line: 3 },
                  children: [
                    sym('deep', 'variable', { position: { file: 'test.pike', line: 4 } }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = await documentSymbol();
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);

    const a = result![0]!;
    expect(a.name).toBe('A');
    const b = a.children![0]!;
    expect(b.name).toBe('B');
    const c = b.children![0]!;
    expect(c.name).toBe('C');
    const deep = c.children![0]!;
    expect(deep.name).toBe('deep');
    expect(deep.kind).toBe(SymbolKind.Variable);
  });

  it('should handle cancellation gracefully', async () => {
    // Create a mock connection that simulates cancellation
    const uri = 'file:///test.pike';
    const cacheEntries = new Map<string, DocumentCacheEntry>();
    cacheEntries.set(uri, makeCacheEntry({
      symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 1 } })],
    }));

    const services = createMockServices({ cacheEntries });
    let capturedHandler: ((params: any, token: any) => Promise<any>) | null = null;

    const conn = {
      onDocumentSymbol(handler: (params: any, token: any) => Promise<any>) {
        capturedHandler = handler;
      },
    };

    registerDocumentSymbolHandler(conn as any, services as any, { get: () => undefined } as any);

    // Simulate cancelled token
    const cancelledToken = { isCancellationRequested: true };
    const result = await capturedHandler!(
      { textDocument: { uri } },
      cancelledToken
    );
    expect(result).toBeNull();
  });
});
