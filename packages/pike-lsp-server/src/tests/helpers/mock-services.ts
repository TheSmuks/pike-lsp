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
import { DocumentCache } from '../../services/document-cache.js';
import { TypeDatabase } from '../../type-database.js';
import { Logger } from '@pike-lsp/core';

// Re-export connection mock from test-helpers so scenario tests import one place
export {
  createMockConnection,
  type MockConnection,
  asConnection,
  asServices,
  asTextDocuments,
} from './test-helpers.js';

// Re-export mock-bridge types for convenience
export {
  type MockBridgeConfig,
  type FaultInjectionConfig,
  FaultInjectableMockBridge,
} from './mock-bridge.js';
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

/** Handler signature for onPrepareRename */
export type PrepareRenameHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<import('vscode-languageserver/node.js').Range | null>;

/** Handler signature for onRenameRequest */
export type RenameRequestHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
  newName: string;
}) => Promise<import('vscode-languageserver/node.js').WorkspaceEdit | null>;
// =============================================================================
// Silent Logger
// =============================================================================

/** No-op logger for tests */
export const silentLogger = new Logger('test');

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
    callPositions: new Map(),
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
// Mock Services (full-featured, accepts overrides)
// =============================================================================

export interface MockServicesOverrides {
  symbols?: PikeSymbol[];
  symbolPositions?: Map<string, Position[]>;
  cacheEntries?: Map<string, DocumentCacheEntry>;
  documentCache?: DocumentCache;
  inherits?: unknown[];
  bridge?: unknown;
  stdlibIndex?: unknown;
  workspaceIndex?: unknown;
  pikeIntrospection?: {
    getInherits(
      uri: string
    ): Promise<
      Array<{ uri: string; ownerClass: string; ownerLine: number; inheritedName: string }>
    >;
  };
}

/**
 * Create a mock bridge that simulates Pike bridge responses.
 * Supports cross-file symbol resolution and inheritance queries.
 */
export function createMockBridge(responses: {
  findDefinition?: (file: string, symbol: string) => Promise<unknown>;
  findReferences?: (file: string, symbol: string) => Promise<unknown[]>;
  getInheritance?: (file: string, className: string) => Promise<unknown[]>;
  resolveSymbol?: (file: string, symbol: string) => Promise<unknown>;
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
export function createMockWorkspaceIndex(symbols: Map<string, unknown[]>) {
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
export function buildMockServices(overrides?: MockServicesOverrides) {
  const documentCache = overrides?.documentCache ?? new DocumentCache();

  if (overrides?.cacheEntries) {
    for (const [uri, entry] of overrides.cacheEntries) {
      documentCache.set(uri, entry);
    }
  }

  return {
    bridge: overrides?.bridge ?? null,
    logger: silentLogger,
    documentCache,
    stdlibIndex: overrides?.stdlibIndex ?? null,
    includeResolver: null,
    typeDatabase: new TypeDatabase(),
    workspaceIndex: overrides?.workspaceIndex ?? {
      searchSymbols: () => [],
      getDocumentSymbols: () => [],
      getAllDocumentUris: () => [],
      getUrisForSymbolName: () => [],
    },
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 300 },
    includePaths: [],
    moduleContext: null,
    ...(overrides?.pikeIntrospection ? { pikeIntrospection: overrides.pikeIntrospection } : {}),
  };
}

/**
 * Alias: createMockServices calls buildMockServices.
 * Kept for backward compatibility with scenario tests that import from mock-services.
 */
export const createMockServices = buildMockServices;
