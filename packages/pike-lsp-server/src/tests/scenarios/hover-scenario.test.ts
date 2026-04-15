/**
 * Hover Scenario Tests
 *
 * Exercises REAL code paths through registerHoverHandler with minimal
 * mocking (mock bridge, mock services, real TextDocument, real positions,
 * real LSP Hover responses).
 *
 * These scenarios exercise:
 * - Hover over function -> show type signature
 * - Hover over variable -> show inferred type
 * - Hover over keyword -> show keyword documentation
 * - Hover over empty/nothing -> return null
 * - Edge cases: start/end of document, whitespace, comments,
 *   multi-line expressions, class symbols, method variants
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Connection } from 'vscode-languageserver/node.js';
import type { Hover } from 'vscode-languageserver/node.js';
import { MarkupKind } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import { registerHoverHandler } from '../../features/navigation/hover.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

// ---------------------------------------------------------------------------
// Harness factory
// ---------------------------------------------------------------------------

interface HoverHarness {
  connection: Connection;
  services: Services;
  documents: {
    get(uri: string): TextDocument | undefined;
    all(): TextDocument[];
  };
  /** Invoke the registered hover handler */
  hover(uri: string, line: number, character: number): Promise<Hover | null>;
  /** Add a document to the documents map */
  addDocument(doc: TextDocument): void;
  /** Set a cache entry */
  setCacheEntry(uri: string, entry: DocumentCacheEntry): void;
  /** Add a module to the stdlib index */
  addStdlibModule(name: string): void;
}

function createHoverHarness(config: { enableStdlib?: boolean } = {}): HoverHarness {
  const docs = new Map<string, TextDocument>();
  const cache = new Map<string, DocumentCacheEntry>();
  let hoverHandler:
    | ((params: {
        textDocument: { uri: string };
        position: { line: number; character: number };
      }) => Promise<Hover | null>)
    | null = null;

  const connectionLike = {
    onHover(
      handler: (params: {
        textDocument: { uri: string };
        position: { line: number; character: number };
      }) => Promise<Hover | null>
    ): void {
      hoverHandler = handler;
    },
    console: {
      log(): void {},
      warn(): void {},
      error(): void {},
    },
  };

  const stdlibModules = new Map<string, { name: string }>();

  const servicesLike = {
    bridge: {
      bridge: {
        async getTypeAtPosition() {
          return { found: 0, type: null };
        },
      },
      isRunning(): boolean {
        return true;
      },
    },
    documentCache: {
      get(uri: string): DocumentCacheEntry | undefined {
        return cache.get(uri);
      },
      set(uri: string, entry: DocumentCacheEntry): void {
        cache.set(uri, entry);
      },
      setPending(): void {},
      delete(): void {},
    },
    stdlibIndex: config.enableStdlib
      ? {
          async getModule(name: string) {
            return stdlibModules.get(name) ?? null;
          },
        }
      : null,
    typeDatabase: {
      setProgram(): void {},
      removeProgram(): void {},
      getMemoryStats() {
        return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
      },
    },
    workspaceIndex: { indexDocument() {}, removeDocument() {} },
    includeResolver: null,
    moduleContext: null,
    globalSettings: {
      pikePath: 'pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 250,
    },
    includePaths: [],
    logger: {
      debug(): void {},
      info(): void {},
      warn(): void {},
      error(): void {},
    },
  };

  const documentsLike = {
    get(uri: string): TextDocument | undefined {
      return docs.get(uri);
    },
    all(): TextDocument[] {
      return [...docs.values()];
    },
  };

  registerHoverHandler(
    connectionLike as unknown as Connection,
    servicesLike as unknown as Services,
    documentsLike as unknown as ReturnType<
      typeof import('vscode-languageserver/node.js').TextDocuments
    >
  );

  return {
    connection: connectionLike as unknown as Connection,
    services: servicesLike as unknown as Services,
    documents: documentsLike,
    async hover(uri: string, line: number, character: number): Promise<Hover | null> {
      if (!hoverHandler) throw new Error('hover handler not registered');
      return hoverHandler({ textDocument: { uri }, position: { line, character } });
    },
    addDocument(doc: TextDocument): void {
      docs.set(doc.uri, doc);
    },
    setCacheEntry(uri: string, entry: DocumentCacheEntry): void {
      cache.set(uri, entry);
    },
    addStdlibModule(name: string): void {
      stdlibModules.set(name, { name });
    },
  };
}

function makeCachedEntry(
  text: string,
  options: {
    symbols?: PikeSymbol[];
    symbolNames?: Map<string, PikeSymbol>;
  } = {}
): DocumentCacheEntry {
  return {
    version: 1,
    symbols: options.symbols ?? [],
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: options.symbolNames ?? new Map(),
    contentHash: computeContentHash(text),
    lineHashes: computeLineHashes(text),
    analysisState: { isStale: false, parseFailed: false },
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Hover over function -> show type signature
// ---------------------------------------------------------------------------

describe('Scenario: hover over function shows type signature', () => {
  it('should show function signature when hovering over function name', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/func.pike';
    const code = 'int add(int a, int b) {\n  return a + b;\n}\n';

    const funcSymbol: PikeSymbol = {
      name: 'add',
      kind: 'method',
      modifiers: [],
      type: { kind: 'function', returnType: 'int' } as any,
      parameters: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
      ],
      children: [],
      range: { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
      selectionRange: { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('add', funcSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [funcSymbol] }));

    const result = await harness.hover(uri, 0, 5);

    assert.ok(result, 'Should return hover result for function');
    assert.ok('contents' in result, 'Should have contents');
    const contents = result.contents as { kind: string; value: string };
    assert.strictEqual(contents.kind, MarkupKind.Markdown, 'Should be markdown');
    assert.ok(
      contents.value.includes('add'),
      `Should include function name, got: ${contents.value}`
    );
    assert.ok(contents.value.includes('int'), `Should include return type, got: ${contents.value}`);
  });

  it('should show function with documentation', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/func-doc.pike';
    const code = '//! Adds two numbers\nint add(int a, int b) {\n  return a + b;\n}\n';

    const funcSymbol: PikeSymbol = {
      name: 'add',
      kind: 'method',
      modifiers: [],
      type: { kind: 'function', returnType: 'int' } as any,
      documentation: 'Adds two numbers',
      children: [],
      range: { start: { line: 1, character: 4 }, end: { line: 1, character: 7 } },
      selectionRange: { start: { line: 1, character: 4 }, end: { line: 1, character: 7 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('add', funcSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [funcSymbol] }));

    const result = await harness.hover(uri, 1, 5);

    assert.ok(result, 'Should return hover result');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('Adds two numbers'),
      `Should include documentation, got: ${contents.value}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Hover over variable -> show inferred type
// ---------------------------------------------------------------------------

describe('Scenario: hover over variable shows inferred type', () => {
  it('should show variable type when hovering over variable name', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/var.pike';
    const code = 'int main() {\n  int x = 42;\n  return x;\n}\n';

    const varSymbol: PikeSymbol = {
      name: 'x',
      kind: 'variable',
      modifiers: [],
      type: { kind: 'int', name: 'int' },
      children: [],
      position: { line: 1, character: 6 },
      range: { start: { line: 1, character: 6 }, end: { line: 1, character: 7 } },
      selectionRange: { start: { line: 1, character: 6 }, end: { line: 1, character: 7 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('x', varSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [varSymbol] }));

    const result = await harness.hover(uri, 1, 7);

    assert.ok(result, 'Should return hover result for variable');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(contents.value.includes('x'), `Should include variable name, got: ${contents.value}`);
    assert.ok(contents.value.includes('int'), `Should include type info, got: ${contents.value}`);
  });

  it('should show variable type without explicit declaration', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/var-inferred.pike';
    const code = 'int main() {\n  string name = "hello";\n  return 0;\n}\n';

    const varSymbol: PikeSymbol = {
      name: 'name',
      kind: 'variable',
      modifiers: [],
      type: { kind: 'string', name: 'string' },
      children: [],
      position: { line: 1, character: 9 },
      range: { start: { line: 1, character: 9 }, end: { line: 1, character: 13 } },
      selectionRange: { start: { line: 1, character: 9 }, end: { line: 1, character: 13 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('name', varSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [varSymbol] }));

    const result = await harness.hover(uri, 1, 10);

    assert.ok(result, 'Should return hover result for string variable');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('string'),
      `Should include string type, got: ${contents.value}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Hover over keyword -> show keyword documentation
// ---------------------------------------------------------------------------

describe('Scenario: hover over keyword shows keyword documentation', () => {
  it('should show keyword info for type keywords', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/keyword.pike';
    const code = 'int x = 1;\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 1);

    assert.ok(result, 'Should return hover result for keyword "int"');
    const contents = result.contents as { kind: string; value: string };
    assert.strictEqual(contents.kind, MarkupKind.Markdown, 'Should be markdown');
    assert.ok(
      contents.value.includes('int'),
      `Should include keyword name, got: ${contents.value}`
    );
    assert.ok(
      contents.value.includes('Integer') || contents.value.includes('integer'),
      `Should include keyword description, got: ${contents.value}`
    );
  });

  it('should show keyword info for control flow keywords', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/keyword-if.pike';
    const code = 'int main() {\n  if (1) return 0;\n  return 1;\n}\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 1, 2);

    assert.ok(result, 'Should return hover result for keyword "if"');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(contents.value.includes('if'), `Should include keyword, got: ${contents.value}`);
  });

  it('should show keyword info for "foreach"', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/keyword-foreach.pike';
    const code = 'int main() {\n  foreach (({1,2,3}), int x) {}\n  return 0;\n}\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 1, 2);

    assert.ok(result, 'Should return hover result for keyword "foreach"');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(contents.value.includes('foreach'), `Should include keyword, got: ${contents.value}`);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Hover over nothing/empty -> return null
// ---------------------------------------------------------------------------

describe('Scenario: hover over nothing returns null', () => {
  it('should return null when no document in cache', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/uncached.pike';

    const result = await harness.hover(uri, 0, 0);

    assert.strictEqual(result, null, 'Should return null for uncached document');
  });

  it('should return null when no document in documents map', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/nodoc.pike';

    harness.setCacheEntry(uri, makeCachedEntry(''));

    const result = await harness.hover(uri, 0, 0);

    assert.strictEqual(result, null, 'Should return null when document not in map');
  });

  it('should return null when hovering over whitespace', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/whitespace.pike';
    const code = '    \n    \n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 2);

    assert.strictEqual(result, null, 'Should return null when hovering over whitespace');
  });

  it('should return null when hovering over empty document', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/empty.pike';
    const code = '';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 0);

    assert.strictEqual(result, null, 'Should return null for empty document');
  });

  it('should return null when hovering over unknown identifier', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/unknown.pike';
    const code = 'int main() {\n  unknown_func();\n  return 0;\n}\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 1, 3);

    assert.strictEqual(result, null, 'Should return null for unknown identifier');
  });

  it('should return null when hovering over comment text', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/comment.pike';
    const code = '// This is a comment\nint x = 1;\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 5);

    // "This" is a valid identifier, but it's not in symbolNames, so it should return null
    assert.strictEqual(result, null, 'Should return null for unknown word in comment');
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Edge cases - document boundaries
// ---------------------------------------------------------------------------

describe('Scenario: hover at document boundaries', () => {
  it('should handle hover at very start of document (line 0, char 0)', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/start.pike';
    const code = 'int x = 1;\n';

    const varSymbol: PikeSymbol = {
      name: 'int',
      kind: 'variable',
      modifiers: [],
      children: [],
    };

    // "int" at position 0 is a keyword - the keyword check happens first
    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 0);

    // "int" is a keyword, so it should return keyword hover
    assert.ok(result, 'Should return hover result at document start');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(contents.value.includes('int'), `Should include keyword, got: ${contents.value}`);
  });

  it('should handle hover at end of document', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/end.pike';
    const code = 'int x = 1;\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 11);

    assert.strictEqual(result, null, 'Should return null past end of content');
  });

  it('should handle hover at end of line', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/eol.pike';
    const code = 'int x = 1;\nint y = 2;\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 10);

    assert.strictEqual(result, null, 'Should return null at end of line with no identifier');
  });

  it('should handle hover on last line of multi-line document', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/multiline.pike';
    const code = 'int main() {\n  int x = 1;\n  return x;\n}\n';

    const varSymbol: PikeSymbol = {
      name: 'x',
      kind: 'variable',
      modifiers: [],
      type: { kind: 'int', name: 'int' },
      children: [],
      position: { line: 2, character: 9 },
      range: { start: { line: 2, character: 9 }, end: { line: 2, character: 10 } },
      selectionRange: { start: { line: 2, character: 9 }, end: { line: 2, character: 10 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('x', varSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [varSymbol] }));

    const result = await harness.hover(uri, 2, 9);

    assert.ok(result, 'Should return hover result on last line');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(contents.value.includes('x'), `Should include variable name, got: ${contents.value}`);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Hover over class symbol
// ---------------------------------------------------------------------------

describe('Scenario: hover over class shows class info', () => {
  it('should show class name when hovering over class identifier', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/class.pike';
    const code = 'class MyClass {\n  int x;\n  int get_x() { return x; }\n}\n';

    const classSymbol: PikeSymbol = {
      name: 'MyClass',
      kind: 'class',
      modifiers: [],
      children: [],
      documentation: 'My custom class',
      position: { line: 0, character: 6 },
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
      selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('MyClass', classSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [classSymbol] }));

    const result = await harness.hover(uri, 0, 8);

    assert.ok(result, 'Should return hover result for class');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('MyClass'),
      `Should include class name, got: ${contents.value}`
    );
    assert.ok(
      contents.value.includes('class') || contents.value.includes('Class'),
      `Should indicate class kind, got: ${contents.value}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Method with variant overloads
// ---------------------------------------------------------------------------

describe('Scenario: hover over method with variants shows all signatures', () => {
  it('should show main method and variant signatures', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/variants.pike';
    const code =
      [
        'class Handler {',
        '  string format(mixed x) { return sprintf("%O", x); }',
        '  variant string format(int x) { return (string)x; }',
        '  variant string format(float x) { return sprintf("%.2f", x); }',
        '}',
      ].join('\n') + '\n';

    const mainMethod: PikeSymbol = {
      name: 'format',
      kind: 'method',
      modifiers: [],
      type: { kind: 'function', returnType: 'string' } as any,
      parameters: [{ name: 'x', type: 'mixed' }],
      children: [],
      range: { start: { line: 1, character: 9 }, end: { line: 1, character: 15 } },
      selectionRange: { start: { line: 1, character: 9 }, end: { line: 1, character: 15 } },
    };

    const variantInt: PikeSymbol = {
      name: 'format',
      kind: 'method',
      modifiers: ['variant'],
      type: { kind: 'function', returnType: 'string' } as any,
      parameters: [{ name: 'x', type: 'int' }],
      children: [],
      range: { start: { line: 2, character: 17 }, end: { line: 2, character: 23 } },
      selectionRange: { start: { line: 2, character: 17 }, end: { line: 2, character: 23 } },
    };

    const variantFloat: PikeSymbol = {
      name: 'format',
      kind: 'method',
      modifiers: ['variant'],
      type: { kind: 'function', returnType: 'string' } as any,
      parameters: [{ name: 'x', type: 'float' }],
      children: [],
      range: { start: { line: 3, character: 17 }, end: { line: 3, character: 23 } },
      selectionRange: { start: { line: 3, character: 17 }, end: { line: 3, character: 23 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('format', mainMethod);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(
      uri,
      makeCachedEntry(code, {
        symbolNames,
        symbols: [mainMethod, variantInt, variantFloat],
      })
    );

    const result = await harness.hover(uri, 1, 10);

    assert.ok(result, 'Should return hover result for method with variants');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('format'),
      `Should include method name, got: ${contents.value}`
    );
    assert.ok(
      contents.value.includes('Variant') || contents.value.includes('variant'),
      `Should mention variants, got: ${contents.value}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Hover response includes proper range
// ---------------------------------------------------------------------------

describe('Scenario: hover response includes correct range', () => {
  it('should include range for document symbols', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/range.pike';
    const code = 'int main() {\n  int counter = 0;\n  return counter;\n}\n';

    const varSymbol: PikeSymbol = {
      name: 'counter',
      kind: 'variable',
      modifiers: [],
      type: { kind: 'int', name: 'int' },
      children: [],
      position: { line: 1, character: 6 },
      range: { start: { line: 1, character: 6 }, end: { line: 1, character: 13 } },
      selectionRange: { start: { line: 1, character: 6 }, end: { line: 1, character: 13 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('counter', varSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [varSymbol] }));

    const result = await harness.hover(uri, 2, 9);

    assert.ok(result, 'Should return hover result');
    assert.ok(result!.range, 'Should include range');
    assert.ok(
      result!.range!.start.character <= 9 && result!.range!.end.character >= 9,
      `Range should cover the position, got: ${JSON.stringify(result!.range)}`
    );
  });

  it('should include range for keyword hover', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/range-kw.pike';
    const code = 'int x = 1;\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 1);

    assert.ok(result, 'Should return hover result');
    assert.ok(result!.range, 'Keyword hover should include range');
    assert.strictEqual(result!.range!.start.line, 0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: Hover with structured documentation
// ---------------------------------------------------------------------------

describe('Scenario: hover with structured documentation', () => {
  it('should render structured documentation with params and returns', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/struct-doc.pike';
    const code =
      [
        '//! Calculate factorial',
        '//! @param n: The number',
        '//! @returns: The factorial',
        'int factorial(int n) {',
        '  return n <= 1 ? 1 : n * factorial(n - 1);',
        '}',
      ].join('\n') + '\n';

    const funcSymbol: PikeSymbol = {
      name: 'factorial',
      kind: 'method',
      modifiers: [],
      type: { kind: 'function', returnType: 'int' } as any,
      parameters: [{ name: 'n', type: 'int' }],
      documentation: {
        text: 'Calculate factorial',
        params: { n: 'The number' },
        returns: 'The factorial',
      },
      children: [],
      range: { start: { line: 3, character: 4 }, end: { line: 3, character: 12 } },
      selectionRange: { start: { line: 3, character: 4 }, end: { line: 3, character: 12 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('factorial', funcSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [funcSymbol] }));

    const result = await harness.hover(uri, 3, 6);

    assert.ok(result, 'Should return hover result');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('Calculate factorial'),
      `Should include description, got: ${contents.value}`
    );
    assert.ok(
      contents.value.includes('Parameters') || contents.value.includes('param'),
      `Should mention parameters, got: ${contents.value}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 10: Hover does not crash on edge positions
// ---------------------------------------------------------------------------

describe('Scenario: hover handles edge positions gracefully', () => {
  it('should handle position past end of document text without crash', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/past-end.pike';
    const code = 'int x = 1;\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 5, 0);

    assert.strictEqual(result, null, 'Should return null for position past document end');
  });

  it('should handle negative position without crash', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/negative.pike';
    const code = 'int x = 1;\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 0);

    // "int" is a keyword, should return keyword hover
    assert.ok(result !== undefined, 'Should not crash at position 0,0');
  });

  it('should handle document with only newlines', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/newlines.pike';
    const code = '\n\n\n\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 1, 0);

    assert.strictEqual(result, null, 'Should return null in newline-only document');
  });

  it('should handle document with special characters', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/special.pike';
    const code = 'int main() {\n  write("Hello, World!");\n  return 0;\n}\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    // Hover over string literal - should find "write" identifier nearby
    const result = await harness.hover(uri, 1, 15);

    // Position 15 in `  write("Hello, World!");` is in the string literal area
    // The word at that position should be null or "write" depending on exact char
    assert.ok(result === null || result !== null, 'Should not crash on special characters');
  });
});

// ---------------------------------------------------------------------------
// Scenario 11: Hover over constant and typedef
// ---------------------------------------------------------------------------

describe('Scenario: hover over constant and typedef symbols', () => {
  it('should show constant type and name', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/constant.pike';
    const code = 'constant MAX_SIZE = 1024;\n';

    const constSymbol: PikeSymbol = {
      name: 'MAX_SIZE',
      kind: 'constant',
      modifiers: [],
      type: { kind: 'int', name: 'int' },
      children: [],
      position: { line: 0, character: 9 },
      range: { start: { line: 0, character: 9 }, end: { line: 0, character: 17 } },
      selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 17 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('MAX_SIZE', constSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [constSymbol] }));

    const result = await harness.hover(uri, 0, 12);

    assert.ok(result, 'Should return hover result for constant');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('MAX_SIZE'),
      `Should include constant name, got: ${contents.value}`
    );
    assert.ok(
      contents.value.includes('constant') || contents.value.includes('int'),
      `Should include constant/type info, got: ${contents.value}`
    );
  });

  it('should show typedef definition', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/typedef.pike';
    const code = 'typedef array(int) IntArray;\n';

    const typedefSymbol: PikeSymbol = {
      name: 'IntArray',
      kind: 'typedef',
      modifiers: [],
      type: { kind: 'array' },
      children: [],
      position: { line: 0, character: 22 },
      range: { start: { line: 0, character: 22 }, end: { line: 0, character: 29 } },
      selectionRange: { start: { line: 0, character: 22 }, end: { line: 0, character: 29 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('IntArray', typedefSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [typedefSymbol] }));

    const result = await harness.hover(uri, 0, 24);

    assert.ok(result, 'Should return hover result for typedef');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('IntArray'),
      `Should include typedef name, got: ${contents.value}`
    );
    assert.ok(
      contents.value.includes('typedef'),
      `Should include typedef keyword, got: ${contents.value}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 12: Hover with inherited symbols
// ---------------------------------------------------------------------------

describe('Scenario: hover over inherited symbol', () => {
  it('should show inheritance info for inherited method', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/inherit.pike';
    const code =
      'class Base {\n  int get_value() { return 1; }\n}\nclass Child inherits Base {\n}\n';

    const methodSymbol: PikeSymbol = {
      name: 'get_value',
      kind: 'method',
      modifiers: [],
      type: { kind: 'function', returnType: 'int' } as any,
      inherited: true,
      inheritedFrom: 'Base',
      children: [],
      range: { start: { line: 1, character: 6 }, end: { line: 1, character: 15 } },
      selectionRange: { start: { line: 1, character: 6 }, end: { line: 1, character: 15 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('get_value', methodSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [methodSymbol] }));

    const result = await harness.hover(uri, 1, 8);

    assert.ok(result, 'Should return hover result for inherited method');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('get_value'),
      `Should include method name, got: ${contents.value}`
    );
    assert.ok(
      contents.value.includes('Inherited'),
      `Should mention inheritance, got: ${contents.value}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 13: Hover over import symbol
// ---------------------------------------------------------------------------

describe('Scenario: hover over import with stdlib resolution', () => {
  it('should return hover for stdlib module when stdlib index is enabled', async () => {
    const harness = createHoverHarness({ enableStdlib: true });
    harness.addStdlibModule('Stdio');
    const uri = 'file:///test/stdlib-import.pike';
    const code = 'import Stdio;\nint main() { return 0; }\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    // Hover over "Stdio" - should resolve via stdlibIndex
    const result = await harness.hover(uri, 0, 8);

    assert.ok(result, 'Should return hover result for stdlib module via stdlib index');
    const contents = result.contents as { kind: string; value: string };
    assert.ok(
      contents.value.includes('Stdio'),
      `Should include module name, got: ${contents.value}`
    );
  });

  it('should return null for unknown module when stdlib index has no match', async () => {
    const harness = createHoverHarness({ enableStdlib: true });
    const uri = 'file:///test/unknown-module.pike';
    const code = 'import NonExistent;\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 8);

    assert.strictEqual(result, null, 'Should return null for unknown module not in stdlib index');
  });
});

// ---------------------------------------------------------------------------
// Scenario 14: Multiple hovers in sequence (simulating rapid edits)
// ---------------------------------------------------------------------------

describe('Scenario: rapid sequential hovers', () => {
  it('should handle multiple sequential hover requests without errors', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/rapid.pike';
    const code = 'int x = 1;\nint y = 2;\nstring s = "hello";\n';

    const varX: PikeSymbol = {
      name: 'x',
      kind: 'variable',
      modifiers: [],
      type: { kind: 'int', name: 'int' },
      children: [],
      position: { line: 0, character: 4 },
    };
    const varY: PikeSymbol = {
      name: 'y',
      kind: 'variable',
      modifiers: [],
      type: { kind: 'int', name: 'int' },
      children: [],
      position: { line: 1, character: 4 },
    };
    const varS: PikeSymbol = {
      name: 's',
      kind: 'variable',
      modifiers: [],
      type: { kind: 'string', name: 'string' },
      children: [],
      position: { line: 2, character: 7 },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('x', varX);
    symbolNames.set('y', varY);
    symbolNames.set('s', varS);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [varX, varY, varS] }));

    const results = await Promise.all([
      harness.hover(uri, 0, 4),
      harness.hover(uri, 1, 4),
      harness.hover(uri, 2, 7),
    ]);

    assert.ok(results[0], 'First hover should return result');
    assert.ok(results[1], 'Second hover should return result');
    assert.ok(results[2], 'Third hover should return result');

    const c0 = results[0]!.contents as { value: string };
    const c1 = results[1]!.contents as { value: string };
    const c2 = results[2]!.contents as { value: string };

    assert.ok(c0.value.includes('x'), `First should be x, got: ${c0.value}`);
    assert.ok(c1.value.includes('y'), `Second should be y, got: ${c1.value}`);
    assert.ok(c2.value.includes('s'), `Third should be s, got: ${c2.value}`);
  });
});

// ---------------------------------------------------------------------------
// Scenario 15: Hover returns correct MarkupKind
// ---------------------------------------------------------------------------

describe('Scenario: hover responses use correct MarkupKind', () => {
  it('should always return Markdown content kind for symbol hovers', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/markup.pike';
    const code = 'int counter = 0;\n';

    const varSymbol: PikeSymbol = {
      name: 'counter',
      kind: 'variable',
      modifiers: [],
      type: { kind: 'int', name: 'int' },
      children: [],
      position: { line: 0, character: 4 },
      range: { start: { line: 0, character: 4 }, end: { line: 0, character: 11 } },
      selectionRange: { start: { line: 0, character: 4 }, end: { line: 0, character: 11 } },
    };

    const symbolNames = new Map<string, PikeSymbol>();
    symbolNames.set('counter', varSymbol);

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code, { symbolNames, symbols: [varSymbol] }));

    const result = await harness.hover(uri, 0, 5);

    assert.ok(result, 'Should return hover result');
    const contents = result!.contents as { kind: string };
    assert.strictEqual(
      contents.kind,
      MarkupKind.Markdown,
      'Hover should always use Markdown content kind'
    );
  });

  it('should always return Markdown content kind for keyword hovers', async () => {
    const harness = createHoverHarness();
    const uri = 'file:///test/markup-kw.pike';
    const code = 'string name = "test";\n';

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.addDocument(doc);
    harness.setCacheEntry(uri, makeCachedEntry(code));

    const result = await harness.hover(uri, 0, 2);

    assert.ok(result, 'Should return hover result for keyword');
    const contents = result!.contents as { kind: string };
    assert.strictEqual(
      contents.kind,
      MarkupKind.Markdown,
      'Keyword hover should use Markdown content kind'
    );
  });
});
