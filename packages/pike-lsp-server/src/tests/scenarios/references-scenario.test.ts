/**
 * References Scenario Tests (#1061)
 *
 * Exercises real code paths through registerReferencesHandlers with
 * minimal mocking. Uses real TextDocument objects, real positions,
 * and real handler registration.
 *
 * Covers: find all refs, include/exclude declaration, cross-file,
 * no refs, edge cases (empty, EOF, comments, recursive self-refs,
 * large docs, duplicates).
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { registerReferencesHandlers } from '../../features/navigation/references.js';
import {
  createMockConnection,
  createMockDocuments,
  createMockServices,
  makeCacheEntry,
  sym,
} from '../helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface SetupOptions {
  code: string;
  uri?: string;
  symbols?: PikeSymbol[];
  symbolPositions?: Map<string, { line: number; character: number }[]>;
  noCache?: boolean;
  noDocument?: boolean;
  extraDocs?: Map<string, TextDocument>;
  extraCacheEntries?: Map<string, DocumentCacheEntry>;
  bridge?: any;
}

function setup(opts: SetupOptions) {
  const uri = opts.uri ?? 'file:///test.pike';
  const doc = TextDocument.create(uri, 'pike', 1, opts.code);

  const docsMap = new Map<string, TextDocument>();
  if (!opts.noDocument) {
    docsMap.set(uri, doc);
  }
  if (opts.extraDocs) {
    for (const [u, d] of opts.extraDocs) {
      docsMap.set(u, d);
    }
  }

  const cacheEntries = opts.extraCacheEntries ?? new Map<string, DocumentCacheEntry>();
  if (!opts.noCache) {
    cacheEntries.set(
      uri,
      makeCacheEntry({
        symbols: opts.symbols ?? [],
        symbolPositions: opts.symbolPositions ?? new Map(),
      })
    );
  }

  const services = createMockServices({
    cacheEntries,
    bridge: opts.bridge ?? null,
  });
  const documents = createMockDocuments(docsMap);
  const conn = createMockConnection();

  registerReferencesHandlers(conn as any, services as any, documents as any);

  return {
    references: (line: number, character: number, includeDeclaration = true) =>
      conn.referencesHandler({
        textDocument: { uri },
        position: { line, character },
        context: { includeDeclaration },
      }),
    highlight: (line: number, character: number) =>
      conn.documentHighlightHandler({
        textDocument: { uri },
        position: { line, character },
      }),
    uri,
    conn,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Find all references via text search
// ---------------------------------------------------------------------------

describe('Scenario: find all references via text search', () => {
  it('should find all occurrences of a known variable', async () => {
    const code = 'int count = 0;\ncount += 1;\nwrite((string)count);';
    const { references } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(1, 1);
    assert.ok(result.length >= 2);
    const lines = result.map(r => r.range.start.line);
    assert.ok(lines.includes(0));
    assert.ok(lines.includes(1));
  });

  it('should find references using symbolPositions index', async () => {
    const code = 'int count = 0;\ncount += 1;\nwrite((string)count);';
    const symbolPositions = new Map<string, { line: number; character: number }[]>();
    symbolPositions.set('count', [
      { line: 0, character: 4 },
      { line: 1, character: 0 },
      { line: 2, character: 16 },
    ]);

    const { references } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
      symbolPositions,
    });

    const result = await references(1, 1);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].range.start.line, 0);
    assert.strictEqual(result[1].range.start.line, 1);
    assert.strictEqual(result[2].range.start.line, 2);
  });

  it('should find method references across a file', async () => {
    const code = [
      'class Handler {',
      '  void process() {}',
      '};',
      'Handler h = Handler();',
      'h->process();',
      'h->process();',
    ].join('\n');

    const { references } = setup({
      code,
      symbols: [
        sym('Handler', 'class', { position: { file: 'test.pike', line: 1 } }),
        sym('process', 'method', { position: { file: 'test.pike', line: 2 } }),
        sym('h', 'variable', { position: { file: 'test.pike', line: 4 } }),
      ],
    });

    const result = await references(4, 4);
    assert.ok(result.length >= 1);
  });

  it('should find class name references', async () => {
    const code = 'class Foo {\n  int val;\n};\nFoo bar = Foo();\nFoo baz;';
    const { references } = setup({
      code,
      symbols: [
        sym('Foo', 'class', { position: { file: 'test.pike', line: 1 } }),
        sym('val', 'variable', { position: { file: 'test.pike', line: 2 } }),
        sym('bar', 'variable', { position: { file: 'test.pike', line: 4 } }),
        sym('baz', 'variable', { position: { file: 'test.pike', line: 5 } }),
      ],
    });

    const result = await references(3, 1);
    assert.ok(result.length >= 1);
    const uris = result.map(r => r.uri);
    assert.ok(uris.every(u => u === 'file:///test.pike'));
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Include/exclude declaration
// ---------------------------------------------------------------------------

describe('Scenario: include/exclude declaration', () => {
  it('should include declaration by default', async () => {
    const code = 'int count = 0;\ncount += 1;';
    const symbolPositions = new Map<string, { line: number; character: number }[]>();
    symbolPositions.set('count', [
      { line: 0, character: 4 },
      { line: 1, character: 0 },
    ]);

    const { references } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
      symbolPositions,
    });

    const result = await references(1, 1, true);
    assert.strictEqual(result.length, 2);
  });

  it('should exclude declaration when includeDeclaration is false', async () => {
    const code = 'int count = 0;\ncount += 1;';
    const symbolPositions = new Map<string, { line: number; character: number }[]>();
    symbolPositions.set('count', [
      { line: 0, character: 4 },
      { line: 1, character: 0 },
    ]);

    const { references } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
      symbolPositions,
    });

    const withDecl = await references(1, 1, true);
    const withoutDecl = await references(1, 1, false);

    assert.ok(withDecl.length > withoutDecl.length);
    assert.ok(withoutDecl.every(r => r.range.start.line !== 0));
  });

  it('should return all refs when declaration cannot be determined', async () => {
    const code = 'process();\nprocess();';
    const { references } = setup({
      code,
      symbols: [sym('process', 'method', { position: { file: 'other.pike', line: 5 } })],
    });

    const withDecl = await references(0, 1, true);
    const withoutDecl = await references(0, 1, false);

    assert.ok(withDecl.length >= 1);
    assert.ok(withoutDecl.length >= 1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Cross-file references
// ---------------------------------------------------------------------------

describe('Scenario: cross-file references', () => {
  it('should find references in other cached documents', async () => {
    const mainUri = 'file:///main.pike';
    const otherUri = 'file:///other.pike';

    const mainCode = 'int count = 0;\ncount += 1;';
    const otherCode = 'int x = count;';

    const extraDocs = new Map<string, TextDocument>();
    extraDocs.set(otherUri, TextDocument.create(otherUri, 'pike', 1, otherCode));

    const extraCache = new Map<string, DocumentCacheEntry>();
    extraCache.set(otherUri, {
      version: 1,
      diagnostics: [],
      symbolPositions: null as any,
      symbolNames: new Map(),
      symbols: [],
    });

    const { references } = setup({
      code: mainCode,
      uri: mainUri,
      symbols: [sym('count', 'variable', { position: { file: 'main.pike', line: 1 } })],
      extraDocs,
      extraCacheEntries: extraCache,
    });

    const result = await references(1, 1);
    const uris = result.map(r => r.uri);
    assert.ok(uris.includes(mainUri));
    assert.ok(uris.includes(otherUri));
  });

  it('should find references in other docs via text search', async () => {
    const mainUri = 'file:///main.pike';
    const otherUri = 'file:///util.pike';

    const mainCode = 'int count = 0;\ncount += 1;';
    const otherCode = 'write((string)count);';

    const extraDocs = new Map<string, TextDocument>();
    extraDocs.set(otherUri, TextDocument.create(otherUri, 'pike', 1, otherCode));

    const otherCacheEntry: DocumentCacheEntry = {
      version: 1,
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      symbols: [],
    };

    const extraCache = new Map<string, DocumentCacheEntry>();
    extraCache.set(otherUri, otherCacheEntry);

    const { references } = setup({
      code: mainCode,
      uri: mainUri,
      symbols: [sym('count', 'variable', { position: { file: 'main.pike', line: 1 } })],
      extraDocs,
      extraCacheEntries: extraCache,
    });

    const result = await references(1, 1);
    assert.ok(result.length >= 2, `Expected at least 2 refs, got ${result.length}`);
    const allUris = result.map(r => r.uri);
    assert.ok(allUris.includes(mainUri), `Missing main URI in results: ${allUris}`);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: No references found
// ---------------------------------------------------------------------------

describe('Scenario: no references found', () => {
  it('should return empty array for unknown symbol', async () => {
    const code = 'int x = 1;\nint y = 2;';
    const { references } = setup({
      code,
      symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(1, 4);
    assert.deepStrictEqual(result, []);
  });

  it('should return empty array when no cache', async () => {
    const code = 'int x = 1;';
    const { references } = setup({ code, noCache: true });

    const result = await references(0, 4);
    assert.deepStrictEqual(result, []);
  });

  it('should return empty array when no document', async () => {
    const code = 'int x = 1;';
    const { references } = setup({ code, noDocument: true });

    const result = await references(0, 4);
    assert.deepStrictEqual(result, []);
  });

  it('should return empty array for cursor on whitespace', async () => {
    const code = 'int x = 1;\n\nint y = 2;';
    const { references } = setup({
      code,
      symbols: [
        sym('x', 'variable', { position: { file: 'test.pike', line: 1 } }),
        sym('y', 'variable', { position: { file: 'test.pike', line: 3 } }),
      ],
    });

    const result = await references(1, 0);
    assert.deepStrictEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Edge cases — empty and minimal documents
// ---------------------------------------------------------------------------

describe('Scenario: edge cases — empty and minimal documents', () => {
  it('should return empty array for empty document', async () => {
    const code = '';
    const { references } = setup({ code, symbols: [] });

    const result = await references(0, 0);
    assert.deepStrictEqual(result, []);
  });

  it('should return empty array for whitespace-only document', async () => {
    const code = '   \n   ';
    const { references } = setup({ code, symbols: [] });

    const result = await references(0, 1);
    assert.deepStrictEqual(result, []);
  });

  it('should handle EOF position', async () => {
    const code = 'int x = 1;';
    const { references } = setup({
      code,
      symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(0, 100);
    assert.deepStrictEqual(result, []);
  });

  it('should handle position beyond document lines', async () => {
    const code = 'int x = 1;';
    const { references } = setup({
      code,
      symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(50, 0);
    assert.deepStrictEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Edge cases — comments
// ---------------------------------------------------------------------------

describe('Scenario: edge cases — comments', () => {
  it('should exclude references inside line comments', async () => {
    const code = 'int count = 0;\n// count is a counter\ncount += 1;';
    const symbolPositions = new Map<string, { line: number; character: number }[]>();
    symbolPositions.set('count', [
      { line: 0, character: 4 },
      { line: 2, character: 0 },
    ]);

    const { references } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
      symbolPositions,
    });

    const result = await references(2, 1);
    assert.strictEqual(result.length, 2);
    const lines = result.map(r => r.range.start.line);
    assert.ok(!lines.includes(1));
  });

  it('should exclude references inside block comments', async () => {
    const code = 'int val = 1;\n/* val is used */\nint x = val;';
    const { references } = setup({
      code,
      symbols: [sym('val', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(2, 8);
    assert.ok(result.length >= 1);
    const commentRefs = result.filter(r => r.range.start.line === 1);
    assert.strictEqual(commentRefs.length, 0);
  });

  it('should exclude references inside string literals', async () => {
    const code = 'int name = 0;\nstring s = "name";\nwrite((string)name);';
    const { references } = setup({
      code,
      symbols: [sym('name', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(0, 4);
    assert.ok(result.length >= 1);
    const stringRefs = result.filter(r => r.range.start.line === 1);
    assert.strictEqual(stringRefs.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Edge cases — recursive self-references
// ---------------------------------------------------------------------------

describe('Scenario: edge cases — recursive self-references', () => {
  it('should handle function calling itself', async () => {
    const code = 'void recurse(int n) {\n  if (n > 0) recurse(n - 1);\n}';
    const { references } = setup({
      code,
      symbols: [
        sym('recurse', 'method', { position: { file: 'test.pike', line: 1 } }),
        sym('n', 'variable', { position: { file: 'test.pike', line: 1 } }),
      ],
    });

    const result = await references(1, 14);
    assert.ok(result.length >= 2);
    const lines = result.map(r => r.range.start.line);
    assert.ok(lines.includes(0));
    assert.ok(lines.includes(1));
  });

  it('should handle variable assigned to itself', async () => {
    const code = 'int x = 1;\nx = x + 1;';
    const { references } = setup({
      code,
      symbols: [sym('x', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(1, 0);
    assert.ok(result.length >= 1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Edge cases — large documents
// ---------------------------------------------------------------------------

describe('Scenario: edge cases — large document performance', () => {
  it('should find references in under 200ms for 1000-line file', async () => {
    const lines = ['int count = 0;'];
    for (let i = 1; i < 1000; i++) {
      lines.push(`int var_${i} = count + ${i};`);
    }
    const code = lines.join('\n');

    const symbols = [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })];

    const { references } = setup({ code, symbols });
    const start = performance.now();
    const result = await references(0, 4);
    const elapsed = performance.now() - start;

    assert.ok(result.length >= 1);
    assert.ok(elapsed < 200, `Took ${elapsed}ms, expected < 200ms`);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: Edge cases — duplicates
// ---------------------------------------------------------------------------

describe('Scenario: edge cases — duplicate references', () => {
  it('should deduplicate references from different sources', async () => {
    const code = 'int count = 0;\ncount += 1;\nwrite((string)count);';
    const symbolPositions = new Map<string, { line: number; character: number }[]>();
    symbolPositions.set('count', [
      { line: 0, character: 4 },
      { line: 1, character: 0 },
      { line: 2, character: 16 },
    ]);

    const { references } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
      symbolPositions,
    });

    const result = await references(1, 1);
    const keys = result.map(r => `${r.uri}:${r.range.start.line}:${r.range.start.character}`);
    const uniqueKeys = new Set(keys);
    assert.strictEqual(keys.length, uniqueKeys.size);
  });

  it('should deduplicate when query-engine and fallback overlap', async () => {
    const code = 'int value = 1;\nint x = value;';
    const { references } = setup({
      code,
      symbols: [
        {
          name: 'value',
          kind: 'variable',
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
        },
      ],
      bridge: {
        isRunning: () => true,
        engineQuery: async () => ({
          requestId: 'req-ref-1',
          snapshotIdUsed: 'snp-1',
          result: {
            locations: [
              {
                uri: 'file:///test.pike',
                range: {
                  start: { line: 0, character: 4 },
                  end: { line: 0, character: 9 },
                },
              },
            ],
          },
        }),
      },
    });

    const result = await references(1, 8);
    const keys = result.map(r => `${r.uri}:${r.range.start.line}:${r.range.start.character}`);
    const uniqueKeys = new Set(keys);
    assert.strictEqual(keys.length, uniqueKeys.size);
  });
});

// ---------------------------------------------------------------------------
// Scenario 10: Document highlight
// ---------------------------------------------------------------------------

describe('Scenario: document highlight', () => {
  it('should highlight all occurrences of word at cursor', async () => {
    const code = 'int count = 0;\ncount += 1;\nwrite((string)count);';
    const { highlight } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await highlight(1, 0);
    assert.ok(result);
    assert.ok(result.length >= 2);
  });

  it('should return null for short words (less than 2 chars)', async () => {
    const code = 'int a = 1;';
    const { highlight } = setup({
      code,
      symbols: [sym('a', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await highlight(0, 4);
    assert.strictEqual(result, null);
  });

  it('should return null when no document', async () => {
    const code = 'int foo = 1;';
    const { highlight } = setup({
      code,
      noDocument: true,
      symbols: [sym('foo', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await highlight(0, 4);
    assert.strictEqual(result, null);
  });

  it('should return null for cursor on whitespace', async () => {
    const code = 'int foo = 1;\n\nint bar = 2;';
    const { highlight } = setup({
      code,
      symbols: [sym('foo', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await highlight(1, 0);
    assert.strictEqual(result, null);
  });

  it('should provide semantic highlights with symbolPositions', async () => {
    const code = 'int count = 0;\ncount += 1;\nwrite((string)count);';
    const symbolPositions = new Map<string, { line: number; character: number }[]>();
    symbolPositions.set('count', [
      { line: 0, character: 4 },
      { line: 1, character: 0 },
      { line: 2, character: 16 },
    ]);

    const { highlight } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
      symbolPositions,
    });

    const result = await highlight(1, 0);
    assert.ok(result);
    assert.strictEqual(result.length, 3);
  });
});

// ---------------------------------------------------------------------------
// Scenario 11: Word boundary detection
// ---------------------------------------------------------------------------

describe('Scenario: word boundary detection', () => {
  it('should not match symbol name inside longer words', async () => {
    const code = 'int count = 0;\nint counter = count;';
    const { references } = setup({
      code,
      symbols: [
        sym('count', 'variable', { position: { file: 'test.pike', line: 1 } }),
        sym('counter', 'variable', { position: { file: 'test.pike', line: 2 } }),
      ],
    });

    const result = await references(0, 4);
    assert.ok(result.length >= 1);
    const line1Refs = result.filter(r => r.range.start.line === 1);
    for (const ref of line1Refs) {
      const refCode = code.split('\n')[ref.range.start.line] ?? '';
      const word = refCode.slice(ref.range.start.character, ref.range.end.character);
      assert.strictEqual(word, 'count');
    }
  });

  it('should match word between non-word characters', async () => {
    const code = 'int count = 0;\ncount=count+1;';
    const { references } = setup({
      code,
      symbols: [sym('count', 'variable', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(1, 0);
    assert.ok(result.length >= 2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 12: Symbol on same line as type annotation
// ---------------------------------------------------------------------------

describe('Scenario: symbol on type annotation line', () => {
  it('should find symbol when cursor is on return type of method', async () => {
    const code = 'void process() {\n  process();\n}';
    const { references } = setup({
      code,
      symbols: [sym('process', 'method', { position: { file: 'test.pike', line: 1 } })],
    });

    const result = await references(0, 6);
    assert.ok(result.length >= 1);
  });
});
