/**
 * Document Symbols Scenario Tests (#1061)
 *
 * Exercises real code paths through registerSymbolsHandlers with
 * onDocumentSymbol handler. Covers Pike-specific constructs, nested
 * symbols, edge cases, and symbol kind mapping.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { SymbolKind, DocumentSymbol } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { registerSymbolsHandlers } from '../../features/symbols.js';
import {
  createMockConnection,
  createMockServices,
  makeCacheEntry,
  sym,
} from '../helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface SetupOptions {
  symbols?: PikeSymbol[];
  uri?: string;
  noCache?: boolean;
  bridge?: any;
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

  registerSymbolsHandlers(conn as any, services as any, documents as any);

  return {
    documentSymbol: () => conn.documentSymbolHandler({ textDocument: { uri } }),
    uri,
  };
}

function findSymbol(result: DocumentSymbol[], name: string): DocumentSymbol | undefined {
  for (const s of result) {
    if (s.name === name) return s;
    if (s.children) {
      const found = findSymbol(s.children, name);
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Scenario 1: Basic symbol extraction — functions, classes, variables, constants, typedefs
// ---------------------------------------------------------------------------

describe('Scenario: basic symbol extraction', () => {
  it('should extract a function as SymbolKind.Method', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('main', 'method', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.name, 'main');
    assert.strictEqual(result[0]!.kind, SymbolKind.Method);
  });

  it('should extract a class as SymbolKind.Class', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('Foo', 'class', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.Class);
  });

  it('should extract a variable as SymbolKind.Variable', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 3 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.Variable);
  });

  it('should extract a constant as SymbolKind.Constant', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('VERSION', 'constant', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.name, 'VERSION');
    assert.strictEqual(result[0]!.kind, SymbolKind.Constant);
  });

  it('should extract a typedef as SymbolKind.TypeParameter', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('Handler', 'typedef', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.TypeParameter);
  });

  it('should extract mixed symbol types from a typical Pike file', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('import Stdio', 'import', { position: { file: 'test.pike', line: 1 } }),
        sym('MyClass', 'class', { position: { file: 'test.pike', line: 3 } }),
        sym('create', 'method', { position: { file: 'test.pike', line: 4 } }),
        sym('data', 'variable', { position: { file: 'test.pike', line: 5 } }),
        sym('MAX', 'constant', { position: { file: 'test.pike', line: 6 } }),
        sym('main', 'method', { position: { file: 'test.pike', line: 8 } }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 6);
    assert.strictEqual(result[0]!.kind, SymbolKind.Module);
    assert.strictEqual(result[1]!.kind, SymbolKind.Class);
    assert.strictEqual(result[2]!.kind, SymbolKind.Method);
    assert.strictEqual(result[3]!.kind, SymbolKind.Variable);
    assert.strictEqual(result[4]!.kind, SymbolKind.Constant);
    assert.strictEqual(result[5]!.kind, SymbolKind.Method);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Nested symbols and class hierarchy
// ---------------------------------------------------------------------------

describe('Scenario: nested symbols and class hierarchy', () => {
  it('should represent class with member methods as children', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('MyClass', 'class', {
          position: { file: 'test.pike', line: 1 },
          children: [
            sym('create', 'method', { position: { file: 'test.pike', line: 2 } }),
            sym('run', 'method', { position: { file: 'test.pike', line: 5 } }),
            sym('value', 'variable', { position: { file: 'test.pike', line: 8 } }),
          ],
        }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 1);

    const cls = result[0]!;
    assert.strictEqual(cls.name, 'MyClass');
    assert.strictEqual(cls.kind, SymbolKind.Class);
    assert.ok(cls.children);
    assert.strictEqual(cls.children!.length, 3);
    assert.strictEqual(cls.children![0]!.name, 'create');
    assert.strictEqual(cls.children![0]!.kind, SymbolKind.Method);
    assert.strictEqual(cls.children![1]!.name, 'run');
    assert.strictEqual(cls.children![1]!.kind, SymbolKind.Method);
    assert.strictEqual(cls.children![2]!.name, 'value');
    assert.strictEqual(cls.children![2]!.kind, SymbolKind.Variable);
  });

  it('should represent 3-level deep nesting', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('App', 'class', {
          position: { file: 'test.pike', line: 1 },
          children: [
            sym('Router', 'class', {
              position: { file: 'test.pike', line: 2 },
              children: [
                sym('routes', 'variable', { position: { file: 'test.pike', line: 3 } }),
                sym('match', 'method', { position: { file: 'test.pike', line: 4 } }),
              ],
            }),
          ],
        }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);

    const app = result[0]!;
    assert.strictEqual(app.name, 'App');
    assert.ok(app.children);
    assert.strictEqual(app.children!.length, 1);

    const router = app.children![0]!;
    assert.strictEqual(router.name, 'Router');
    assert.ok(router.children);
    assert.strictEqual(router.children!.length, 2);
    assert.strictEqual(router.children![0]!.name, 'routes');
    assert.strictEqual(router.children![1]!.name, 'match');
  });

  it('should handle class with no children', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('Empty', 'class', {
          position: { file: 'test.pike', line: 1 },
        }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.name, 'Empty');
    assert.strictEqual(result[0]!.children, undefined);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Pike construct symbol kind mapping
// ---------------------------------------------------------------------------

describe('Scenario: Pike construct symbol kind mapping', () => {
  it('should map inherit to SymbolKind.Class', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('base_module', 'inherit', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.Class);
  });

  it('should map import to SymbolKind.Module', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('Stdio', 'import', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.Module);
  });

  it('should map module to SymbolKind.Module', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('MyMod', 'module', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.Module);
  });

  it('should map enum to SymbolKind.Enum', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('Color', 'enum', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.Enum);
  });

  it('should map enum_constant to SymbolKind.EnumMember', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('RED', 'enum_constant', { position: { file: 'test.pike', line: 2 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.EnumMember);
  });

  it('should map unknown kinds to SymbolKind.Variable', async () => {
    const { documentSymbol } = setup({
      symbols: [{ name: 'weird', kind: 'lambda' as any, modifiers: [] } as PikeSymbol],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.kind, SymbolKind.Variable);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Empty and minimal documents
// ---------------------------------------------------------------------------

describe('Scenario: empty and minimal documents', () => {
  it('should return null when no cache entry exists', async () => {
    const { documentSymbol } = setup({ noCache: true });
    const result = await documentSymbol();
    assert.strictEqual(result, null);
  });

  it('should return empty array for empty symbol list', async () => {
    const { documentSymbol } = setup({ symbols: [] });
    const result = await documentSymbol();
    assert.deepStrictEqual(result, []);
  });

  it('should return single symbol correctly', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Comments-only document
// ---------------------------------------------------------------------------

describe('Scenario: comments-only document', () => {
  it('should return empty symbols for file with only comments', async () => {
    const { documentSymbol } = setup({ symbols: [] });
    const result = await documentSymbol();
    assert.deepStrictEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Large document performance
// ---------------------------------------------------------------------------

describe('Scenario: large document performance', () => {
  it('should handle 500 symbols in under 200ms', async () => {
    const symbols: PikeSymbol[] = [];
    for (let i = 0; i < 500; i++) {
      symbols.push(sym(`func_${i}`, 'method', { position: { file: 'test.pike', line: i + 1 } }));
    }
    const { documentSymbol } = setup({ symbols });

    const start = performance.now();
    const result = await documentSymbol();
    const elapsed = performance.now() - start;

    assert.ok(result);
    assert.strictEqual(result.length, 500);
    assert.ok(elapsed < 200, `Took ${elapsed}ms, expected < 200ms`);
  });

  it('should handle deeply nested structure (50 levels)', async () => {
    let inner: PikeSymbol = sym('leaf', 'variable', {
      position: { file: 'test.pike', line: 50 },
    });
    for (let i = 49; i >= 1; i--) {
      inner = sym(`Level${i}`, 'class', {
        position: { file: 'test.pike', line: i },
        children: [inner],
      });
    }
    const { documentSymbol } = setup({ symbols: [inner] });
    const result = await documentSymbol();
    assert.ok(result);

    let current = result[0]!;
    for (let i = 1; i <= 49; i++) {
      assert.strictEqual(current.name, `Level${i}`);
      assert.ok(current.children, `Level${i} should have children`);
      assert.strictEqual(current.children!.length, 1);
      current = current.children![0]!;
    }
    assert.strictEqual(current.name, 'leaf');
    assert.strictEqual(current.kind, SymbolKind.Variable);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Malformed code and edge cases
// ---------------------------------------------------------------------------

describe('Scenario: malformed code and edge cases', () => {
  it('should filter out symbols with null names', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('valid', 'variable', { position: { file: 'test.pike', line: 1 } }),
        { name: null as any, kind: 'variable', modifiers: [] } as any,
        sym('also_valid', 'method', { position: { file: 'test.pike', line: 2 } }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]!.name, 'valid');
    assert.strictEqual(result[1]!.name, 'also_valid');
  });

  it('should replace empty name with "unknown"', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.name, 'unknown');
  });

  it('should default to line 0 when position is missing', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('noPos', 'variable')],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.range.start.line, 0);
  });

  it('should handle duplicate symbol names at different lines', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('x', 'variable', { position: { file: 'test.pike', line: 1 } }),
        sym('x', 'variable', { position: { file: 'test.pike', line: 5 } }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]!.range.start.line, 0);
    assert.strictEqual(result[1]!.range.start.line, 4);
  });

  it('should convert Pike 1-based lines to LSP 0-based', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('a', 'variable', { position: { file: 'test.pike', line: 1 } }),
        sym('b', 'variable', { position: { file: 'test.pike', line: 10 } }),
        sym('c', 'variable', { position: { file: 'test.pike', line: 100 } }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.range.start.line, 0);
    assert.strictEqual(result[1]!.range.start.line, 9);
    assert.strictEqual(result[2]!.range.start.line, 99);
  });

  it('should clamp negative line numbers to 0', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'neg',
          kind: 'variable' as const,
          modifiers: [],
          position: { file: 'test.pike', line: -5 },
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.range.start.line, 0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Pike-specific constructs — mapping, multiset, enum
// ---------------------------------------------------------------------------

describe('Scenario: Pike-specific type constructs', () => {
  it('should show mapping type detail for variables', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'headers',
          kind: 'variable' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
          type: { name: 'mapping(string:string)' },
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, 'mapping(string:string)');
    assert.strictEqual(result[0]!.kind, SymbolKind.Variable);
  });

  it('should show multiset type detail for variables', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'tags',
          kind: 'variable' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
          type: { name: 'multiset(string)' },
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, 'multiset(string)');
  });

  it('should show array type detail for variables', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'items',
          kind: 'variable' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
          type: { name: 'array(int)' },
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, 'array(int)');
  });

  it('should represent enum with enum_constant members', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('Direction', 'enum', { position: { file: 'test.pike', line: 1 } }),
        sym('NORTH', 'enum_constant', { position: { file: 'test.pike', line: 2 } }),
        sym('SOUTH', 'enum_constant', { position: { file: 'test.pike', line: 3 } }),
        sym('EAST', 'enum_constant', { position: { file: 'test.pike', line: 4 } }),
        sym('WEST', 'enum_constant', { position: { file: 'test.pike', line: 5 } }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 5);
    assert.strictEqual(result[0]!.kind, SymbolKind.Enum);
    assert.strictEqual(result[1]!.kind, SymbolKind.EnumMember);
    assert.strictEqual(result[2]!.kind, SymbolKind.EnumMember);
    assert.strictEqual(result[3]!.kind, SymbolKind.EnumMember);
    assert.strictEqual(result[4]!.kind, SymbolKind.EnumMember);
  });

  it('should show inherit as SymbolKind.Class with classname', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('Stdio.File', 'inherit', {
          position: { file: 'test.pike', line: 1 },
          classname: 'Stdio.File',
        }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.name, 'Stdio.File');
    assert.strictEqual(result[0]!.kind, SymbolKind.Class);
  });

  it('should show import as SymbolKind.Module', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('Protocols.HTTP', 'import', {
          position: { file: 'test.pike', line: 1 },
        }),
        sym('SQL', 'import', {
          position: { file: 'test.pike', line: 2 },
        }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]!.kind, SymbolKind.Module);
    assert.strictEqual(result[1]!.kind, SymbolKind.Module);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: Symbol detail — type info, inheritance, conditionals
// ---------------------------------------------------------------------------

describe('Scenario: symbol detail strings', () => {
  it('should show returnType and argTypes for methods', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'add',
          kind: 'method' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
          returnType: { name: 'int' },
          argTypes: [{ name: 'int' }, { name: 'string' }],
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, 'int(int, string)');
  });

  it('should show mixed defaults for missing type info', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'fn',
          kind: 'method' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
          returnType: {},
          argTypes: [null as any],
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, 'mixed(mixed)');
  });

  it('should show inheritance info in detail', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'create',
          kind: 'method' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 3 },
          inherited: true,
          inheritedFrom: 'BaseClass',
          returnType: { name: 'void' },
          argTypes: [],
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, 'void() (from BaseClass)');
  });

  it('should show generic inherited marker when no source', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'destroy',
          kind: 'method' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 5 },
          inherited: true,
          returnType: { name: 'void' },
          argTypes: [],
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, 'void() (inherited)');
  });

  it('should set selectionRange end to name length', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('myVeryLongVariableName', 'variable', {
          position: { file: 'test.pike', line: 1 },
        }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.selectionRange.end.character, 22);
    assert.strictEqual(result[0]!.selectionRange.start.character, 0);
  });

  it('should set range end character to 1000 (full line)', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 5 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.range.end.character, 1000);
    assert.strictEqual(result[0]!.range.start.line, 4);
  });

  it('should show type name for non-method symbols', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'count',
          kind: 'variable' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
          type: { name: 'int' },
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, 'int');
  });

  it('should omit detail when no type info is available', async () => {
    const { documentSymbol } = setup({
      symbols: [sym('bare', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result[0]!.detail, undefined);
  });
});

// ---------------------------------------------------------------------------
// Scenario 10: Realistic Pike file simulation
// ---------------------------------------------------------------------------

describe('Scenario: realistic Pike file outline', () => {
  it('should produce correct outline for a typical Pike module', async () => {
    const symbols: PikeSymbol[] = [
      sym('Stdio', 'import', { position: { file: 'test.pike', line: 1 } }),
      sym('Protocols.HTTP', 'import', { position: { file: 'test.pike', line: 2 } }),
      sym('Base', 'inherit', { position: { file: 'test.pike', line: 4 } }),
      sym('DEFAULT_PORT', 'constant', { position: { file: 'test.pike', line: 6 } }),
      sym('Handler', 'typedef', { position: { file: 'test.pike', line: 8 } }),
      sym('Color', 'enum', {
        position: { file: 'test.pike', line: 10 },
        children: [
          sym('RED', 'enum_constant', { position: { file: 'test.pike', line: 11 } }),
          sym('GREEN', 'enum_constant', { position: { file: 'test.pike', line: 12 } }),
        ],
      }),
      sym('Server', 'class', {
        position: { file: 'test.pike', line: 15 },
        children: [
          sym('port', 'variable', { position: { file: 'test.pike', line: 16 } }),
          sym('create', 'method', {
            position: { file: 'test.pike', line: 18 },
            returnType: { name: 'void' },
            argTypes: [{ name: 'int' }],
          }),
          sym('start', 'method', {
            position: { file: 'test.pike', line: 22 },
            returnType: { name: 'void' },
            argTypes: [],
          }),
          sym('stop', 'method', {
            position: { file: 'test.pike', line: 26 },
            returnType: { name: 'void' },
            argTypes: [],
          }),
        ],
      }),
      sym('Config', 'module', {
        position: { file: 'test.pike', line: 30 },
        children: [sym('load', 'method', { position: { file: 'test.pike', line: 31 } })],
      }),
    ];

    const { documentSymbol } = setup({ symbols });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 8);

    assert.strictEqual(result[0]!.name, 'Stdio');
    assert.strictEqual(result[0]!.kind, SymbolKind.Module);

    assert.strictEqual(result[1]!.name, 'Protocols.HTTP');
    assert.strictEqual(result[1]!.kind, SymbolKind.Module);

    assert.strictEqual(result[2]!.name, 'Base');
    assert.strictEqual(result[2]!.kind, SymbolKind.Class);

    assert.strictEqual(result[3]!.name, 'DEFAULT_PORT');
    assert.strictEqual(result[3]!.kind, SymbolKind.Constant);

    assert.strictEqual(result[4]!.name, 'Handler');
    assert.strictEqual(result[4]!.kind, SymbolKind.TypeParameter);

    const color = result[5]!;
    assert.strictEqual(color.name, 'Color');
    assert.strictEqual(color.kind, SymbolKind.Enum);
    assert.ok(color.children);
    assert.strictEqual(color.children!.length, 2);
    assert.strictEqual(color.children![0]!.kind, SymbolKind.EnumMember);
    assert.strictEqual(color.children![1]!.kind, SymbolKind.EnumMember);

    const server = result[6]!;
    assert.strictEqual(server.name, 'Server');
    assert.strictEqual(server.kind, SymbolKind.Class);
    assert.ok(server.children);
    assert.strictEqual(server.children!.length, 4);
    assert.strictEqual(server.children![0]!.name, 'port');
    assert.strictEqual(server.children![0]!.kind, SymbolKind.Variable);
    assert.strictEqual(server.children![1]!.name, 'create');
    assert.strictEqual(server.children![1]!.kind, SymbolKind.Method);
    assert.strictEqual(server.children![1]!.detail, 'void(int)');
    assert.strictEqual(server.children![2]!.name, 'start');
    assert.strictEqual(server.children![2]!.detail, 'void()');
    assert.strictEqual(server.children![3]!.name, 'stop');

    const config = result[7]!;
    assert.strictEqual(config.name, 'Config');
    assert.strictEqual(config.kind, SymbolKind.Module);
    assert.ok(config.children);
    assert.strictEqual(config.children!.length, 1);
  });

  it('should handle file with only top-level functions', async () => {
    const { documentSymbol } = setup({
      symbols: [
        {
          name: 'parse_input',
          kind: 'method' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
          returnType: { name: 'array' },
          argTypes: [{ name: 'string' }],
        } as unknown as PikeSymbol,
        {
          name: 'format_output',
          kind: 'method' as const,
          modifiers: [],
          position: { file: 'test.pike', line: 5 },
          returnType: { name: 'string' },
          argTypes: [{ name: 'mapping' }],
        } as unknown as PikeSymbol,
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]!.detail, 'array(string)');
    assert.strictEqual(result[1]!.detail, 'string(mapping)');
  });

  it('should handle symbols with special characters in names', async () => {
    const { documentSymbol } = setup({
      symbols: [
        sym('`+()', 'method', { position: { file: 'test.pike', line: 1 } }),
        sym('`[]', 'method', { position: { file: 'test.pike', line: 2 } }),
        sym('_my_var_123', 'variable', { position: { file: 'test.pike', line: 3 } }),
      ],
    });
    const result = await documentSymbol();
    assert.ok(result);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0]!.name, '`+()');
    assert.strictEqual(result[1]!.name, '`[]');
    assert.strictEqual(result[2]!.name, '_my_var_123');
  });
});
