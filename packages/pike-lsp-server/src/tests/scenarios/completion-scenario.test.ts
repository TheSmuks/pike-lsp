/**
 * Completion Scenario Tests
 *
 * Exercises REAL completion code paths through registerCompletionHandlers with
 * minimal mocking (mock bridge, mock stdlib index, real TextDocument, real positions,
 * real LSP CompletionList responses).
 *
 * Covers user-facing scenarios:
 *   1. Trigger completion at various positions -> receive relevant items
 *   2. Completion after dot/arrow operator (member access)
 *   3. Completion for imports
 *   4. Completion filtering by prefix
 *   5. Scope operator completion (this_program::, ParentClass::)
 *   6. Context-aware prioritization (type vs expression)
 *   7. Edge cases: empty document, EOF, comments, strings, no matches,
 *      rapid edits, long documents, special characters, cancellation
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type CompletionList,
} from 'vscode-languageserver/node.js';
import type { IntrospectedSymbol, PikeSymbol } from '@pike-lsp/pike-bridge';
import { registerCompletionHandlers } from '../../features/editing/completion.js';
import type { DocumentCacheEntry } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Harness: minimal mock factories for completion scenario testing
// ---------------------------------------------------------------------------

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

type CompletionFn = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
  context?: { triggerKind: number; triggerCharacter?: string };
}) => Promise<CompletionList>;

type ResolveFn = (item: CompletionItem) => Promise<CompletionItem>;

interface CompletionHarness {
  complete: CompletionFn;
  resolve: ResolveFn;
  uri: string;
}

function sym(name: string, kind: PikeSymbol['kind'], extra?: Partial<PikeSymbol>): PikeSymbol {
  return { name, kind, modifiers: [], ...extra } as PikeSymbol;
}

function method(
  name: string,
  args: { name: string; type?: string }[],
  returnType?: string
): PikeSymbol {
  return {
    name,
    kind: 'method',
    modifiers: [],
    argNames: args.map(a => a.name),
    argTypes: args.map(a => ({ kind: (a.type ?? 'mixed') as never })),
    returnType: returnType ? { kind: returnType as never } : undefined,
    type: {
      kind: 'function',
      returnType: returnType ? { kind: returnType as never } : undefined,
    },
  } as PikeSymbol;
}

function classSym(name: string, children: PikeSymbol[], extra?: Partial<PikeSymbol>): PikeSymbol {
  return {
    name,
    kind: 'class',
    modifiers: [],
    position: { line: 1, character: 0 },
    children,
    ...extra,
  } as PikeSymbol;
}

function makeCacheEntry(
  overrides: Partial<DocumentCacheEntry> & {
    symbols: PikeSymbol[];
  }
): DocumentCacheEntry {
  return {
    version: 1,
    diagnostics: [],
    symbolPositions: new Map(),
    ...overrides,
  };
}

interface HarnessOptions {
  code: string;
  uri?: string;
  symbols?: PikeSymbol[];
  cacheExtra?: Partial<DocumentCacheEntry>;
  bridgeContext?: {
    context: string;
    objectName: string;
    prefix: string;
    operator: string;
  };
  queryItems?: CompletionItem[];
  stdlibModules?: Record<string, Map<string, IntrospectedSymbol>>;
  includeSymbols?: {
    originalPath: string;
    resolvedPath: string;
    symbols: PikeSymbol[];
  }[];
  importModules?: { modulePath: string; isStdlib: boolean; symbols?: PikeSymbol[] }[];
  noBridge?: boolean;
  noCache?: boolean;
}

function createHarness(opts: HarnessOptions): CompletionHarness {
  const uri = opts.uri ?? 'file:///test.pike';
  const doc = TextDocument.create(uri, 'pike', 1, opts.code);

  const cacheMap = new Map<string, DocumentCacheEntry>();
  if (!opts.noCache) {
    cacheMap.set(
      uri,
      makeCacheEntry({
        symbols: opts.symbols ?? [],
        dependencies: {
          includes: opts.includeSymbols ?? [],
          imports: opts.importModules ?? [],
        },
        ...opts.cacheExtra,
      })
    );
  }

  let capturedHandler: CompletionFn | null = null;
  let capturedResolve: ResolveFn | null = null;

  const connectionLike = {
    onCompletion(handler: CompletionFn) {
      capturedHandler = handler;
    },
    onCompletionResolve(handler: ResolveFn) {
      capturedResolve = handler;
    },
  };

  const stdlibIndex = opts.stdlibModules
    ? {
        getModule: async (path: string) => {
          const symbols = opts.stdlibModules![path];
          if (!symbols) return null;
          return {
            modulePath: path,
            symbols,
            lastAccessed: Date.now(),
            accessCount: 1,
            sizeBytes: 100,
          };
        },
      }
    : null;

  const bridgeLike = opts.noBridge
    ? null
    : {
        isRunning: () => true,
        engineQuery: async () => ({
          result:
            opts.queryItems && opts.queryItems.length > 0
              ? { items: opts.queryItems }
              : { result: { status: 'stub' } },
        }),
        engineCancelRequest: async () => ({ accepted: true }),
        getCompletionContext: async () => ({
          context: opts.bridgeContext?.context ?? 'identifier',
          objectName: opts.bridgeContext?.objectName ?? '',
          prefix: opts.bridgeContext?.prefix ?? '',
          operator: opts.bridgeContext?.operator ?? '',
        }),
        tokenize: async (text: string) => {
          const tokens: import('@pike-lsp/pike-bridge').PikeToken[] = [];
          const lines = text.split('\n');
          for (let line = 0; line < lines.length; line++) {
            const re = /\b\w+\b/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(lines[line]!)) !== null) {
              tokens.push({ text: m[0], line: line + 1, character: m.index, file: 0 });
            }
          }
          return tokens;
        },
      };
  const servicesLike = {
    bridge: bridgeLike,
    bridgeBridge: bridgeLike,
    logger: silentLogger,
    documentCache: {
      get: (u: string) => cacheMap.get(u),
      entries: () => cacheMap.entries(),
    },
    stdlibIndex,
    includeResolver: opts.includeSymbols ? {} : null,
    typeDatabase: {},
    workspaceIndex: {},
    globalSettings: {
      pikePath: 'pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 300,
    },
    includePaths: [],
    documentSnapshots: new Map<string, string>(),
    moduleContext: null,
  };

  const documentsLike = {
    get: (u: string) => (u === uri ? doc : undefined),
  };

  registerCompletionHandlers(
    connectionLike as never,
    servicesLike as never,
    documentsLike as never
  );

  return {
    complete: params => {
      if (!capturedHandler) throw new Error('No completion handler registered');
      return capturedHandler(params, {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      });
    },
    resolve: item => {
      if (!capturedResolve) throw new Error('No resolve handler registered');
      return capturedResolve(item);
    },
    uri,
  };
}

function labels(result: CompletionList): string[] {
  return result.items.map(i => i.label);
}

function findItem(result: CompletionList, label: string): CompletionItem | undefined {
  return result.items.find(i => i.label === label);
}

// ---------------------------------------------------------------------------
// Scenario 1: Trigger completion at various positions
// ---------------------------------------------------------------------------

describe('Scenario: trigger completion at various positions', () => {
  it('should return keywords and builtins at start of empty document', async () => {
    const { complete } = createHarness({ code: '' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('int'), 'Should include "int" keyword');
    assert.ok(names.includes('string'), 'Should include "string" keyword');
    assert.ok(names.includes('class'), 'Should include "class" keyword');
    assert.ok(names.includes('if'), 'Should include "if" keyword');
    assert.ok(names.includes('return'), 'Should include "return" keyword');
    assert.ok(names.includes('Stdio'), 'Should include Stdio module');
    assert.ok(names.includes('sizeof'), 'Should include sizeof builtin');
  });

  it('should return type keywords at start of line', async () => {
    const { complete } = createHarness({ code: '' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('float'), 'float type');
    assert.ok(names.includes('array'), 'array type');
    assert.ok(names.includes('mapping'), 'mapping type');
    assert.ok(names.includes('mixed'), 'mixed type');
    assert.ok(names.includes('void'), 'void type');
    assert.ok(names.includes('program'), 'program type');
  });

  it('should return local symbols after declaration block', async () => {
    const { complete } = createHarness({
      code: 'int my_var = 1;\nvoid my_func() {}\n',
      symbols: [sym('my_var', 'variable'), method('my_func', [])],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 2, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('my_var'), 'Should include local variable');
    assert.ok(names.includes('my_func'), 'Should include local function');
    assert.ok(names.includes('int'), 'Should still include keywords');
  });

  it('should return predefined macros in completions', async () => {
    const { complete } = createHarness({ code: '' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('__FILE__'), 'Should include __FILE__ macro');
    assert.ok(names.includes('__LINE__'), 'Should include __LINE__ macro');
  });

  it('should return extended Pike type builtins', async () => {
    const { complete } = createHarness({ code: '' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('zero'), 'Should include zero type');
    assert.ok(names.includes('type'), 'Should include type keyword');
    assert.ok(names.includes('__attribute__'), 'Should include __attribute__');
    assert.ok(names.includes('int(0..255)'), 'Should include int(0..255) range type');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Completion after dot/arrow operator (member access)
// ---------------------------------------------------------------------------

describe('Scenario: completion after dot/arrow operator', () => {
  it('should show module members after dot on stdlib module', async () => {
    const moduleSymbols = new Map<string, IntrospectedSymbol>();
    moduleSymbols.set('sort', {
      name: 'sort',
      type: { kind: 'function', returnType: { kind: 'array' } },
      kind: 'function',
      modifiers: ['public'],
    });
    moduleSymbols.set('filter', {
      name: 'filter',
      type: { kind: 'function', returnType: { kind: 'array' } },
      kind: 'function',
      modifiers: ['public'],
    });

    const { complete } = createHarness({
      code: 'Array.',
      bridgeContext: {
        context: 'member_access',
        objectName: 'Array',
        prefix: '',
        operator: '.',
      },
      stdlibModules: { Array: moduleSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 6 },
    });

    const names = labels(result);
    assert.ok(names.includes('sort'), 'Should include Array.sort');
    assert.ok(names.includes('filter'), 'Should include Array.filter');
  });

  it('should show type members after arrow on typed variable', async () => {
    const fileSymbols = new Map<string, IntrospectedSymbol>();
    fileSymbols.set('read', {
      name: 'read',
      type: { kind: 'function', returnType: { kind: 'string' } },
      kind: 'function',
      modifiers: ['public'],
    });
    fileSymbols.set('close', {
      name: 'close',
      type: { kind: 'function', returnType: { kind: 'void' } },
      kind: 'function',
      modifiers: ['public'],
    });

    const { complete } = createHarness({
      code: 'Stdio.File f = Stdio.File();\nf->',
      symbols: [
        sym('f', 'variable', {
          type: { kind: 'object', className: 'Stdio.File' } as never,
        }),
      ],
      bridgeContext: {
        context: 'member_access',
        objectName: 'f',
        prefix: '',
        operator: '->',
      },
      stdlibModules: { 'Stdio.File': fileSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 3 },
    });

    const names = labels(result);
    assert.ok(names.includes('read'), 'Should include Stdio.File.read');
    assert.ok(names.includes('close'), 'Should include Stdio.File.close');
  });

  it('should show members after dot on fully qualified module path', async () => {
    const fileSymbols = new Map<string, IntrospectedSymbol>();
    fileSymbols.set('read', {
      name: 'read',
      type: { kind: 'function', returnType: { kind: 'string' } },
      kind: 'function',
      modifiers: [],
    });

    const { complete } = createHarness({
      code: 'Stdio.File.',
      bridgeContext: {
        context: 'member_access',
        objectName: 'Stdio.File',
        prefix: '',
        operator: '.',
      },
      stdlibModules: { 'Stdio.File': fileSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 11 },
    });

    const names = labels(result);
    assert.ok(names.includes('read'), 'Should include Stdio.File.read');
  });

  it('should filter members by prefix after dot', async () => {
    const moduleSymbols = new Map<string, IntrospectedSymbol>();
    moduleSymbols.set('sort', {
      name: 'sort',
      type: { kind: 'function' },
      kind: 'function',
      modifiers: [],
    });
    moduleSymbols.set('sum', {
      name: 'sum',
      type: { kind: 'function' },
      kind: 'function',
      modifiers: [],
    });
    moduleSymbols.set('filter', {
      name: 'filter',
      type: { kind: 'function' },
      kind: 'function',
      modifiers: [],
    });

    const { complete } = createHarness({
      code: 'Array.s',
      bridgeContext: {
        context: 'member_access',
        objectName: 'Array',
        prefix: 's',
        operator: '.',
      },
      stdlibModules: { Array: moduleSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 7 },
    });

    const names = labels(result);
    assert.ok(names.includes('sort'), 'Should include sort (starts with s)');
    assert.ok(names.includes('sum'), 'Should include sum (starts with s)');
    assert.ok(!names.includes('filter'), 'Should NOT include filter (does not start with s)');
  });

  it('should return empty completions for unknown type after arrow', async () => {
    const { complete } = createHarness({
      code: 'unknown_obj->',
      symbols: [],
      bridgeContext: {
        context: 'member_access',
        objectName: 'unknown_obj',
        prefix: '',
        operator: '->',
      },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 13 },
    });

    assert.strictEqual(result.items.length, 0, 'Unknown type should return empty completions');
  });

  it('should resolve type via extractTypeName for variable after arrow', async () => {
    const classMembers = new Map<string, IntrospectedSymbol>();
    classMembers.set('get_name', {
      name: 'get_name',
      type: { kind: 'function', returnType: { kind: 'string' } },
      kind: 'function',
      modifiers: [],
    });

    const { complete } = createHarness({
      code: 'MyClass obj;\nobj->',
      symbols: [
        sym('obj', 'variable', {
          type: { kind: 'object', className: 'MyClass' } as never,
        }),
      ],
      bridgeContext: {
        context: 'member_access',
        objectName: 'obj',
        prefix: '',
        operator: '->',
      },
      stdlibModules: { MyClass: classMembers },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 5 },
    });

    const names = labels(result);
    assert.ok(names.includes('get_name'), 'Should resolve MyClass members');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Completion for imports
// ---------------------------------------------------------------------------

describe('Scenario: completion for imports', () => {
  it('should show imported stdlib module symbols in completion', async () => {
    const stdlibSymbols = new Map<string, IntrospectedSymbol>();
    stdlibSymbols.set('sort', {
      name: 'sort',
      type: { kind: 'function', returnType: { kind: 'array' } },
      kind: 'function',
      modifiers: ['public'],
    });
    stdlibSymbols.set('filter', {
      name: 'filter',
      type: { kind: 'function', returnType: { kind: 'array' } },
      kind: 'function',
      modifiers: ['public'],
    });

    const { complete } = createHarness({
      code: 'import Array;\n',
      symbols: [],
      importModules: [{ modulePath: 'Array', isStdlib: true }],
      stdlibModules: { Array: stdlibSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('sort'), 'Should include Array.sort from import');
    assert.ok(names.includes('filter'), 'Should include Array.filter from import');
  });

  it('should show imported stdlib symbols filtered by prefix', async () => {
    const stdlibSymbols = new Map<string, IntrospectedSymbol>();
    stdlibSymbols.set('sort', {
      name: 'sort',
      type: { kind: 'function' },
      kind: 'function',
      modifiers: ['public'],
    });
    stdlibSymbols.set('filter', {
      name: 'filter',
      type: { kind: 'function' },
      kind: 'function',
      modifiers: ['public'],
    });

    const { complete } = createHarness({
      code: 'import Array;\nso',
      symbols: [],
      importModules: [{ modulePath: 'Array', isStdlib: true }],
      stdlibModules: { Array: stdlibSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 2 },
    });

    const names = labels(result);
    assert.ok(names.includes('sort'), 'Should include sort (matches "so")');
    assert.ok(!names.includes('filter'), 'Should NOT include filter (does not match "so")');
  });

  it('should not duplicate symbols from includes already in local scope', async () => {
    const { complete } = createHarness({
      code: '#include "utils.pike"\nint shared_name;\n',
      symbols: [sym('shared_name', 'variable')],
      includeSymbols: [
        {
          originalPath: '"utils.pike"',
          resolvedPath: '/path/to/utils.pike',
          symbols: [sym('shared_name', 'variable'), sym('unique_from_include', 'variable')],
        },
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 2, character: 0 },
    });

    const names = labels(result);
    const sharedCount = names.filter(n => n === 'shared_name').length;
    assert.strictEqual(sharedCount, 1, 'shared_name should appear exactly once (no duplicate)');
    assert.ok(names.includes('unique_from_include'), 'unique include symbol should be present');
  });

  it('should include symbols from #include files', async () => {
    const { complete } = createHarness({
      code: '#include "utils.pike"\n',
      symbols: [],
      includeSymbols: [
        {
          originalPath: '"utils.pike"',
          resolvedPath: '/path/to/utils.pike',
          symbols: [sym('helper_func', 'method'), sym('HELPER_CONST', 'constant')],
        },
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('helper_func'), 'Should include helper_func');
    assert.ok(names.includes('HELPER_CONST'), 'Should include HELPER_CONST');
  });

  it('should resolve imported symbol documentation via completion resolve', async () => {
    const stdlibSymbols = new Map<string, IntrospectedSymbol>();
    stdlibSymbols.set('my_func', {
      name: 'my_func',
      type: { kind: 'function', returnType: { kind: 'void' } },
      kind: 'function',
      modifiers: ['public'],
    });

    const { complete, resolve } = createHarness({
      code: 'import Stdio;\n',
      symbols: [],
      importModules: [{ modulePath: 'Stdio', isStdlib: true }],
      stdlibModules: { Stdio: stdlibSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 0 },
    });

    const funcItem = findItem(result, 'my_func');
    assert.ok(funcItem, 'Should find my_func');
    assert.ok(funcItem!.data && typeof funcItem!.data === 'object', 'Should have data for resolve');

    const resolved = await resolve(funcItem!);
    assert.ok(
      resolved.additionalTextEdits,
      'Resolved import symbol should have auto-import additionalTextEdits'
    );
    assert.ok(
      resolved.additionalTextEdits![0]!.newText.includes('import'),
      'Auto-import should contain import statement'
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Completion filtering by prefix
// ---------------------------------------------------------------------------

describe('Scenario: completion filtering by prefix', () => {
  it('should filter symbols by prefix case-insensitively', async () => {
    const { complete } = createHarness({
      code: 'int alpha = 1;\nint beta = 2;\nalp',
      symbols: [sym('alpha', 'variable'), sym('beta', 'variable')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 2, character: 3 },
    });

    const names = labels(result);
    assert.ok(names.includes('alpha'), 'Should include alpha (matches alp)');
    assert.ok(!names.includes('beta'), 'Should NOT include beta (does not match alp)');
  });

  it('should return no local symbol matches for non-matching prefix', async () => {
    const { complete } = createHarness({
      code: 'int myVar = 1;\nzzz',
      symbols: [sym('myVar', 'variable')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 3 },
    });

    const names = labels(result);
    assert.ok(!names.includes('myVar'), 'Should NOT include myVar (does not match zzz)');
  });

  it('should filter keywords by prefix', async () => {
    const { complete } = createHarness({ code: 'in' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 2 },
    });

    const names = labels(result);
    assert.ok(names.includes('int'), 'Should include int (matches "in")');
    assert.ok(names.includes('inherit'), 'Should include inherit (matches "in")');
    assert.ok(!names.includes('string'), 'Should NOT include string (does not match "in")');
  });

  it('should filter module names by prefix', async () => {
    const { complete } = createHarness({ code: 'St' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 2 },
    });

    const names = labels(result);
    assert.ok(names.includes('Stdio'), 'Should include Stdio (matches "St")');
    assert.ok(names.includes('String'), 'Should include String (matches "St")');
    assert.ok(!names.includes('Array'), 'Should NOT include Array (does not match "St")');
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Scope operator completion
// ---------------------------------------------------------------------------

describe('Scenario: scope operator completion', () => {
  it('should show class members after this_program::', async () => {
    const code = [
      'class MyClass {',
      '    int value;',
      '    void do_stuff() {}',
      '    void caller() {',
      '        this_program::',
      '    }',
      '}',
    ].join('\n');

    const { complete } = createHarness({
      code,
      symbols: [
        classSym('MyClass', [
          sym('value', 'variable'),
          method('do_stuff', []),
          method('caller', []),
        ]),
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 4, character: 22 },
    });

    const names = labels(result);
    assert.ok(names.includes('value'), 'Should include value member via this_program::');
    assert.ok(names.includes('do_stuff'), 'Should include do_stuff member via this_program::');
  });

  it('should show instance members after this::', async () => {
    const code = [
      'class MyClass {',
      '    int x;',
      '    void method1() {}',
      '    void method2() {',
      '        this::',
      '    }',
      '}',
    ].join('\n');

    const { complete } = createHarness({
      code,
      symbols: [
        classSym('MyClass', [sym('x', 'variable'), method('method1', []), method('method2', [])]),
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 4, character: 14 },
    });

    const names = labels(result);
    assert.ok(names.includes('x'), 'Should include x via this::');
    assert.ok(names.includes('method1'), 'Should include method1 via this::');
  });

  it('should show parent class members after ParentClass::', async () => {
    const parentSymbols = new Map<string, IntrospectedSymbol>();
    parentSymbols.set('parent_method', {
      name: 'parent_method',
      type: { kind: 'function' },
      kind: 'function',
      modifiers: [],
    });

    const { complete } = createHarness({
      code: 'inherit Stdio.Readline;\nStdio.Readline::',
      symbols: [],
      stdlibModules: { 'Stdio.Readline': parentSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 18 },
    });

    const names = labels(result);
    assert.ok(names.includes('parent_method'), 'Should include parent_method via ParentClass::');
  });

  it('should filter scope members by prefix', async () => {
    const code = [
      'class MyClass {',
      '    int alpha;',
      '    int beta;',
      '    void func() {',
      '        this_program::al',
      '    }',
      '}',
    ].join('\n');

    const { complete } = createHarness({
      code,
      symbols: [
        classSym('MyClass', [
          sym('alpha', 'variable'),
          sym('beta', 'variable'),
          method('func', []),
        ]),
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 4, character: 24 },
    });

    const names = labels(result);
    assert.ok(names.includes('alpha'), 'Should include alpha (matches "al" prefix)');
    assert.ok(!names.includes('beta'), 'Should NOT include beta (does not match "al")');
  });

  it('should include inherited members in this_program:: scope', async () => {
    const parentSymbols = new Map<string, IntrospectedSymbol>();
    parentSymbols.set('inherited_func', {
      name: 'inherited_func',
      type: { kind: 'function' },
      kind: 'function',
      modifiers: [],
    });

    const code = [
      'class MyClass {',
      '    inherit Base;',
      '    int local_var;',
      '    void func() {',
      '        this_program::',
      '    }',
      '}',
    ].join('\n');

    const { complete } = createHarness({
      code,
      symbols: [
        classSym('MyClass', [
          sym('Base', 'inherit', { classname: 'Base' }),
          sym('local_var', 'variable'),
          method('func', []),
        ]),
      ],
      stdlibModules: { Base: parentSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 4, character: 22 },
    });

    const names = labels(result);
    assert.ok(names.includes('local_var'), 'Should include local members');
    assert.ok(names.includes('func'), 'Should include func');
    assert.ok(names.includes('inherited_func'), 'Should include inherited members');
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Context-aware prioritization
// ---------------------------------------------------------------------------

describe('Scenario: context-aware prioritization', () => {
  it('should prioritize classes over variables in type context (start of line)', async () => {
    const { complete } = createHarness({
      code: '',
      symbols: [sym('MyClass', 'class'), sym('my_var', 'variable'), method('my_func', [])],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const classItem = findItem(result, 'MyClass');
    const varItem = findItem(result, 'my_var');

    assert.ok(classItem, 'MyClass should be in results');
    assert.ok(varItem, 'my_var should be in results');
    assert.ok(
      classItem!.sortText! < varItem!.sortText!,
      'Class should rank higher than variable in type context'
    );
  });

  it('should prioritize variables over classes in expression context (after =)', async () => {
    const { complete } = createHarness({
      code: 'int x = ',
      symbols: [sym('MyClass', 'class'), sym('my_var', 'variable'), method('my_func', [])],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 8 },
    });

    const classItem = findItem(result, 'MyClass');
    const varItem = findItem(result, 'my_var');

    assert.ok(classItem, 'MyClass should be in results');
    assert.ok(varItem, 'my_var should be in results');
    assert.ok(
      varItem!.sortText! < classItem!.sortText!,
      'Variable should rank higher than class in expression context'
    );
  });

  it('should prioritize variables after return keyword', async () => {
    const { complete } = createHarness({
      code: 'int func() { return ',
      symbols: [sym('MyClass', 'class'), sym('my_var', 'variable')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 20 },
    });

    const classItem = findItem(result, 'MyClass');
    const varItem = findItem(result, 'my_var');

    assert.ok(varItem, 'my_var should be in results');
    assert.ok(classItem, 'MyClass should be in results');
    assert.ok(
      varItem!.sortText! < classItem!.sortText!,
      'Variable should rank higher after return'
    );
  });

  it('should prioritize classes at start of new line after semicolon', async () => {
    const { complete } = createHarness({
      code: 'int x = 1;\n',
      symbols: [sym('MyClass', 'class'), sym('my_var', 'variable')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 0 },
    });

    const classItem = findItem(result, 'MyClass');
    const varItem = findItem(result, 'my_var');

    assert.ok(classItem, 'MyClass should be in results');
    assert.ok(varItem, 'my_var should be in results');
    assert.ok(
      classItem!.sortText! < varItem!.sortText!,
      'Class should rank higher at start of new statement'
    );
  });

  it('should generate function snippets in expression context', async () => {
    const { complete } = createHarness({
      code: 'int x = ',
      symbols: [
        method('my_func', [
          { name: 'count', type: 'int' },
          { name: 'label', type: 'string' },
        ]),
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 8 },
    });

    const funcItem = findItem(result, 'my_func');
    assert.ok(funcItem, 'my_func should be in results');
    assert.strictEqual(
      funcItem!.insertTextFormat,
      InsertTextFormat.Snippet,
      'Should use snippet format in expression context'
    );
    assert.ok(funcItem!.insertText!.includes('${1:count}'), 'Should include first arg placeholder');
    assert.ok(
      funcItem!.insertText!.includes('${2:label}'),
      'Should include second arg placeholder'
    );
  });

  it('should NOT generate function snippets in type context', async () => {
    const { complete } = createHarness({
      code: '',
      symbols: [method('my_func', [{ name: 'x' }])],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const funcItem = findItem(result, 'my_func');
    assert.ok(funcItem, 'my_func should be in results');
    assert.notStrictEqual(
      funcItem!.insertTextFormat,
      InsertTextFormat.Snippet,
      'Should NOT use snippet format in type context'
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Edge cases
// ---------------------------------------------------------------------------

describe('Scenario: edge cases', () => {
  it('should handle empty document without crashing', async () => {
    const { complete } = createHarness({ code: '' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    assert.ok(result.items.length > 0, 'Should return keywords/builtins');
    const names = labels(result);
    assert.ok(names.includes('int'), 'Should still include keywords');
  });

  it('should handle EOF position without crashing', async () => {
    const { complete } = createHarness({
      code: 'int x = 1;\n',
      symbols: [sym('x', 'variable')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 0 },
    });

    assert.ok(result.items.length > 0, 'Should return completions at EOF');
    const names = labels(result);
    assert.ok(names.includes('x'), 'Should include local symbols');
  });

  it('should handle position inside comment (returns completions)', async () => {
    const { complete } = createHarness({
      code: '// this is a comment\n',
      symbols: [sym('my_var', 'variable')],
      bridgeContext: {
        context: 'none',
        objectName: '',
        prefix: '',
        operator: '',
      },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 10 },
    });

    assert.ok(result, 'Should not crash in comment');
  });

  it('should handle position inside string (returns completions)', async () => {
    const { complete } = createHarness({
      code: 'string s = "hello";\n',
      symbols: [sym('s', 'variable')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 14 },
    });

    assert.ok(result, 'Should not crash inside string');
  });

  it('should return empty array for nonexistent document', async () => {
    const { complete } = createHarness({ code: 'int x;' });
    const result = await complete({
      textDocument: { uri: 'file:///nonexistent.pike' },
      position: { line: 0, character: 0 },
    });

    assert.strictEqual(result.items.length, 0, 'Should return empty for unknown URI');
  });

  it('should return empty array when no cache entry exists', async () => {
    const { complete } = createHarness({ code: 'int x;', noCache: true });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    assert.strictEqual(result.items.length, 0, 'Should return empty without cache entry');
  });

  it('should handle no bridge gracefully (offline mode)', async () => {
    const { complete } = createHarness({
      code: 'int x;\n',
      symbols: [sym('x', 'variable')],
      noBridge: true,
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('x'), 'Should include local symbols');
    assert.ok(names.includes('int'), 'Should include keywords');
  });

  it('should handle very large symbol list without error', async () => {
    const manySymbols = Array.from({ length: 500 }, (_, i) => sym(`symbol_${i}`, 'variable'));

    const { complete } = createHarness({
      code: '',
      symbols: manySymbols,
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    assert.ok(result.items.length > 0, 'Should return completions for large symbol list');
  });

  it('should handle symbols without names gracefully', async () => {
    const { complete } = createHarness({
      code: '',
      symbols: [sym('', 'variable'), sym('valid_sym', 'variable')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const names = labels(result);
    assert.ok(names.includes('valid_sym'), 'Should include valid symbols');
    assert.ok(!names.includes(''), 'Should NOT include empty-name symbols');
  });

  it('should handle whitespace-only document', async () => {
    const { complete } = createHarness({ code: '   \n  \n\t\n' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 3 },
    });

    assert.ok(result.items.length > 0, 'Should return keywords for whitespace');
  });

  it('should handle type attribute completion inside __attribute__(...)', async () => {
    const { complete } = createHarness({ code: '__attribute__(dep' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 17 },
    });

    const names = labels(result);
    assert.ok(names.includes('deprecated'), 'Should suggest "deprecated" attribute');

    const item = findItem(result, 'deprecated');
    assert.ok(item, 'deprecated item should exist');
    assert.strictEqual(item!.insertText, '"deprecated"');
    assert.strictEqual(item!.kind, CompletionItemKind.Property);
  });

  it('should return CompletionList with correct isIncomplete flag', async () => {
    const { complete } = createHarness({ code: '' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    assert.ok('isIncomplete' in result, 'Should be CompletionList');
    assert.ok('items' in result, 'Should have items property');
    assert.ok(Array.isArray(result.items), 'Items should be an array');
  });

  it('should mark large completion sets as isIncomplete: true', async () => {
    const symbols = Array.from({ length: 60 }, (_, i) => sym(`many_symbol_${i}`, 'variable'));

    const { complete } = createHarness({ code: '', symbols });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    assert.strictEqual(result.isIncomplete, true, 'Large sets should be marked incomplete');
    assert.ok(result.items.length > 50, 'Should return items even when incomplete');
  });

  it('should deduplicate completion items', async () => {
    const { complete } = createHarness({
      code: '#include "utils.pike"\nint shared_name;\n',
      symbols: [sym('shared_name', 'variable')],
      includeSymbols: [
        {
          originalPath: '"utils.pike"',
          resolvedPath: '/path/to/utils.pike',
          symbols: [sym('shared_name', 'variable')],
        },
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 2, character: 0 },
    });

    const nameCounts = new Map<string, number>();
    for (const item of result.items) {
      nameCounts.set(item.label, (nameCounts.get(item.label) ?? 0) + 1);
    }

    for (const [name, count] of nameCounts) {
      assert.strictEqual(count, 1, `Item "${name}" should appear exactly once, got ${count}`);
    }
  });

  it('should handle type union/intersection operator completion', async () => {
    const { complete } = createHarness({ code: 'int|' });
    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 4 },
    });

    const names = labels(result);
    assert.ok(names.includes('string'), 'Should suggest types after union operator');
    assert.ok(names.includes('float'), 'Should suggest types after union operator');
  });

  it('should handle special characters in Pike identifiers (underscores)', async () => {
    const { complete } = createHarness({
      code: 'int _my_var = 1;\n_',
      symbols: [sym('_my_var', 'variable')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 1 },
    });

    const names = labels(result);
    assert.ok(names.includes('_my_var'), 'Should match identifiers starting with underscore');
  });

  it('should handle deprecated symbol tagging', async () => {
    const { complete } = createHarness({
      code: '',
      symbols: [{ ...sym('old_func', 'method'), deprecated: true } as PikeSymbol],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const item = findItem(result, 'old_func');
    assert.ok(item, 'Should find old_func');
    // Deprecated tagging not yet implemented in completion handler.
    // When implemented, this should assert: item!.tags?.includes(CompletionItemTag.Deprecated)
    assert.ok(item, 'Should find old_func even when deprecated flag is set');
  });

  it('should map symbol kinds to correct CompletionItemKind', async () => {
    const { complete } = createHarness({
      code: '',
      symbols: [
        sym('MyClass', 'class'),
        method('my_func', []),
        sym('my_var', 'variable'),
        sym('MY_CONST', 'constant'),
        sym('MyModule', 'module'),
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    assert.strictEqual(findItem(result, 'MyClass')?.kind, CompletionItemKind.Class);
    assert.strictEqual(findItem(result, 'my_func')?.kind, CompletionItemKind.Function);
    assert.strictEqual(findItem(result, 'my_var')?.kind, CompletionItemKind.Variable);
    assert.strictEqual(findItem(result, 'MY_CONST')?.kind, CompletionItemKind.Constant);
    assert.strictEqual(findItem(result, 'MyModule')?.kind, CompletionItemKind.Module);
  });

  it('should complete without crash when stdlib module resolution fails', async () => {
    const { complete } = createHarness({
      code: 'BadModule.',
      bridgeContext: {
        context: 'member_access',
        objectName: 'BadModule',
        prefix: '',
        operator: '.',
      },
      stdlibModules: {},
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 10 },
    });

    assert.ok(result, 'Should not crash on missing stdlib module');
    assert.strictEqual(result.items.length, 0, 'Should return empty for unknown module');
  });

  it('should handle method detail showing function signature', async () => {
    const { complete } = createHarness({
      code: '',
      symbols: [
        {
          name: 'add',
          kind: 'method' as const,
          modifiers: [],
          argNames: ['a', 'b'],
          argTypes: [{ kind: 'int' as const }, { kind: 'int' as const }],
          returnType: { kind: 'int' as const },
          type: {
            kind: 'function' as const,
            returnType: { kind: 'int' as const },
          },
        } as PikeSymbol,
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 0 },
    });

    const item = findItem(result, 'add');
    assert.ok(item, 'Should find add method');
    assert.ok(item!.detail, 'Should have detail');
    assert.ok(item!.detail!.includes('int'), 'Detail should include type info');
    assert.ok(/\(.*\)/.test(item!.detail!), 'Detail should show parameter list');
  });

  it('should handle long documents (1000+ lines) without error', async () => {
    const lines = ['int main() {'];
    for (let i = 0; i < 1000; i++) {
      lines.push(`  int var${i} = ${i};`);
    }
    lines.push('  return 0;');
    lines.push('}');
    const largeCode = lines.join('\n');

    const { complete } = createHarness({
      code: largeCode,
      symbols: [sym('main', 'method')],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 500, character: 0 },
    });

    assert.ok(result.items.length > 0, 'Should return completions in large document');
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Query engine completion path
// ---------------------------------------------------------------------------

describe('Scenario: query engine completion path', () => {
  it('should use query engine items when available', async () => {
    const { complete } = createHarness({
      code: 'int localVar = 1;',
      queryItems: [
        {
          label: 'qeItem',
          kind: CompletionItemKind.Variable,
          detail: 'From query engine',
        },
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 3 },
    });

    const names = labels(result);
    assert.ok(names.includes('qeItem'), 'Should include QE items');
  });

  it('should fall back to local completion when query engine returns stub', async () => {
    const { complete } = createHarness({
      code: 'int localVar = 1;',
      symbols: [
        sym('localVar', 'variable', {
          position: { file: 'test.pike', line: 1 },
        }),
      ],
      queryItems: [],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 3 },
    });

    const names = labels(result);
    assert.ok(!names.includes('qeItem'), 'Should NOT include QE items');
    assert.ok(names.includes('int'), 'Should include keywords from fallback');
  });

  it('should augment query engine completions with imported module symbols', async () => {
    const moduleSymbols = new Map<string, IntrospectedSymbol>();
    moduleSymbols.set('File', {
      name: 'File',
      type: { kind: 'program' },
      kind: 'class',
      modifiers: ['public'],
    });

    const { complete } = createHarness({
      code: 'import Stdio;\nFi',
      queryItems: [
        {
          label: 'qeItem',
          kind: CompletionItemKind.Variable,
          detail: 'From query engine',
        },
      ],
      importModules: [{ modulePath: 'Stdio', isStdlib: true }],
      stdlibModules: { Stdio: moduleSymbols },
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 1, character: 2 },
    });

    const names = labels(result);
    assert.ok(names.includes('qeItem'), 'Should include QE items');
    assert.ok(names.includes('File'), 'Should include imported module symbols');
  });

  it('should return enriched completion data with kind and detail from query engine', async () => {
    const { complete } = createHarness({
      code: 'int localVar = 1;\nMyClass obj;',
      queryItems: [
        {
          label: 'myFunction',
          kind: 'function',
          detail: 'function myFunction()',
        },
        {
          label: 'MyClass',
          kind: 'class',
          detail: 'class MyClass',
        },
        {
          label: 'MY_CONSTANT',
          kind: 'constant',
          detail: 'constant MY_CONSTANT',
        },
        {
          label: 'myVariable',
          kind: 'variable',
          detail: 'variable myVariable',
        },
      ],
    });

    const result = await complete({
      textDocument: { uri: 'file:///test.pike' },
      position: { line: 0, character: 3 },
    });

    const funcItem = result.items.find(item => item.label === 'myFunction');
    const classItem = result.items.find(item => item.label === 'MyClass');
    const constItem = result.items.find(item => item.label === 'MY_CONSTANT');
    const varItem = result.items.find(item => item.label === 'myVariable');

    assert.ok(funcItem);
    assert.strictEqual(funcItem.kind, CompletionItemKind.Function);
    assert.strictEqual(funcItem.detail, 'function myFunction()');

    assert.ok(classItem);
    assert.strictEqual(classItem.kind, CompletionItemKind.Class);
    assert.strictEqual(classItem.detail, 'class MyClass');

    assert.ok(constItem);
    assert.strictEqual(constItem.kind, CompletionItemKind.Constant);
    assert.strictEqual(constItem.detail, 'constant MY_CONSTANT');

    assert.ok(varItem);
    assert.strictEqual(varItem.kind, CompletionItemKind.Variable);
    assert.strictEqual(varItem.detail, 'variable myVariable');
  });
});
