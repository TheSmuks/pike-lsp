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

/** Handler signature for typeHierarchy onPrepare */
export type TypeHierarchyPrepareHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<import('vscode-languageserver/node.js').TypeHierarchyItem[] | null>;

/** Handler signature for typeHierarchy onSupertypes */
export type TypeHierarchySupertypesHandler = (params: {
  item: import('vscode-languageserver/node.js').TypeHierarchyItem;
  direction: 'parents' | 'children';
}) => Promise<import('vscode-languageserver/node.js').TypeHierarchyItem[] | null>;

/** Handler signature for typeHierarchy onSubtypes */
export type TypeHierarchySubtypesHandler = (params: {
  item: import('vscode-languageserver/node.js').TypeHierarchyItem;
  direction: 'parents' | 'children';
}) => Promise<import('vscode-languageserver/node.js').TypeHierarchyItem[] | null>;

/** Handler signature for onLinkedEditingRange */
export type LinkedEditingRangeHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => import('vscode-languageserver/node.js').LinkedEditingRanges | null;

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
  onLinkedEditingRange: (handler: LinkedEditingRangeHandler) => void;
  onRequest: (method: string, handler: (params: unknown) => unknown) => void;
  sendDiagnostics: (params: { uri: string; diagnostics: any[] }) => void;
  getSentDiagnostics: () => any[];
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
    semanticTokens: {
      on: (handler: any) => void;
      onDelta: (handler: any) => void;
    };
    moniker: {
      on: (handler: any) => void;
    };
  };
  definitionHandler: DefinitionHandler;
  declarationHandler: DeclarationHandler;
  typeDefinitionHandler: TypeDefinitionHandler;
  referencesHandler: ReferencesHandler;
  documentHighlightHandler: DocumentHighlightHandler;
  implementationHandler: ImplementationHandler;
  documentSymbolHandler: DocumentSymbolHandler;
  linkedEditingRangeHandler: LinkedEditingRangeHandler;
  typeHierarchyPrepareHandler: TypeHierarchyPrepareHandler;
  typeHierarchySupertypesHandler: TypeHierarchySupertypesHandler;
  typeHierarchySubtypesHandler: TypeHierarchySubtypesHandler;
  semanticTokensHandler: any;
  semanticTokensDeltaHandler: any;
  getRequestHandler(method: string): ((params: unknown) => unknown) | undefined;
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
  let _linkedEditingRangeHandler: LinkedEditingRangeHandler | null = null;
  let _typeHierarchyPrepareHandler: TypeHierarchyPrepareHandler | null = null;
  let _typeHierarchySupertypesHandler: TypeHierarchySupertypesHandler | null = null;
  const _sentDiagnostics: Array<{ uri: string; diagnostics: any[] }> = [];
  let _typeHierarchySubtypesHandler: TypeHierarchySubtypesHandler | null = null;
  let _semanticTokensHandler: any = null;
  let _semanticTokensDeltaHandler: any = null;
  const _requestHandlers = new Map<string, (params: unknown) => unknown>();

  return {
    onDefinition(handler: DefinitionHandler) {
      _definitionHandler = handler;
    },
    onDeclaration(handler: DeclarationHandler) {
      _declarationHandler = handler;
    },
    onTypeDefinition(handler: TypeDefinitionHandler) {
      _typeDefinitionHandler = handler;
    },
    onReferences(handler: ReferencesHandler) {
      _referencesHandler = handler;
    },
    onDocumentHighlight(handler: DocumentHighlightHandler) {
      _documentHighlightHandler = handler;
    },
    onImplementation(handler: ImplementationHandler) {
      _implementationHandler = handler;
    },
    onDocumentSymbol(handler: DocumentSymbolHandler) {
      _documentSymbolHandler = handler;
    },
    onWorkspaceSymbol() {},
    onLinkedEditingRange(handler: LinkedEditingRangeHandler) {
      _linkedEditingRangeHandler = handler;
    },
    onRequest(method: string, handler: (params: unknown) => unknown) {
      _requestHandlers.set(method, handler);
    },
    sendDiagnostics(params: { uri: string; diagnostics: any[] }) {
      _sentDiagnostics.push(params);
    },
    console: { log: () => {} },
    languages: {
      callHierarchy: {
        onPrepare(_handler: any) {
          /* Store for testing if needed */
        },
        onOutgoingCalls(_handler: any) {
          /* Store for testing if needed */
        },
        onIncomingCalls(_handler: any) {
          /* Store for testing if needed */
        },
      },
      typeHierarchy: {
        onPrepare(handler: TypeHierarchyPrepareHandler) {
          _typeHierarchyPrepareHandler = handler;
        },
        onSupertypes(handler: TypeHierarchySupertypesHandler) {
          _typeHierarchySupertypesHandler = handler;
        },
        onSubtypes(handler: TypeHierarchySubtypesHandler) {
          _typeHierarchySubtypesHandler = handler;
        },
      },
      semanticTokens: {
        on(handler: any) {
          _semanticTokensHandler = handler;
        },
        onDelta(handler: any) {
          _semanticTokensDeltaHandler = handler;
        },
      },
      moniker: {
        on(_handler: any) {},
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
    get linkedEditingRangeHandler(): LinkedEditingRangeHandler {
      if (!_linkedEditingRangeHandler)
        throw new Error('No linked editing range handler registered');
      return _linkedEditingRangeHandler;
    },
    get typeHierarchyPrepareHandler(): TypeHierarchyPrepareHandler {
      if (!_typeHierarchyPrepareHandler)
        throw new Error('No type hierarchy prepare handler registered');
      return _typeHierarchyPrepareHandler;
    },
    get typeHierarchySupertypesHandler(): TypeHierarchySupertypesHandler {
      if (!_typeHierarchySupertypesHandler)
        throw new Error('No type hierarchy supertypes handler registered');
      return _typeHierarchySupertypesHandler;
    },
    get typeHierarchySubtypesHandler(): TypeHierarchySubtypesHandler {
      if (!_typeHierarchySubtypesHandler)
        throw new Error('No type hierarchy subtypes handler registered');
      return _typeHierarchySubtypesHandler;
    },
    get semanticTokensHandler(): any {
      if (!_semanticTokensHandler) throw new Error('No semantic tokens handler registered');
      return _semanticTokensHandler;
    },
    get semanticTokensDeltaHandler(): any {
      if (!_semanticTokensDeltaHandler)
        throw new Error('No semantic tokens delta handler registered');
      return _semanticTokensDeltaHandler;
    },
    getRequestHandler(method: string): ((params: unknown) => unknown) | undefined {
      return _requestHandlers.get(method);
    },
    getSentDiagnostics() {
      return _sentDiagnostics;
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
export function makeCacheEntry(
  overrides: Partial<DocumentCacheEntry> & { symbols: PikeSymbol[] }
): DocumentCacheEntry {
  return {
    version: 1,
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    ...overrides,
  };
}

/**
 * Build a minimal PikeSymbol for testing.
 */
export function sym(
  name: string,
  kind: PikeSymbol['kind'],
  extra?: Partial<PikeSymbol>
): PikeSymbol {
  return { name, kind, modifiers: [], ...extra };
}

// =============================================================================
// Mock TextDocuments
// =============================================================================

/**
 * Create a mock TextDocuments manager from a Map of URI -> TextDocument.
 */
export function createMockDocuments(docs: Map<string, TextDocument>) {
  const didChangeListeners: Array<(event: { document: TextDocument }) => void> = [];
  const didCloseListeners: Array<(event: { document: TextDocument }) => void> = [];
  return {
    get: (uri: string) => docs.get(uri),
    onDidChangeContent: (listener: (event: { document: TextDocument }) => void) => {
      didChangeListeners.push(listener);
    },
    onDidClose: (listener: (event: { document: TextDocument }) => void) => {
      didCloseListeners.push(listener);
    },
    triggerDidChangeContent: (uri: string) => {
      const doc = docs.get(uri);
      if (!doc) {
        return;
      }
      for (const listener of didChangeListeners) {
        listener({ document: doc });
      }
    },
    triggerDidClose: (uri: string) => {
      const doc = docs.get(uri);
      if (!doc) {
        return;
      }
      for (const listener of didCloseListeners) {
        listener({ document: doc });
      }
    },
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
 * Create a mock workspace scanner that simulates workspace file scanning.
 * Returns uncached files for testing workspace-based reference search.
 */
export function createMockWorkspaceScanner(files: { uri: string; content: string }[]) {
  const fileMap = new Map<string, { uri: string; content: string }>();
  for (const f of files) {
    fileMap.set(f.uri, f);
  }

  return {
    isReady: () => true,
    getUncachedFiles: (cachedUris: Set<string>) => {
      return files
        .filter(f => !cachedUris.has(f.uri))
        .map(f => ({ uri: f.uri, path: decodeURIComponent(f.uri.replace(/^file:\/\//, '')) }));
    },
  };
}

/**
 * Create a mock bridge that simulates Pike bridge responses.
 * Supports cross-file symbol resolution and inheritance queries.
 */
export function createMockBridge(responses: {
  findDefinition?: (file: string, symbol: string) => Promise<any>;
  findReferences?: (file: string, symbol: string) => Promise<any[]>;
  getInheritance?: (file: string, className: string) => Promise<any[]>;
  resolveSymbol?: (file: string, symbol: string) => Promise<any>;
}) {
  return {
    bridge: {
      findDefinition: responses.findDefinition ?? (async () => null),
      findReferences: responses.findReferences ?? (async () => []),
      getInheritance: responses.getInheritance ?? (async () => []),
      resolveSymbol: responses.resolveSymbol ?? (async () => null),
    },
  };
}

/**
 * Create a mock workspace index for symbol search across workspace.
 */
export function createMockWorkspaceIndex(symbols: Map<string, any[]>) {
  return {
    searchSymbols: (query: string) => {
      return symbols.get(query) ?? [];
    },
  };
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
