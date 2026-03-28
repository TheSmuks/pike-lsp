/**
 * References Provider Tests
 *
 * Tests for find-all-references and document highlight handlers.
 * Exercises registerReferencesHandlers() via MockConnection.
 *
 * Test scenarios:
 * - Find references with text-based search
 * - Find references with symbolPositions index
 * - Document highlight (all occurrences of word at cursor)
 * - Edge cases: empty cache, short words, large files
 */

import { DocumentHighlightKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerReferencesHandlers } from '../../features/navigation/references.js';
import {
  createMockConnection,
  createMockDocuments,
  createMockServices,
  makeCacheEntry,
  createMockWorkspaceScanner,
} from '../helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';

const { describe, it, expect } = require('bun:test');

// =============================================================================
// Setup helpers
// =============================================================================

interface SetupOptions {
  code: string;
  uri?: string;
  symbols?: PikeSymbol[];
  symbolPositions?: Map<string, { line: number; character: number }[]>;
  noCache?: boolean;
  noDocument?: boolean;
  extraDocs?: Map<string, TextDocument>;
  extraCacheEntries?: Map<string, DocumentCacheEntry>;
  workspaceScanner?: any;
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
    workspaceScanner: opts.workspaceScanner,
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

// =============================================================================
// References Provider Tests
// =============================================================================

describe('References Provider', () => {
  it('uses query-engine references when available', async () => {
    const code = `int value = 1;\nint x = value;`;

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
                uri: 'file:///query-references.pike',
                range: {
                  start: { line: 3, character: 4 },
                  end: { line: 3, character: 9 },
                },
              },
            ],
          },
        }),
      },
    });

    const result = await references(1, 8);
    expect(result).toHaveLength(3);
    expect(result.some(item => item.uri === 'file:///query-references.pike')).toBe(true);
    expect(result.some(item => item.uri === 'file:///test.pike')).toBe(true);
  });

  it('dedupes query-engine and fallback references with same location', async () => {
    const code = `int value = 1;\nint x = value;`;

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
          requestId: 'req-ref-dup',
          snapshotIdUsed: 'snp-dup',
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
    expect(result).toHaveLength(2);
    expect(result.filter(item => item.uri === 'file:///test.pike')).toHaveLength(2);
  });

  it('keeps parity with fallback when query returns stub', async () => {
    const code = `int item = 1;\nint y = item;\nitem = 2;`;
    const symbols = [
      {
        name: 'item',
        kind: 'variable' as const,
        modifiers: [],
        position: { file: 'test.pike', line: 1 },
      },
    ];

    const withoutQuery = setup({ code, symbols });
    const withStubQuery = setup({
      code,
      symbols,
      bridge: {
        isRunning: () => true,
        engineQuery: async () => ({
          requestId: 'req-ref-stub',
          snapshotIdUsed: 'snp-stub',
          result: {
            result: { status: 'stub' },
          },
        }),
      },
    });

    const baseline = await withoutQuery.references(1, 8);
    const stubbed = await withStubQuery.references(1, 8);

    expect(stubbed).toEqual(baseline);
  });

  it('keeps references handler p95 non-regressing with query stub path', async () => {
    const code = `int sample = 1;\nint z = sample;\nsample = z + sample;`;
    const symbols = [
      {
        name: 'sample',
        kind: 'variable' as const,
        modifiers: [],
        position: { file: 'test.pike', line: 1 },
      },
    ];

    const baselineSetup = setup({ code, symbols });
    const querySetup = setup({
      code,
      symbols,
      bridge: {
        isRunning: () => true,
        engineQuery: async () => ({
          requestId: 'req-ref-latency',
          snapshotIdUsed: 'snp-latency',
          result: { result: { status: 'stub' } },
        }),
      },
    });

    const iterations = 30;
    const baselineTimes: number[] = [];
    const queryTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const baselineStart = performance.now();
      await baselineSetup.references(1, 8);
      baselineTimes.push(performance.now() - baselineStart);

      const queryStart = performance.now();
      await querySetup.references(1, 8);
      queryTimes.push(performance.now() - queryStart);
    }

    const p95 = (values: number[]): number => {
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
      return sorted[idx] ?? 0;
    };

    const baselineP95 = p95(baselineTimes);
    const queryP95 = p95(queryTimes);
    expect(queryP95).toBeLessThanOrEqual(baselineP95 * 2.0 + 1.0);
  });

  it('does not scan uncached workspace files for symbol-unsafe fallback results', async () => {
    const previousMax = process.env['PIKE_LSP_REFERENCES_MAX_WORKSPACE_FILES'];
    process.env['PIKE_LSP_REFERENCES_MAX_WORKSPACE_FILES'] = '1';

    const dir = await mkdtemp(join(tmpdir(), 'pike-lsp-refs-'));
    try {
      const firstPath = join(dir, 'first.pmod');
      const secondPath = join(dir, 'second.pmod');
      await writeFile(firstPath, 'int shared = 1;\nshared++;\n', 'utf-8');
      await writeFile(secondPath, 'int shared = 1;\nshared += 2;\n', 'utf-8');

      const firstUri = `file://${firstPath}`;
      const secondUri = `file://${secondPath}`;
      const scanner = createMockWorkspaceScanner([
        { uri: firstUri, content: '' },
        { uri: secondUri, content: '' },
      ]);

      const { references } = setup({
        uri: 'file:///module.pmod',
        code: 'int shared = 0;\nshared++;\n',
        symbols: [
          {
            name: 'shared',
            kind: 'variable',
            modifiers: [],
            position: { file: 'module.pmod', line: 1 },
          },
        ],
        workspaceScanner: scanner,
      });

      const result = await references(0, 5);
      const uris = new Set(result.map(item => item.uri));
      expect(uris.has(firstUri)).toBe(false);
      expect(uris.has(secondUri)).toBe(false);
    } finally {
      if (previousMax === undefined) {
        delete process.env['PIKE_LSP_REFERENCES_MAX_WORKSPACE_FILES'];
      } else {
        process.env['PIKE_LSP_REFERENCES_MAX_WORKSPACE_FILES'] = previousMax;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('should not register implementation handler (owned by implementation.ts)', () => {
    const { conn } = setup({
      code: 'class Base {}',
      symbols: [],
    });

    expect(() => conn.implementationHandler).toThrow('No implementation handler registered');
  });

  /**
   * Test 6.1: Find References - Local Variable
   */
  describe('Scenario 6.1: Find references - local variable', () => {
    it('should find all references including declaration via text search', async () => {
      const code = `int myVar = 42;
int x = myVar;
myVar = 10;
int y = myVar + x;`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      // Cursor on "myVar" at line 0, char 4
      const result = await references(0, 5);
      // Text search finds all 4 occurrences of "myVar" as whole words
      expect(result.length).toBe(4);
      // All should be in the same file
      for (const loc of result) {
        expect(loc.uri).toBe('file:///test.pike');
      }
    });

    it('should handle references in different contexts', async () => {
      const code = `int count = 0;
count++;
write(count);
if (count > 0) {}`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'count',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      const result = await references(0, 5);
      expect(result.length).toBe(4);
    });
  });

  /**
   * Test 6.2: Find References - Function
   */
  describe('Scenario 6.2: Find references - function', () => {
    it('should find function references in single file', async () => {
      const code = `void myFunction() { }
myFunction();
myFunction();`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myFunction',
            kind: 'method',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      const result = await references(0, 6);
      // 3 occurrences: declaration + 2 calls
      expect(result.length).toBe(3);
    });
  });

  /**
   * Test 6.3: Find References - Class Method
   */
  describe('Scenario 6.3: Find references - class method', () => {
    it('should find method references via text search', async () => {
      const code = `class MyClass {
    void method() { }
}
MyClass obj = MyClass();
obj->method();
obj->method();`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'method',
            kind: 'method',
            modifiers: [],
            position: { file: 'test.pike', line: 2 },
          },
        ],
      });

      // Cursor on "method" at line 1, char 9
      const result = await references(1, 10);
      // Text search finds "method" on lines 1, 4, 5 (3 occurrences)
      expect(result.length).toBe(3);
    });

    it('should handle method calls on different instances', async () => {
      const code = `void process() { }
process();
int y = process();`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'process',
            kind: 'method',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      const result = await references(0, 6);
      expect(result.length).toBe(3);
    });
  });

  /**
   * Test 6.4: Find References - Exclude Declaration
   * The handler now supports includeDeclaration=false.
   * When false, the declaration location is excluded from results.
   */
  describe('Scenario 6.4: Find references - exclude declaration', () => {
    it('should exclude declaration when includeDeclaration=false', async () => {
      const code = `int myVar = 42;
int x = myVar;
myVar = 10;`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      // includeDeclaration=false excludes the declaration (line 0)
      const result = await references(0, 5, false);
      expect(result.length).toBe(2);
      // Verify remaining references are on lines 1 and 2
      expect(result[0]!.range.start.line).toBe(1);
      expect(result[1]!.range.start.line).toBe(2);
    });

    it('should include declaration when includeDeclaration=true', async () => {
      const code = `int myVar = 42;
int x = myVar;`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      // includeDeclaration=true includes all references (default behavior)
      const result = await references(0, 5, true);
      expect(result.length).toBe(2);
    });

    it('should return empty when only declaration exists and includeDeclaration=false', async () => {
      const code = `int unusedVar = 42;`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'unusedVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      // Only declaration exists, should return empty when excluded
      const result = await references(0, 5, false);
      expect(result.length).toBe(0);
    });

    it('should filter declaration from symbolPositions results', async () => {
      const code = `int myVar = 42;
int x = myVar;
myVar = 10;`;

      const positions = new Map<string, { line: number; character: number }[]>();
      positions.set('myVar', [
        { line: 0, character: 4 }, // Declaration
        { line: 1, character: 8 }, // Usage
        { line: 2, character: 0 }, // Usage
      ]);

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions: positions,
      });

      // Symbol positions should be filtered
      const result = await references(0, 5, false);
      expect(result.length).toBe(2);
      expect(result[0]!.range.start.line).toBe(1);
      expect(result[1]!.range.start.line).toBe(2);
    });

    it('should keep same-line usages when excluding declaration', async () => {
      const code = `int myVar = myVar + 1;`;

      const positions = new Map<string, { line: number; character: number }[]>();
      positions.set('myVar', [
        { line: 0, character: 4 },
        { line: 0, character: 12 },
      ]);

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions: positions,
      });

      const result = await references(0, 5, false);
      expect(result.length).toBe(1);
      expect(result[0]!.range.start.line).toBe(0);
      expect(result[0]!.range.start.character).toBe(12);
    });

    it('should exclude declaration regardless of cursor position', async () => {
      const code = `void myFunc() {}
myFunc();
myFunc();`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myFunc',
            kind: 'method',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      // Cursor on usage (line 1), but declaration still excluded
      const result = await references(1, 1, false);
      expect(result.length).toBe(2);
      // Both usages, no declaration
      expect(result.every(r => r.range.start.line !== 0)).toBe(true);
    });
  });

  /**
   * Test 6.5: Find References - Across Multiple Files
   */
  describe('Scenario 6.5: Find references - across multiple files', () => {
    it('should find references across multiple open documents for .pmod files', async () => {
      const mainCode = `int myVar = 42;
int x = myVar;`;
      const otherCode = `myVar = 10;`;

      const positions = new Map<string, { line: number; character: number }[]>();
      positions.set('myVar', [
        { line: 0, character: 4 },
        { line: 1, character: 8 },
      ]);

      const otherPositions = new Map<string, { line: number; character: number }[]>();
      otherPositions.set('myVar', [{ line: 0, character: 0 }]);

      const { references } = setup({
        code: mainCode,
        uri: 'file:///main.pmod/Test.pmod', // Use .pmod for cross-file references
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'main.pmod', line: 1 },
          },
        ],
        symbolPositions: positions,
        extraDocs: new Map([
          [
            'file:///other.pmod/Test2.pmod',
            TextDocument.create('file:///other.pmod/Test2.pmod', 'pike', 1, otherCode),
          ],
        ]),
        extraCacheEntries: new Map([
          [
            'file:///other.pmod/Test2.pmod',
            makeCacheEntry({
              symbols: [],
              symbolPositions: otherPositions,
            }),
          ],
        ]),
      });

      const result = await references(0, 5);
      // Should find references in both files for .pmod
      expect(result.length).toBe(3);
      expect(result.some(r => r.uri === 'file:///main.pmod/Test.pmod')).toBe(true);
      expect(result.some(r => r.uri === 'file:///other.pmod/Test2.pmod')).toBe(true);
    });

    it('should find references across multiple open documents for .pike files', async () => {
      const mainCode = `int myVar = 42;
int x = myVar;`;
      const otherCode = `myVar = 10;`;

      const positions = new Map<string, { line: number; character: number }[]>();
      positions.set('myVar', [
        { line: 0, character: 4 },
        { line: 1, character: 8 },
      ]);

      const otherPositions = new Map<string, { line: number; character: number }[]>();
      otherPositions.set('myVar', [{ line: 0, character: 0 }]);

      const { references } = setup({
        code: mainCode,
        uri: 'file:///main.pike',
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'main.pike', line: 1 },
          },
        ],
        symbolPositions: positions,
        extraDocs: new Map([
          ['file:///other.pike', TextDocument.create('file:///other.pike', 'pike', 1, otherCode)],
        ]),
        extraCacheEntries: new Map([
          [
            'file:///other.pike',
            makeCacheEntry({
              symbols: [],
              symbolPositions: otherPositions,
            }),
          ],
        ]),
      });

      const result = await references(0, 5);
      expect(result.length).toBe(3);
      expect(result.some(r => r.uri === 'file:///main.pike')).toBe(true);
      expect(result.some(r => r.uri === 'file:///other.pike')).toBe(true);
    });

    it('should exclude declaration across multiple files when includeDeclaration=false for .pmod', async () => {
      const mainCode = `int myVar = 42;
int x = myVar;`;
      const otherCode = `myVar = 10;`;

      const positions = new Map<string, { line: number; character: number }[]>();
      positions.set('myVar', [
        { line: 0, character: 4 },
        { line: 1, character: 8 },
      ]);

      const otherPositions = new Map<string, { line: number; character: number }[]>();
      otherPositions.set('myVar', [{ line: 0, character: 0 }]);

      const { references } = setup({
        code: mainCode,
        uri: 'file:///main.pmod/Test.pmod', // Use .pmod for cross-file references
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'main.pmod', line: 1 },
          },
        ],
        symbolPositions: positions,
        extraDocs: new Map([
          [
            'file:///other.pmod/Test2.pmod',
            TextDocument.create('file:///other.pmod/Test2.pmod', 'pike', 1, otherCode),
          ],
        ]),
        extraCacheEntries: new Map([
          [
            'file:///other.pmod/Test2.pmod',
            makeCacheEntry({
              symbols: [],
              symbolPositions: otherPositions,
            }),
          ],
        ]),
      });

      const result = await references(0, 5, false);
      expect(result.length).toBe(2);
      expect(result.filter(r => r.uri === 'file:///main.pmod/Test.pmod').length).toBe(1);
      expect(result.filter(r => r.uri === 'file:///other.pmod/Test2.pmod').length).toBe(1);
    });

    it('should search workspace files with mock scanner', async () => {
      // Main file with symbol
      const mainCode = `int target = 42;`;
      // Workspace file (not in cache)
      const workspaceCode = `int x = target;`;

      // Create mock workspace scanner that returns uncached file
      const workspaceScanner = createMockWorkspaceScanner([
        { uri: 'file:///workspace/lib.pike', content: workspaceCode },
      ]);

      const { references } = setup({
        code: mainCode,
        uri: 'file:///main.pike',
        symbols: [
          {
            name: 'target',
            kind: 'variable',
            modifiers: [],
            position: { file: 'main.pike', line: 1 },
          },
        ],
        symbolPositions: new Map([['target', [{ line: 0, character: 4 }]]]),
        workspaceScanner,
      });

      const result = await references(0, 5);
      // Should find reference in workspace file
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should include file paths in results from workspace', async () => {
      // Using .pmod file to enable workspace search
      const mainCode = `int shared = 1;`;
      const workspaceCode = `int x = shared;`;

      const workspaceScanner = createMockWorkspaceScanner([
        { uri: 'file:///project/util.pmod', content: workspaceCode },
      ]);

      const { references } = setup({
        code: mainCode,
        uri: 'file:///main.pmod',
        symbols: [
          {
            name: 'shared',
            kind: 'variable',
            modifiers: [],
            position: { file: 'main.pmod', line: 1 },
          },
        ],
        workspaceScanner,
      });

      const result = await references(0, 5);
      // Should include results from different URIs when workspace is searched
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle uncached workspace files', async () => {
      const mainCode = `void foo() {}`;
      const uncachedCode = `foo();`;

      // Workspace scanner returns files not in cache
      const workspaceScanner = createMockWorkspaceScanner([
        { uri: 'file:///lib/helper.pike', content: uncachedCode },
      ]);

      const { references } = setup({
        code: mainCode,
        uri: 'file:///main.pike',
        symbols: [
          {
            name: 'foo',
            kind: 'method',
            modifiers: [],
            position: { file: 'main.pike', line: 1 },
          },
        ],
        workspaceScanner,
      });

      const result = await references(0, 2);
      // Should handle uncached files gracefully
      expect(Array.isArray(result)).toBe(true);
    });

    it.skip('workspace-only results not filtered by includeDeclaration', () => {
      // Documented limitation: workspace results from .pmod files don't have
      // symbol position info, so includeDeclaration filtering doesn't apply.
      // Requires real bridge + workspace scanning — not testable with mocks.
    });
  });

  /**
   * References with symbolPositions index
   */
  describe('SymbolPositions index', () => {
    it('should use symbolPositions index when available', async () => {
      const code = `int myVar = 42;
int x = myVar;
myVar = 10;`;

      const positions = new Map<string, { line: number; character: number }[]>();
      positions.set('myVar', [
        { line: 0, character: 4 },
        { line: 1, character: 8 },
        { line: 2, character: 0 },
      ]);

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions: positions,
      });

      const result = await references(0, 5);
      // Should use pre-computed positions from symbolPositions
      expect(result.length).toBe(3);
      // Verify exact positions from the index
      expect(result[0]!.range.start.line).toBe(0);
      expect(result[0]!.range.start.character).toBe(4);
      expect(result[1]!.range.start.line).toBe(1);
      expect(result[1]!.range.start.character).toBe(8);
      expect(result[2]!.range.start.line).toBe(2);
      expect(result[2]!.range.start.character).toBe(0);
    });

    it('should fall back to text search when symbolPositions has no entry', async () => {
      const code = `int myVar = 42;
int x = myVar;`;

      const positions = new Map<string, { line: number; character: number }[]>();
      // Empty positions map - no entries for myVar

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions: positions,
      });

      const result = await references(0, 5);
      // Falls back to text search
      expect(result.length).toBe(2);
    });

    it('fallback text search ignores matches inside comments and strings', async () => {
      const code = `int myVar = 42;
// myVar in comment
string s = "myVar in string";
int x = myVar;`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions: new Map(),
      });

      const result = await references(0, 5);
      expect(result.length).toBe(2);
      expect(result.some(ref => ref.range.start.line === 1)).toBe(false);
      expect(result.some(ref => ref.range.start.line === 2)).toBe(false);
    });

    it('fallback text search ignores multiline block comment matches', async () => {
      const code = `int myVar = 1;
/*
  myVar inside block comment
*/
int y = myVar;`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions: new Map(),
      });

      const result = await references(0, 5);
      expect(result.length).toBe(2);
      expect(result.some(ref => ref.range.start.line === 2)).toBe(false);
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    it('should return empty array when no cached document', async () => {
      const { references } = setup({
        code: 'int myVar = 42;',
        symbols: [],
        noCache: true,
      });

      const result = await references(0, 5);
      expect(result).toEqual([]);
    });

    it('should return empty array when no document', async () => {
      const { references } = setup({
        code: 'int myVar = 42;',
        symbols: [],
        noDocument: true,
      });

      const result = await references(0, 5);
      expect(result).toEqual([]);
    });

    it('should return empty for word not matching any symbol', async () => {
      const code = `int unknownSymbol = 42;`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'otherSymbol',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      // "unknownSymbol" is not in the symbols list
      const result = await references(0, 6);
      expect(result).toEqual([]);
    });

    it('should handle symbols with same name in different scopes', async () => {
      // The current handler doesn't distinguish scopes - text search finds all
      const code = `int x = 1;
void func() {
    int x = 2;
}`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'x',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      const result = await references(0, 4);
      // Text search finds both "x" occurrences (doesn't distinguish scopes)
      expect(result.length).toBe(2);
    });

    it('should handle very large number of references', async () => {
      const lines = ['int target = 0;'];
      for (let i = 0; i < 100; i++) {
        lines.push(`target = target + ${i};`);
      }
      const code = lines.join('\n');

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'target',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      const result = await references(0, 5);
      // 1 declaration + 100 lines with 2 "target" each = 201
      expect(result.length).toBe(201);
    });

    it('should handle symbols in #include files via workspace mock', async () => {
      // Test handling of #include file references through workspace mock
      const mainCode = `#include "lib.pike"
int x = HELPER_FUNC();`;
      const includeCode = `int HELPER_FUNC() { return 42; }`;

      // Mock workspace to return include file
      const workspaceScanner = createMockWorkspaceScanner([
        { uri: 'file:///lib/lib.pike', content: includeCode },
      ]);

      const { references } = setup({
        code: mainCode,
        uri: 'file:///main.pike',
        symbols: [],
        workspaceScanner,
      });

      // Without cached include file, should return empty or local only
      const result = await references(1, 10);
      // Result depends on implementation - just verify it doesn't crash
      expect(Array.isArray(result)).toBe(true);
    });
  });

  /**
   * References handler - line-based symbol matching
   */
  describe('Symbol matching on same line', () => {
    it('should match symbol on same line when word does not match name', async () => {
      // The handler checks if cursor is on a definition line (method/class)
      // and uses that symbol name even if the word at cursor is different
      const code = `void myFunc() { }
myFunc();`;

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myFunc',
            kind: 'method',
            modifiers: [],
            position: { file: 'test.pike', line: 1 }, // Pike line 1 -> LSP line 0
          },
        ],
      });

      // Cursor on "void" at line 0 - the handler checks if a method/class
      // is defined on this line and uses its name instead
      const result = await references(0, 1);
      // "void" is not a known symbol, but the handler finds 'myFunc' on line 0
      // and uses that name for the search
      expect(result.length).toBe(2);
    });
  });

  /**
   * Performance
   */
  describe('Performance', () => {
    it('should find references within 1 second for large file', async () => {
      const lines = ['int target = 0;'];
      for (let i = 0; i < 500; i++) {
        lines.push(`target = target + ${i};`);
      }
      const code = lines.join('\n');

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'target',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
      });

      const start = performance.now();
      const result = await references(0, 5);
      const elapsed = performance.now() - start;

      expect(result.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(1000);
    });

    it('should prefer symbolPositions index over text search', async () => {
      const code = `int myVar = 42;
int x = myVar;`;

      const positions = new Map<string, { line: number; character: number }[]>();
      positions.set('myVar', [
        { line: 0, character: 4 },
        { line: 1, character: 8 },
      ]);

      const { references } = setup({
        code,
        symbols: [
          {
            name: 'myVar',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions: positions,
      });

      const result = await references(0, 5);
      // Uses symbolPositions (pre-computed), returns exact positions
      expect(result.length).toBe(2);
      expect(result[0]!.range.start.character).toBe(4);
      expect(result[1]!.range.start.character).toBe(8);
    });
  });
});

// =============================================================================
// Document Highlight Provider Tests
// =============================================================================

describe('Document Highlight Provider', () => {
  describe('Scenario 7.1: Highlight variable', () => {
    it('should highlight all occurrences of symbol', async () => {
      const code = `int count = 0;
count++;
write(count);`;

      const symbolPositions = new Map<string, { line: number; character: number }[]>();
      symbolPositions.set('count', [
        { line: 0, character: 4 },
        { line: 1, character: 0 },
        { line: 2, character: 6 },
      ]);

      const { highlight } = setup({
        code,
        symbols: [
          {
            name: 'count',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions,
      });

      // Cursor on "count" at line 0, char 4
      const result = await highlight(0, 5);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(3);

      expect(result![0]!.kind).toBe(DocumentHighlightKind.Write);
      expect(result![1]!.kind).toBe(DocumentHighlightKind.Write);
      expect(result![2]!.kind).toBe(DocumentHighlightKind.Read);
    });
  });

  describe('Scenario 7.2: Highlight none on whitespace', () => {
    it('should return null for whitespace/empty position', async () => {
      const code = `int x = 42;

int y = 10;`;

      const { highlight } = setup({
        code,
        symbols: [],
      });

      // Cursor on whitespace line 1
      const result = await highlight(1, 1);
      expect(result).toBeNull();
    });

    it('should return null for very short words (< 2 characters)', async () => {
      const code = `int x = 1;
x = 2;`;

      const { highlight } = setup({
        code,
        symbols: [],
      });

      // "x" is only 1 character, should return null
      const result = await highlight(0, 4);
      expect(result).toBeNull();
    });
  });

  describe('Scenario 7.3: Highlight symbol with different scopes', () => {
    it('should use semantic symbol positions to avoid cross-scope highlights', async () => {
      const code = `int xx = 1;
void func() { int xx = 2; write(xx); }
write(xx);`;

      const symbolPositions = new Map<string, { line: number; character: number }[]>();
      symbolPositions.set('xx', [
        { line: 0, character: 4 },
        { line: 2, character: 6 },
      ]);

      const { highlight } = setup({
        code,
        symbols: [
          {
            name: 'xx',
            kind: 'variable',
            modifiers: [],
            position: { file: 'test.pike', line: 1 },
          },
        ],
        symbolPositions,
      });

      // Cursor on "xx" at line 0
      const result = await highlight(0, 5);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should return null when no document found', async () => {
      const { highlight } = setup({
        code: 'int x = 42;',
        noDocument: true,
      });

      const result = await highlight(0, 5);
      expect(result).toBeNull();
    });

    it('should handle symbol that matches multiple times on same line', async () => {
      const code = `int ab = ab + ab;`;

      const { highlight } = setup({
        code,
        symbols: [],
      });

      const result = await highlight(0, 5);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(3); // 3 occurrences of "ab"
    });

    it('should respect word boundaries', async () => {
      const code = `int myVar = 1;
int myVariable = 2;
int x = myVar;`;

      const { highlight } = setup({
        code,
        symbols: [],
      });

      // Cursor on "myVar" at line 0
      const result = await highlight(0, 5);
      expect(result).not.toBeNull();
      // Should find "myVar" at lines 0 and 2, but NOT "myVariable"
      // because word boundary check ensures the char after "myVar" is not \w
      expect(result!.length).toBe(2);
    });
  });
});
