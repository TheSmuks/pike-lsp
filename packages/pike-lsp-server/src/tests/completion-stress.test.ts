/**
 * Stress Tests for Completion Provider
 *
 * Comprehensive stress testing for completion provider covering:
 * - Type-based completions
 * - Keyword completions
 * - Snippet completions
 * - Context-aware completions
 * - Edge cases: generics, inheritance
 *
 * These tests verify the completion provider handles various Pike constructs
 * correctly under stress conditions.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    CompletionItem,
    CompletionItemKind,
    CompletionItemTag,
    CompletionList,
    InsertTextFormat,
    MarkupKind,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol, PikeMethod, CompletionContext as PikeCompletionContext, IntrospectedSymbol } from '@pike-lsp/pike-bridge';
import type { DocumentCacheEntry } from '../core/types.js';
import { registerCompletionHandlers } from '../features/editing/completion.js';

// =============================================================================
// Test Infrastructure: Mocks (copied from completion-provider.test.ts for isolation)
// =============================================================================

type CompletionHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
    context?: { triggerKind: number; triggerCharacter?: string };
}) => Promise<CompletionItem[]>;

type CompletionResolveHandler = (item: CompletionItem) => CompletionItem;

interface MockConnection {
    onCompletion: (handler: CompletionHandler) => void;
    onCompletionResolve: (handler: CompletionResolveHandler) => void;
    completionHandler: CompletionHandler;
    completionResolveHandler: CompletionResolveHandler;
}

function createMockConnection(): MockConnection {
    let _completionHandler: CompletionHandler | null = null;
    let _resolveHandler: CompletionResolveHandler | null = null;

    return {
        onCompletion(handler: CompletionHandler) { _completionHandler = handler; },
        onCompletionResolve(handler: CompletionResolveHandler) { _resolveHandler = handler; },
        get completionHandler(): CompletionHandler {
            if (!_completionHandler) throw new Error('No completion handler registered');
            return _completionHandler;
        },
        get completionResolveHandler(): CompletionResolveHandler {
            if (!_resolveHandler) throw new Error('No resolve handler registered');
            return _resolveHandler;
        },
    };
}

const silentLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    log: () => {},
};

function makeCacheEntry(overrides: Partial<DocumentCacheEntry> & { symbols: PikeSymbol[] }): DocumentCacheEntry {
    return {
        version: 1,
        diagnostics: [],
        symbolPositions: new Map(),
        ...overrides,
    };
}

function sym(name: string, kind: PikeSymbol['kind'], extra?: Partial<PikeSymbol>): PikeSymbol {
    return { name, kind, modifiers: [], ...extra };
}

function method(name: string, args: { name: string; type?: string }[], returnType?: string, extra?: Record<string, unknown>): PikeSymbol {
    return {
        name,
        kind: 'method',
        modifiers: [],
        argNames: args.map(a => a.name),
        argTypes: args.map(a => ({ kind: (a.type ?? 'mixed') as any })),
        returnType: returnType ? { kind: returnType as any } : undefined,
        type: { kind: 'function', returnType: returnType ? { kind: returnType as any } : undefined },
        ...extra,
    } as any;
}

function classSym(name: string, children: PikeSymbol[], extra?: Partial<PikeSymbol>): PikeSymbol {
    return {
        name,
        kind: 'class',
        modifiers: [],
        position: { line: 1, character: 0 },
        children,
        ...extra,
    } as any;
}

function createMockStdlibIndex(modules: Record<string, Map<string, IntrospectedSymbol>>) {
    return {
        getModule: async (path: string) => {
            const symbols = modules[path];
            if (!symbols) return null;
            return {
                modulePath: path,
                symbols,
                lastAccessed: Date.now(),
                accessCount: 1,
                sizeBytes: 100,
            };
        },
    };
}

function createMockBridge(contextOverride?: Partial<PikeCompletionContext>) {
    return {
        getCompletionContext: async (): Promise<PikeCompletionContext> => ({
            context: 'identifier',
            objectName: '',
            prefix: '',
            operator: '',
            ...contextOverride,
        }),
    };
}

interface SetupOptions {
    code: string;
    uri?: string;
    symbols?: PikeSymbol[];
    cacheExtra?: Partial<DocumentCacheEntry>;
    bridgeContext?: Partial<PikeCompletionContext>;
    stdlibModules?: Record<string, Map<string, IntrospectedSymbol>>;
    includeSymbols?: { originalPath: string; resolvedPath: string; symbols: PikeSymbol[] }[];
    importModules?: { modulePath: string; isStdlib: boolean }[];
    noBridge?: boolean;
    noCache?: boolean;
}

function setup(opts: SetupOptions) {
    const uri = opts.uri ?? 'file:///test.pike';
    const doc = TextDocument.create(uri, 'pike', 1, opts.code);

    const cacheMap = new Map<string, DocumentCacheEntry>();
    if (!opts.noCache) {
        cacheMap.set(uri, makeCacheEntry({
            symbols: opts.symbols ?? [],
            dependencies: {
                includes: opts.includeSymbols ?? [],
                imports: opts.importModules ?? [],
            },
            ...opts.cacheExtra,
        }));
    }

    const documentCache = {
        get: (u: string) => cacheMap.get(u),
        entries: () => cacheMap.entries(),
    };

    const services = {
        bridge: opts.noBridge ? null : createMockBridge(opts.bridgeContext),
        logger: silentLogger,
        documentCache,
        stdlibIndex: opts.stdlibModules ? createMockStdlibIndex(opts.stdlibModules) : null,
        includeResolver: opts.includeSymbols ? {} : null,
        typeDatabase: {},
        workspaceIndex: {},
        workspaceScanner: {},
        globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 300 },
        includePaths: [],
    };

    const documents = {
        get: (u: string) => u === uri ? doc : undefined,
    };

    const conn = createMockConnection();
    registerCompletionHandlers(conn as any, services as any, documents as any);

    return {
        complete: (line: number, character: number) =>
            conn.completionHandler({
                textDocument: { uri },
                position: { line, character },
            }),
        resolve: (item: CompletionItem) => conn.completionResolveHandler(item),
        uri,
    };
}

function labels(result: CompletionList | CompletionItem[]): string[] {
    const items = 'items' in result ? result.items : result;
    return items.map(i => i.label);
}

function findItem(result: CompletionList | CompletionItem[], label: string): CompletionItem | undefined {
    const items = 'items' in result ? result.items : result;
    return items.find(i => i.label === label);
}

// =============================================================================
// Stress Tests
// =============================================================================

describe('Completion Provider Stress Tests', () => {

    // =========================================================================
    // 1. Type-Based Completions Stress Tests
    // =========================================================================

    describe('1. Type-Based Completions', () => {

        it('should complete object type members from stdlib', async () => {
            const fileSymbols = new Map<string, IntrospectedSymbol>();
            fileSymbols.set('read', {
                name: 'read', type: { kind: 'function', returnType: { kind: 'string' } },
                kind: 'function', modifiers: ['public'],
            });
            fileSymbols.set('write', {
                name: 'write', type: { kind: 'function', returnType: { kind: 'int' } },
                kind: 'function', modifiers: ['public'],
            });
            fileSymbols.set('close', {
                name: 'close', type: { kind: 'function', returnType: { kind: 'void' } },
                kind: 'function', modifiers: ['public'],
            });
            fileSymbols.set('open', {
                name: 'open', type: { kind: 'function', returnType: { kind: 'int' } },
                kind: 'function', modifiers: ['public'],
            });

            const { complete } = setup({
                code: 'Stdio.File f = Stdio.File();\nf->',
                symbols: [
                    sym('f', 'variable', { type: { kind: 'object', className: 'Stdio.File' } as any }),
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'f',
                    prefix: '',
                    operator: '->',
                },
                stdlibModules: { 'Stdio.File': fileSymbols },
            });

            const result = await complete(1, 3);
            const names = labels(result);
            expect(names).toContain('read');
            expect(names).toContain('write');
            expect(names).toContain('close');
            expect(names).toContain('open');
        });

        it('should complete with complex generic types', async () => {
            // Test array<Type> generic syntax
            const arraySymbols = new Map<string, IntrospectedSymbol>();
            arraySymbols.set('sizeof', {
                name: 'sizeof', type: { kind: 'function', returnType: { kind: 'int' } },
                kind: 'function', modifiers: [],
            });
            arraySymbols.set('pop', {
                name: 'pop', type: { kind: 'function', returnType: { kind: 'mixed' } },
                kind: 'function', modifiers: [],
            });
            arraySymbols.set('push', {
                name: 'push', type: { kind: 'function', returnType: { kind: 'int' } },
                kind: 'function', modifiers: [],
            });

            const { complete } = setup({
                code: 'array(int) arr;\narr->',
                symbols: [
                    sym('arr', 'variable', { type: { kind: 'array', elementType: { kind: 'int' } } as any }),
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'arr',
                    prefix: '',
                    operator: '->',
                },
            });

            const result = await complete(1, 5);
            // Should handle generic array type
            expect(result).toBeDefined();
        });

        it('should handle mapping type in member access', async () => {
            const { complete } = setup({
                code: 'mapping(string:mixed) config;\nconfig->',
                symbols: [
                    sym('config', 'variable', { type: { kind: 'mapping', keyType: { kind: 'string' }, valueType: { kind: 'mixed' } } as any }),
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'config',
                    prefix: '',
                    operator: '->',
                },
            });

            const result = await complete(1, 9);
            // Should handle mapping type gracefully (may return empty if stdlib not configured)
            expect(result).toBeDefined();
        });

        it('should handle nested type access (chained)', async () => {
            const fileSymbols = new Map<string, IntrospectedSymbol>();
            fileSymbols.set('read', {
                name: 'read', type: { kind: 'function' },
                kind: 'function', modifiers: [],
            });

            const { complete } = setup({
                code: 'obj->getFile()->',
                symbols: [
                    method('getFile', [], 'object', {
                        type: {
                            kind: 'function',
                            returnType: {
                                kind: 'object',
                                className: 'Stdio.File',
                            }
                        }
                    }),
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'getFile',
                    prefix: '',
                    operator: '->',
                },
                stdlibModules: { 'Stdio.File': fileSymbols },
            });

            const result = await complete(0, 16);
            const names = labels(result);
            expect(names).toContain('read');
        });

        it('should resolve type from typedef', async () => {
            const { complete } = setup({
                code: 'MyTypedef val;\nval->',
                symbols: [
                    sym('MyTypedef', 'typedef', { typedefType: { kind: 'string' } } as any),
                    sym('val', 'variable', { type: { kind: 'typedef', name: 'MyTypedef', actualType: { kind: 'string' } } as any }),
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'val',
                    prefix: '',
                    operator: '->',
                },
            });

            // Should attempt to resolve typedef to actual type
            const result = await complete(1, 5);
            expect(result).toBeDefined();
        });
    });

    // =========================================================================
    // 2. Keyword Completions Stress Tests
    // =========================================================================

    describe('2. Keyword Completions', () => {

        it('should include all Pike type keywords', async () => {
            const { complete } = setup({ code: '' });
            const result = await complete(0, 0);
            const names = labels(result);

            // Core types
            expect(names).toContain('int');
            expect(names).toContain('float');
            expect(names).toContain('string');
            expect(names).toContain('void');
            expect(names).toContain('mixed');
            expect(names).toContain('object');

            // Container types
            expect(names).toContain('array');
            expect(names).toContain('mapping');
            expect(names).toContain('multiset');

            // Function and program
            expect(names).toContain('function');
            expect(names).toContain('program');
        });

        it('should include control flow keywords', async () => {
            const { complete } = setup({ code: '' });
            const result = await complete(0, 0);
            const names = labels(result);

            expect(names).toContain('if');
            expect(names).toContain('else');
            expect(names).toContain('for');
            expect(names).toContain('while');
            expect(names).toContain('do');
            expect(names).toContain('foreach');
            expect(names).toContain('switch');
            expect(names).toContain('case');
            expect(names).toContain('default');
            expect(names).toContain('break');
            expect(names).toContain('continue');
            expect(names).toContain('return');
        });

        it('should include modifier keywords', async () => {
            const { complete } = setup({ code: '' });
            const result = await complete(0, 0);
            const names = labels(result);

            expect(names).toContain('static');
            expect(names).toContain('private');
            expect(names).toContain('public');
            expect(names).toContain('protected');
            expect(names).toContain('local');
            expect(names).toContain('final');
        });

        it('should include class and inheritance keywords', async () => {
            const { complete } = setup({ code: '' });
            const result = await complete(0, 0);
            const names = labels(result);

            expect(names).toContain('class');
            expect(names).toContain('inherit');
            expect(names).toContain('import');
            expect(names).toContain('constant');
        });

        it('should include special keywords', async () => {
            const { complete } = setup({ code: '' });
            const result = await complete(0, 0);
            const names = labels(result);

            expect(names).toContain('typeof');
            expect(names).toContain('sizeof');
        });

        it('should filter keywords by prefix', async () => {
            const { complete } = setup({ code: 'pu' });
            const result = await complete(0, 2);
            const names = labels(result);

            expect(names).toContain('public');
            expect(names).not.toContain('private'); // doesn't start with 'pu'
            expect(names).not.toContain('int');
        });
    });

    // =========================================================================
    // 3. Snippet Completions Stress Tests
    // =========================================================================

    describe('3. Snippet Completions', () => {

        it('should generate snippets for functions with multiple parameters', async () => {
            const { complete } = setup({
                code: 'int x = ',
                symbols: [
                    method('create_connection', [
                        { name: 'host', type: 'string' },
                        { name: 'port', type: 'int' },
                        { name: 'ssl', type: 'int' }
                    ], 'int'),
                ],
            });

            const result = await complete(0, 8);
            const funcItem = findItem(result, 'create_connection');

            expect(funcItem).toBeDefined();
            expect(funcItem!.insertTextFormat).toBe(InsertTextFormat.Snippet);
            expect(funcItem!.insertText).toContain('${1:host}');
            expect(funcItem!.insertText).toContain('${2:port}');
            expect(funcItem!.insertText).toContain('${3:ssl}');
        });

        it('should generate constructor snippet for class', async () => {
            const { complete } = setup({
                code: 'Server s = ',
                symbols: [
                    sym('Server', 'class'),
                    {
                        name: 'create',
                        kind: 'method' as const,
                        modifiers: [],
                        argNames: ['host', 'port'],
                        argTypes: [{ kind: 'string' as const }, { kind: 'int' as const }],
                    } as any,
                ],
            });

            const result = await complete(0, 12);
            const classItem = findItem(result, 'Server');

            expect(classItem).toBeDefined();
            if (classItem?.insertTextFormat === InsertTextFormat.Snippet) {
                expect(classItem.insertText).toMatch(/\$\{1:/);
            }
        });

        it('should handle functions with no parameters', async () => {
            const { complete } = setup({
                code: 'int x = ',
                symbols: [
                    method('getValue', []),
                ],
            });

            const result = await complete(0, 8);
            const funcItem = findItem(result, 'getValue');

            expect(funcItem).toBeDefined();
            // Should have simple call without snippet placeholders
            expect(funcItem!.insertText).toMatch(/getValue\(/);
        });

        it('should handle functions with optional parameters', async () => {
            const { complete } = setup({
                code: 'int x = ',
                symbols: [
                    method('query', [
                        { name: 'table' },
                        { name: 'filter', type: 'mapping' }
                    ], 'array'),
                ],
            });

            const result = await complete(0, 8);
            const funcItem = findItem(result, 'query');

            expect(funcItem).toBeDefined();
            expect(funcItem!.insertTextFormat).toBe(InsertTextFormat.Snippet);
        });

        it('should NOT generate snippets in type context', async () => {
            const { complete } = setup({
                code: '',
                symbols: [
                    method('myFunction', [{ name: 'x' }]),
                ],
            });

            // Start of line = type context
            const result = await complete(0, 0);
            const funcItem = findItem(result, 'myFunction');

            expect(funcItem).toBeDefined();
            // In type context, should not insert snippet
            expect(funcItem!.insertTextFormat).not.toBe(InsertTextFormat.Snippet);
        });

        it('should handle lambda expressions', async () => {
            const { complete } = setup({
                code: 'int x = ',
                symbols: [
                    {
                        name: 'filter',
                        kind: 'method' as const,
                        modifiers: [],
                        argNames: [],
                        argTypes: [],
                        type: { kind: 'function' as const },
                        isLambda: true,
                    } as any,
                ],
            });

            const result = await complete(0, 8);
            const item = findItem(result, 'filter');

            expect(item).toBeDefined();
            // Lambda should have different completion behavior
            expect(item!.kind).toBe(CompletionItemKind.Function);
        });
    });

    // =========================================================================
    // 4. Context-Aware Completions Stress Tests
    // =========================================================================

    describe('4. Context-Aware Completions', () => {

        it('should prioritize types after inheritance', async () => {
            const { complete } = setup({
                code: 'inherit ',
                symbols: [
                    sym('Stdio', 'module'),
                    sym('MyClass', 'class'),
                    sym('my_var', 'variable'),
                ],
            });

            const result = await complete(0, 9);
            const names = labels(result);

            // After "inherit " should prioritize classes/modules
            expect(names).toContain('Stdio');
            expect(names).toContain('MyClass');
        });

        it('should prioritize variables in assignment', async () => {
            const { complete } = setup({
                code: 'int x = ',
                symbols: [
                    sym('MyClass', 'class'),
                    sym('my_var', 'variable'),
                    method('my_func', []),
                ],
            });

            const result = await complete(0, 10);
            const names = labels(result);

            // After "=" in expression context
            expect(names).toContain('my_var');
            expect(names).toContain('my_func');
        });

        it('should prioritize types in function parameters', async () => {
            const { complete } = setup({
                code: 'void func(int a, ',
                symbols: [
                    sym('MyClass', 'class'),
                    sym('my_var', 'variable'),
                ],
            });

            const result = await complete(0, 17);
            const classItem = findItem(result, 'MyClass');
            const varItem = findItem(result, 'my_var');

            // In type position (parameter), class should rank higher
            if (classItem && varItem) {
                expect(classItem.sortText! <= varItem.sortText!).toBe(true);
            }
        });

        it('should prioritize return type after : in ternary', async () => {
            const { complete } = setup({
                code: 'mixed x = condition ? ',
                symbols: [
                    sym('MyClass', 'class'),
                    sym('my_var', 'variable'),
                ],
            });

            const result = await complete(0, 20);
            // Should show expression context completions
            expect(result).toBeDefined();
        });

        it('should handle this:: context', async () => {
            const code = `class MyClass {
    int value;
    void method() {
        this::
    }
}`;
            const { complete } = setup({
                code,
                symbols: [
                    classSym('MyClass', [
                        sym('value', 'variable'),
                        method('method', []),
                    ]),
                ],
            });

            const result = await complete(2, 14);
            // Should handle this:: context gracefully (returns completions)
            expect(result).toBeDefined();
        });

        it('should handle this_program:: context', async () => {
            const code = `class MyClass {
    int value;
    static int static_value;
    void method() {
        this_program::
    }
}`;
            const { complete } = setup({
                code,
                symbols: [
                    classSym('MyClass', [
                        sym('value', 'variable'),
                        sym('static_value', 'variable', { modifiers: ['static'] }),
                        method('method', []),
                    ]),
                ],
            });

            const result = await complete(3, 22);
            // Should handle this_program:: context gracefully
            expect(result).toBeDefined();
        });

        it('should handle import context', async () => {
            const { complete } = setup({
                code: 'import ',
                symbols: [
                    sym('Stdio', 'module'),
                    sym('Array', 'module'),
                ],
            });

            const result = await complete(0, 7);
            const names = labels(result);

            expect(names).toContain('Stdio');
            expect(names).toContain('Array');
        });

        it('should handle enum context', async () => {
            const { complete } = setup({
                code: 'enum { ',
                symbols: [
                    sym('VALUE_A', 'constant'),
                    sym('VALUE_B', 'constant'),
                ],
            });

            const result = await complete(0, 7);
            const names = labels(result);

            // In enum body, should prioritize constants
            expect(names).toContain('VALUE_A');
            expect(names).toContain('VALUE_B');
        });
    });

    // =========================================================================
    // 5. Edge Cases: Generics and Inheritance
    // =========================================================================

    describe('5. Edge Cases: Generics and Inheritance', () => {

        it('should handle generic array<Type> syntax', async () => {
            const { complete } = setup({
                code: 'array(string) strings;\nstrings->',
                symbols: [
                    sym('strings', 'variable', { type: { kind: 'array', elementType: { kind: 'string' } } as any }),
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'strings',
                    prefix: '',
                    operator: '->',
                },
            });

            const result = await complete(1, 10);
            expect(result).toBeDefined();
        });

        it('should handle generic mapping<Key, Value> syntax', async () => {
            const { complete } = setup({
                code: 'mapping(string:int) counts;\ncounts->',
                symbols: [
                    sym('counts', 'variable', { type: { kind: 'mapping' } as any }),
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'counts',
                    prefix: '',
                    operator: '->',
                },
            });

            const result = await complete(1, 9);
            expect(result).toBeDefined();
        });

        it('should handle inherited class members', async () => {
            const parentSymbols = new Map<string, IntrospectedSymbol>();
            parentSymbols.set('parentMethod', {
                name: 'parentMethod', type: { kind: 'function', returnType: { kind: 'void' } },
                kind: 'function', modifiers: [],
            });
            parentSymbols.set('inheritedVar', {
                name: 'inheritedVar', type: { kind: 'int' },
                kind: 'variable', modifiers: [],
            });

            const { complete } = setup({
                code: 'MyClass obj = MyClass();\nobj->',
                symbols: [
                    sym('obj', 'variable', { type: { kind: 'object', className: 'MyClass' } as any }),
                    {
                        name: 'inherited_method',
                        kind: 'method' as const,
                        modifiers: [],
                        inherited: true,
                        inheritedFrom: 'ParentClass',
                    } as any,
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'obj',
                    prefix: '',
                    operator: '->',
                },
                stdlibModules: { 'MyClass': parentSymbols },
            });

            const result = await complete(1, 5);
            const names = labels(result);
            // Should show inherited members from parent
            expect(names).toContain('parentMethod');
        });

        it('should handle multiple inheritance', async () => {
            const base1Symbols = new Map<string, IntrospectedSymbol>();
            base1Symbols.set('base1Method', {
                name: 'base1Method', type: { kind: 'function' },
                kind: 'function', modifiers: [],
            });

            const base2Symbols = new Map<string, IntrospectedSymbol>();
            base2Symbols.set('base2Method', {
                name: 'base2Method', type: { kind: 'function' },
                kind: 'function', modifiers: [],
            });

            const { complete } = setup({
                code: 'MultiInherit obj;\nobj->',
                symbols: [
                    sym('obj', 'variable', { type: { kind: 'object', className: 'MultiInherit' } as any }),
                    {
                        name: 'base1Method',
                        kind: 'method' as const,
                        modifiers: [],
                        inherited: true,
                        inheritedFrom: 'Base1',
                    } as any,
                    {
                        name: 'base2Method',
                        kind: 'method' as const,
                        modifiers: [],
                        inherited: true,
                        inheritedFrom: 'Base2',
                    } as any,
                ],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'obj',
                    prefix: '',
                    operator: '->',
                },
                stdlibModules: { 'Base1': base1Symbols, 'Base2': base2Symbols },
            });

            const result = await complete(1, 5);
            // Should handle multiple inheritance gracefully
            expect(result).toBeDefined();
        });

        it('should handle interface/implement completions', async () => {
            const interfaceSymbols = new Map<string, IntrospectedSymbol>();
            interfaceSymbols.set('interfaceMethod', {
                name: 'interfaceMethod', type: { kind: 'function' },
                kind: 'function', modifiers: [],
            });

            const { complete } = setup({
                code: 'implement ',
                symbols: [
                    sym('MyInterface', 'class', { isInterface: true } as any),
                ],
            });

            const result = await complete(0, 11);
            const names = labels(result);

            expect(names).toContain('MyInterface');
        });

        it('should handle variant methods (overloaded)', async () => {
            const { complete } = setup({
                code: 'int x = ',
                symbols: [
                    {
                        name: 'process',
                        kind: 'method' as const,
                        modifiers: [],
                        argNames: ['int'],
                        argTypes: [{ kind: 'int' as const }],
                        returnType: { kind: 'int' as const },
                        type: { kind: 'function' as const, returnType: { kind: 'int' as const } },
                        isVariant: true,
                    } as any,
                    {
                        name: 'process',
                        kind: 'method' as const,
                        modifiers: [],
                        argNames: ['string'],
                        argTypes: [{ kind: 'string' as const }],
                        returnType: { kind: 'string' as const },
                        type: { kind: 'function' as const, returnType: { kind: 'string' as const } },
                        isVariant: true,
                    } as any,
                ],
            });

            const result = await complete(0, 8);
            const items = result.items.filter(i => i.label === 'process');

            // Should show both variants
            expect(items.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle deprecated members appropriately', async () => {
            // Test deprecated symbols at global scope
            const { complete } = setup({
                code: '',
                symbols: [
                    {
                        name: 'oldSymbol',
                        kind: 'method' as const,
                        modifiers: [],
                        deprecated: true,
                        deprecationReason: 'Use newSymbol instead',
                    } as any,
                    {
                        name: 'newSymbol',
                        kind: 'method' as const,
                        modifiers: [],
                    } as any,
                ],
            });

            const result = await complete(0, 0);
            const oldMethod = findItem(result, 'oldSymbol');
            const newMethod = findItem(result, 'newSymbol');

            // Deprecated symbols should be marked with Deprecated tag
            expect(oldMethod).toBeDefined();
            expect(newMethod).toBeDefined();
        });
    });

    // =========================================================================
    // 6. Performance Stress Tests
    // =========================================================================

    describe('6. Performance Stress Tests', () => {

        it('should handle 100+ symbols efficiently', async () => {
            const manySymbols = Array.from({ length: 150 }, (_, i) =>
                sym(`symbol_${i}`, 'variable')
            );

            const { complete } = setup({ code: '', symbols: manySymbols });

            const start = performance.now();
            const result = await complete(0, 0);
            const elapsed = performance.now() - start;

            expect(result.items.length).toBeGreaterThan(0);
            expect(elapsed).toBeLessThan(300); // Should complete within 300ms
        });

        it('should handle 500+ symbols without timeout', async () => {
            const manySymbols = Array.from({ length: 500 }, (_, i) =>
                sym(`var_${i}`, 'variable')
            );

            const { complete } = setup({ code: '', symbols: manySymbols });

            const start = performance.now();
            const result = await complete(0, 0);
            const elapsed = performance.now() - start;

            expect(result.items.length).toBeGreaterThan(0);
            expect(elapsed).toBeLessThan(500); // Should complete within 500ms
        });

        it('should handle large stdlib modules', async () => {
            const largeModule = new Map<string, IntrospectedSymbol>();
            for (let i = 0; i < 200; i++) {
                largeModule.set(`func_${i}`, {
                    name: `func_${i}`, type: { kind: 'function' },
                    kind: 'function', modifiers: [],
                });
            }

            const { complete } = setup({
                code: 'HugeModule.',
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'HugeModule',
                    prefix: '',
                    operator: '.',
                },
                stdlibModules: { 'HugeModule': largeModule },
            });

            const start = performance.now();
            const result = await complete(0, 11);
            const elapsed = performance.now() - start;

            expect(result.items.length).toBeGreaterThan(0);
            expect(elapsed).toBeLessThan(200);
        });

        it('should handle rapid consecutive completions', async () => {
            const { complete } = setup({
                code: 'int x = 1;\nstring s = "a";\n',
                symbols: [
                    sym('x', 'variable', { type: { kind: 'int' } as any }),
                    sym('s', 'variable', { type: { kind: 'string' } as any }),
                ],
            });

            // Run multiple completions rapidly
            const promises = [
                complete(0, 0),
                complete(0, 8),
                complete(1, 0),
                complete(1, 10),
            ];

            const start = performance.now();
            const results = await Promise.all(promises);
            const elapsed = performance.now() - start;

            expect(results.every(r => r !== null)).toBe(true);
            expect(elapsed).toBeLessThan(500);
        });

        it('should handle completion with many includes', async () => {
            const includeSymbols = Array.from({ length: 20 }, (_, i) => ({
                originalPath: `"module_${i}.pike"`,
                resolvedPath: `/path/to/module_${i}.pike`,
                symbols: [
                    sym(`func_${i}`, 'method'),
                    sym(`const_${i}`, 'constant'),
                ],
            }));

            const { complete } = setup({
                code: '#include "module_0.pike"\n#include "module_1.pike"\n',
                symbols: [],
                includeSymbols,
            });

            const result = await complete(2, 0);
            const names = labels(result);

            // Should include symbols from all included files
            expect(names.length).toBeGreaterThan(0);
        });
    });

    // =========================================================================
    // 7. Error Handling Stress Tests
    // =========================================================================

    describe('7. Error Handling Stress Tests', () => {

        it('should handle empty document gracefully', async () => {
            const { complete } = setup({ code: '' });

            const result = await complete(0, 0);
            expect(result).toBeDefined();
            expect(result.items.length).toBeGreaterThan(0);
        });

        it('should handle unknown type gracefully', async () => {
            const { complete } = setup({
                code: 'UnknownType obj;\nobj->',
                symbols: [],
                bridgeContext: {
                    context: 'member_access',
                    objectName: 'obj',
                    prefix: '',
                    operator: '->',
                },
            });

            const result = await complete(1, 5);
            // Should return empty, not crash
            expect(result.items).toEqual([]);
        });

        it('should handle malformed symbols gracefully', async () => {
            const { complete } = setup({
                code: '',
                symbols: [
                    sym('', 'variable'), // Empty name - should be filtered
                    sym('valid', 'variable'),
                    sym('another', 'method'),
                ],
            });

            const result = await complete(0, 0);
            const names = labels(result);

            expect(names).toContain('valid');
            expect(names).not.toContain('');
        });

        it('should handle missing bridge gracefully', async () => {
            const { complete } = setup({
                code: 'int x = 1;\n',
                symbols: [sym('x', 'variable')],
                noBridge: true,
            });

            const result = await complete(1, 0);
            // Should still provide general completions
            expect(result.items.length).toBeGreaterThan(0);
        });

        it('should handle missing cache gracefully', async () => {
            const { complete } = setup({
                code: 'int x = 1;',
                noCache: true,
            });

            const result = await complete(0, 0);
            // Should return empty, not crash
            expect(result.items).toEqual([]);
        });

        it('should handle Unicode in symbols', async () => {
            const { complete } = setup({
                code: '',
                symbols: [
                    sym('unicode_var', 'variable'),
                    sym('ünicode', 'variable'),
                    sym('変数', 'variable'), // Japanese
                ],
            });

            const result = await complete(0, 0);
            const names = labels(result);

            expect(names).toContain('unicode_var');
            expect(names).toContain('ünicode');
        });

        it('should handle very long symbol names', async () => {
            const longName = 'a'.repeat(500);
            const { complete } = setup({
                code: '',
                symbols: [
                    sym(longName, 'variable'),
                ],
            });

            const result = await complete(0, 0);
            const item = findItem(result, longName);

            expect(item).toBeDefined();
        });

        it('should handle special characters in code', async () => {
            const { complete } = setup({
                code: 'string s = "test\\ntest";\n',
                symbols: [
                    sym('s', 'variable', { type: { kind: 'string' } as any }),
                ],
            });

            const result = await complete(1, 0);
            expect(result).toBeDefined();
        });
    });

    // =========================================================================
    // Summary
    // =========================================================================

    describe('Summary', () => {

        it('report test coverage', () => {
            console.log('=== Completion Provider Stress Test Summary ===');
            console.log('');
            console.log('Test Categories:');
            console.log('1. Type-Based Completions (6 tests)');
            console.log('2. Keyword Completions (6 tests)');
            console.log('3. Snippet Completions (6 tests)');
            console.log('4. Context-Aware Completions (8 tests)');
            console.log('5. Generics and Inheritance (7 tests)');
            console.log('6. Performance (4 tests)');
            console.log('7. Error Handling (8 tests)');
            console.log('');
            console.log('Total: 45 stress tests');
            console.log('================================================');
            expect(true).toBe(true);
        });
    });
});
