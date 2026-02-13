/**
 * Shared Test Infrastructure: Mock Services
 *
 * Reusable mock objects for testing LSP feature handlers.
 * Extracted from completion-provider.test.ts pattern for use
 * across definition, references, and document symbol tests.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location, DocumentHighlight, Position } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { DocumentCacheEntry } from '../../core/types.js';

// =============================================================================
// Handler Types
// =============================================================================

/** Handler signature for onDefinition */
export type DefinitionHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
}) => Promise<Location | Location[] | null>;

/** Handler signature for onDeclaration */
export type DeclarationHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
}) => Promise<Location | null>;

/** Handler signature for onTypeDefinition */
export type TypeDefinitionHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
}) => Promise<Location | null>;

/** Handler signature for onReferences */
export type ReferencesHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
    context: { includeDeclaration: boolean };
}) => Promise<Location[]>;

/** Handler signature for onDocumentHighlight */
export type DocumentHighlightHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
}) => Promise<DocumentHighlight[] | null>;

/** Handler signature for onImplementation */
export type ImplementationHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
}) => Promise<Location[]>;

/** Handler signature for onDocumentSymbol */
export type DocumentSymbolHandler = (params: {
    textDocument: { uri: string };
}) => Promise<import('vscode-languageserver/node.js').DocumentSymbol[] | null>;

// =============================================================================
// Mock Connection
// =============================================================================

export interface MockConnection {
    onDefinition: (handler: DefinitionHandler) => void;
    onDeclaration: (handler: DeclarationHandler) => void;
    onTypeDefinition: (handler: TypeDefinitionHandler) => void;
    onReferences: (handler: ReferencesHandler) => void;
    onDocumentHighlight: (handler: DocumentHighlightHandler) => void;
    onImplementation: (handler: ImplementationHandler) => void;
    onDocumentSymbol: (handler: DocumentSymbolHandler) => void;
    onWorkspaceSymbol: (handler: (...args: any[]) => any) => void;
    console: { log: (...args: any[]) => void };
    languages: {
        callHierarchy: {
            onPrepare: (handler: any) => void;
            onOutgoingCalls: (handler: any) => void;
            onIncomingCalls: (handler: any) => void;
        };
        typeHierarchy: {
            onPrepare: (handler: any) => void;
            onSupertypes: (handler: any) => void;
            onSubtypes: (handler: any) => void;
        };
    };
    definitionHandler: DefinitionHandler;
    declarationHandler: DeclarationHandler;
    typeDefinitionHandler: TypeDefinitionHandler;
    referencesHandler: ReferencesHandler;
    documentHighlightHandler: DocumentHighlightHandler;
    implementationHandler: ImplementationHandler;
    documentSymbolHandler: DocumentSymbolHandler;
}

/**
 * Create a mock LSP Connection that captures registered handlers.
 * Supports all navigation, reference, and symbol handlers.
 */
export function createMockConnection(): MockConnection {
    let _definitionHandler: DefinitionHandler | null = null;
    let _declarationHandler: DeclarationHandler | null = null;
    let _typeDefinitionHandler: TypeDefinitionHandler | null = null;
    let _referencesHandler: ReferencesHandler | null = null;
    let _documentHighlightHandler: DocumentHighlightHandler | null = null;
    let _implementationHandler: ImplementationHandler | null = null;
    let _documentSymbolHandler: DocumentSymbolHandler | null = null;

    return {
        onDefinition(handler: DefinitionHandler) { _definitionHandler = handler; },
        onDeclaration(handler: DeclarationHandler) { _declarationHandler = handler; },
        onTypeDefinition(handler: TypeDefinitionHandler) { _typeDefinitionHandler = handler; },
        onReferences(handler: ReferencesHandler) { _referencesHandler = handler; },
        onDocumentHighlight(handler: DocumentHighlightHandler) { _documentHighlightHandler = handler; },
        onImplementation(handler: ImplementationHandler) { _implementationHandler = handler; },
        onDocumentSymbol(handler: DocumentSymbolHandler) { _documentSymbolHandler = handler; },
        onWorkspaceSymbol() {},
        console: { log: () => {} },
        languages: {
            callHierarchy: {
                onPrepare(_handler: any) { /* Store for testing if needed */ },
                onOutgoingCalls(_handler: any) { /* Store for testing if needed */ },
                onIncomingCalls(_handler: any) { /* Store for testing if needed */ },
            },
            typeHierarchy: {
                onPrepare(_handler: any) { /* Store for testing if needed */ },
                onSupertypes(_handler: any) { /* Store for testing if needed */ },
                onSubtypes(_handler: any) { /* Store for testing if needed */ },
            },
        },
        get definitionHandler(): DefinitionHandler {
            if (!_definitionHandler) throw new Error('No definition handler registered');
            return _definitionHandler;
        },
        get declarationHandler(): DeclarationHandler {
            if (!_declarationHandler) throw new Error('No declaration handler registered');
            return _declarationHandler;
        },
        get typeDefinitionHandler(): TypeDefinitionHandler {
            if (!_typeDefinitionHandler) throw new Error('No type definition handler registered');
            return _typeDefinitionHandler;
        },
        get referencesHandler(): ReferencesHandler {
            if (!_referencesHandler) throw new Error('No references handler registered');
            return _referencesHandler;
        },
        get documentHighlightHandler(): DocumentHighlightHandler {
            if (!_documentHighlightHandler) throw new Error('No document highlight handler registered');
            return _documentHighlightHandler;
        },
        get implementationHandler(): ImplementationHandler {
            if (!_implementationHandler) throw new Error('No implementation handler registered');
            return _implementationHandler;
        },
        get documentSymbolHandler(): DocumentSymbolHandler {
            if (!_documentSymbolHandler) throw new Error('No document symbol handler registered');
            return _documentSymbolHandler;
        },
    };
}

// =============================================================================
// Silent Logger
// =============================================================================

/** No-op logger for tests */
export const silentLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    log: () => {},
};

// =============================================================================
// Cache & Symbol Builders
// =============================================================================

/**
 * Build a minimal DocumentCacheEntry with sensible defaults.
 */
export function makeCacheEntry(overrides: Partial<DocumentCacheEntry> & { symbols: PikeSymbol[] }): DocumentCacheEntry {
    return {
        version: 1,
        diagnostics: [],
        symbolPositions: new Map(),
        ...overrides,
    };
}

/**
 * Build a minimal PikeSymbol for testing.
 */
export function sym(name: string, kind: PikeSymbol['kind'], extra?: Partial<PikeSymbol>): PikeSymbol {
    return { name, kind, modifiers: [], ...extra };
}

// =============================================================================
// Mock TextDocuments
// =============================================================================

/**
 * Create a mock TextDocuments manager from a Map of URI -> TextDocument.
 */
export function createMockDocuments(docs: Map<string, TextDocument>) {
    return {
        get: (uri: string) => docs.get(uri),
    };
}

// =============================================================================
// Mock Services
// =============================================================================

export interface MockServicesOverrides {
    symbols?: PikeSymbol[];
    symbolPositions?: Map<string, Position[]>;
    cacheEntries?: Map<string, DocumentCacheEntry>;
    inherits?: any[];
    bridge?: any;
    stdlibIndex?: any;
    workspaceScanner?: any;
    workspaceIndex?: any;
}

/**
 * Build mock Services suitable for registering handlers.
 *
 * Creates a documentCache backed by a simple Map.
 * Accepts overrides for customization.
 */
export function createMockServices(overrides?: MockServicesOverrides) {
    const cacheMap = overrides?.cacheEntries ?? new Map<string, DocumentCacheEntry>();

    const documentCache = {
        get: (uri: string) => cacheMap.get(uri),
        entries: () => cacheMap.entries(),
        keys: () => cacheMap.keys(),
        waitFor: async (_uri: string) => {},
        set: (uri: string, entry: DocumentCacheEntry) => cacheMap.set(uri, entry),
    };

    return {
        bridge: overrides?.bridge ?? null,
        logger: silentLogger,
        documentCache,
        stdlibIndex: overrides?.stdlibIndex ?? null,
        includeResolver: null,
        typeDatabase: {},
        workspaceIndex: overrides?.workspaceIndex ?? { searchSymbols: () => [] },
        workspaceScanner: overrides?.workspaceScanner ?? { isReady: () => false },
        globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 300 },
        includePaths: [],
        moduleContext: null,
    };
}
