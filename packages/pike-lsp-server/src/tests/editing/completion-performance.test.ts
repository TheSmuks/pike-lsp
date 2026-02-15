/**
 * Completion Provider Performance Tests
 *
 * Benchmarks for completion provider optimization (#96).
 * Tests completion performance with large symbol counts.
 *
 * Performance targets:
 * - 100 symbols: < 10ms
 * - 1000 symbols: < 50ms
 * - 10000 symbols: < 200ms
 */

import { describe, it, expect } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    CompletionItem,
    CompletionList,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { DocumentCacheEntry } from '../../core/types.js';
import { registerCompletionHandlers } from '../../features/editing/completion.js';

// =============================================================================
// Test Infrastructure: Mocks
// =============================================================================

type CompletionHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
    context?: { triggerKind: number; triggerCharacter?: string };
}) => Promise<CompletionItem[]>;

interface MockConnection {
    onCompletion: (handler: CompletionHandler) => void;
    onCompletionResolve: (handler: (item: CompletionItem) => CompletionItem) => void;
    completionHandler: CompletionHandler;
}

function createMockConnection(): MockConnection {
    let _completionHandler: CompletionHandler | null = null;
    let _resolveHandler: ((item: CompletionItem) => CompletionItem) | null = null;

    return {
        onCompletion(handler: CompletionHandler) { _completionHandler = handler; },
        onCompletionResolve(handler: (item: CompletionItem) => CompletionItem) { _resolveHandler = handler; },
        get completionHandler(): CompletionHandler {
            if (!_completionHandler) throw new Error('No completion handler registered');
            return _completionHandler;
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

// =============================================================================
// Test Fixtures: Large Symbol Sets
// =============================================================================

function generateMethods(count: number): PikeSymbol[] {
    const symbols: PikeSymbol[] = [];
    for (let i = 0; i < count; i++) {
        symbols.push({
            name: `method_${i}`,
            kind: 'method',
            modifiers: ['public'],
            type: {
                kind: 'function',
                returnType: { kind: 'int' },
                arguments: [
                    { name: `arg_${i}`, type: { kind: 'string' } }
                ]
            },
            argNames: [`arg_${i}`],
            argTypes: [{ kind: 'string' }],
            returnType: { kind: 'int' },
            position: { line: i + 10, character: 0 }
        });
    }
    return symbols;
}

function generateVariables(count: number): PikeSymbol[] {
    const symbols: PikeSymbol[] = [];
    for (let i = 0; i < count; i++) {
        symbols.push({
            name: `variable_${i}`,
            kind: 'variable',
            modifiers: ['private'],
            type: { kind: 'string' },
            position: { line: i + 10, character: 0 }
        });
    }
    return symbols;
}

function generateClasses(count: number, membersPerClass: number): PikeSymbol[] {
    const symbols: PikeSymbol[] = [];
    for (let i = 0; i < count; i++) {
        const members: PikeSymbol[] = [];
        for (let j = 0; j < membersPerClass; j++) {
            members.push({
                name: `member_${i}_${j}`,
                kind: 'method',
                modifiers: ['public'],
                type: { kind: 'function', returnType: { kind: 'void' } },
                position: { line: i * 100 + j + 10, character: 4 }
            });
        }

        symbols.push({
            name: `Class_${i}`,
            kind: 'class',
            modifiers: [],
            children: members,
            position: { line: i * 100 + 5, character: 0 }
        });
    }
    return symbols;
}

// =============================================================================
// Performance Benchmarks
// =============================================================================

describe('Completion Provider Performance', () => {
    it('completes with 100 symbols in < 10ms', async () => {
        const mockConn = createMockConnection();
        const uri = 'test://large.pike';
        const symbols = [
            ...generateMethods(50),
            ...generateVariables(50)
        ];

        const doc = TextDocument.create(uri, 'pike', 1, 'method_');
        const mockServices = {
            logger: silentLogger,
            documentCache: new Map([[uri, makeCacheEntry({ symbols })]]),
            bridge: null,
            moduleContext: null,
            includeResolver: null,
            stdlibIndex: null,
        };

        const mockDocuments = {
            get: (u: string) => u === uri ? doc : null,
        };

        registerCompletionHandlers(
            mockConn as { onCompletion: unknown; onCompletionResolve: unknown },
            mockServices,
            mockDocuments
        );

        const start = performance.now();
        await mockConn.completionHandler({
            textDocument: { uri },
            position: { line: 0, character: 7 }
        });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(10);
    });

    it('completes with 1000 symbols in < 50ms', async () => {
        const mockConn = createMockConnection();
        const uri = 'test://larger.pike';
        const symbols = [
            ...generateMethods(500),
            ...generateVariables(500)
        ];

        const doc = TextDocument.create(uri, 'pike', 1, 'method_');
        const mockServices = {
            logger: silentLogger,
            documentCache: new Map([[uri, makeCacheEntry({ symbols })]]),
            bridge: null,
            moduleContext: null,
            includeResolver: null,
            stdlibIndex: null,
        };

        const mockDocuments = {
            get: (u: string) => u === uri ? doc : null,
        };

        registerCompletionHandlers(
            mockConn as { onCompletion: unknown; onCompletionResolve: unknown },
            mockServices,
            mockDocuments
        );

        const start = performance.now();
        await mockConn.completionHandler({
            textDocument: { uri },
            position: { line: 0, character: 7 }
        });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(50);
    });

    it('completes with 100 classes (3000 total symbols) in < 100ms', async () => {
        const mockConn = createMockConnection();
        const uri = 'test://classes.pike';
        const symbols = generateClasses(100, 30);

        const doc = TextDocument.create(uri, 'pike', 1, 'Class_');
        const mockServices = {
            logger: silentLogger,
            documentCache: new Map([[uri, makeCacheEntry({ symbols })]]),
            bridge: null,
            moduleContext: null,
            includeResolver: null,
            stdlibIndex: null,
        };

        const mockDocuments = {
            get: (u: string) => u === uri ? doc : null,
        };

        registerCompletionHandlers(
            mockConn as { onCompletion: unknown; onCompletionResolve: unknown },
            mockServices,
            mockDocuments
        );

        const start = performance.now();
        await mockConn.completionHandler({
            textDocument: { uri },
            position: { line: 0, character: 6 }
        });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(100);
    });

    it('completes with 10000 symbols in < 200ms', async () => {
        const mockConn = createMockConnection();
        const uri = 'test://huge.pike';
        const symbols = [
            ...generateMethods(5000),
            ...generateVariables(5000)
        ];

        const doc = TextDocument.create(uri, 'pike', 1, 'method_');
        const mockServices = {
            logger: silentLogger,
            documentCache: new Map([[uri, makeCacheEntry({ symbols })]]),
            bridge: null,
            moduleContext: null,
            includeResolver: null,
            stdlibIndex: null,
        };

        const mockDocuments = {
            get: (u: string) => u === uri ? doc : null,
        };

        registerCompletionHandlers(
            mockConn as { onCompletion: unknown; onCompletionResolve: unknown },
            mockServices,
            mockDocuments
        );

        const start = performance.now();
        await mockConn.completionHandler({
            textDocument: { uri },
            position: { line: 0, character: 7 }
        });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(200);
    });
});
