/**
 * Standard Test Helpers for pike-lsp
 *
 * Import this file instead of creating inline mocks.
 * Ensures consistent test patterns across all test files.
 *
 * Usage:
 *   import { describe, it } from 'bun:test';
 *   import assert from 'node:assert/strict';
 *   import { createMockDocuments, createMockBridge, createMockServices, makeCachedEntry } from './test-helpers.js';
 */

import { TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Connection } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import assert from 'node:assert/strict';
import {
  MockBridge as BaseMockBridge,
  FaultInjectableMockBridge,
  type FaultInjectionConfig,
  type MockBridgeConfig,
} from './mock-bridge.js';

export interface MockDocumentHooks {
  onEvent?: (event: {
    type: 'open' | 'save' | 'change' | 'close';
    uri: string;
    version: number;
  }) => void;
}

/**
 * Creates a TextDocuments<TextDocument> instance with test-fire emit helpers.
 * Internally builds a real TextDocuments and wires it to a mock connection
 * whose notification handlers are captured for use in emit* methods.
 */
export type MockDocuments = TextDocuments<TextDocument> & {
  emitOpen(document: TextDocument): void;
  emitSave(document: TextDocument): void;
  emitChange(document: TextDocument): void;
  emitClose(document: TextDocument): void;
};

export function createMockDocuments(hooks: MockDocumentHooks = {}): MockDocuments {
  const docs = new TextDocuments(TextDocument);

  // The TextDocuments class stores internal state in private fields:
  //   _syncedDocuments: Map<string, TextDocument>
  //   _onDidOpen, _onDidClose, _onDidChangeContent, _onDidSave: Emitter instances
  // We need to access them for the emit* helpers. Since the handlers call
  // documents.onDidOpen / documents.onDidChangeContent etc. (Event properties),
  // we register listeners on those events and fire through the captured emitters.

  // Extract private emitter fire methods for use in emit* helpers.
  const internals = docs as unknown as Record<string, unknown>;

  // Validate internal fields exist — fail fast if vscode-languageserver changes them.
  assert(
    internals['_syncedDocuments'] instanceof Map,
    'TextDocuments internal field mismatch — library may have been updated'
  );

  // Access the internal emitter fire methods
  const syncedDocs = internals['_syncedDocuments'] as Map<string, TextDocument>;
  const fireOpen = (
    internals['_onDidOpen'] as { fire: (event: { document: TextDocument }) => void }
  ).fire.bind(internals['_onDidOpen']);
  const fireClose = (
    internals['_onDidClose'] as { fire: (event: { document: TextDocument }) => void }
  ).fire.bind(internals['_onDidClose']);
  const fireChange = (
    internals['_onDidChangeContent'] as { fire: (event: { document: TextDocument }) => void }
  ).fire.bind(internals['_onDidChangeContent']);
  const fireSave = (
    internals['_onDidSave'] as { fire: (event: { document: TextDocument }) => void }
  ).fire.bind(internals['_onDidSave']);

  return Object.assign(docs, {
    emitOpen(document: TextDocument) {
      syncedDocs.set(document.uri, document);
      fireOpen({ document });
      hooks.onEvent?.({ type: 'open', uri: document.uri, version: document.version });
    },
    emitSave(document: TextDocument) {
      syncedDocs.set(document.uri, document);
      fireSave({ document });
      hooks.onEvent?.({ type: 'save', uri: document.uri, version: document.version });
    },
    emitChange(document: TextDocument) {
      syncedDocs.set(document.uri, document);
      fireChange({ document });
      hooks.onEvent?.({ type: 'change', uri: document.uri, version: document.version });
    },
    emitClose(document: TextDocument) {
      syncedDocs.delete(document.uri);
      fireClose({ document });
      hooks.onEvent?.({ type: 'close', uri: document.uri, version: document.version });
    },
  });
}

// ---------------------------------------------------------------------------
// Bridge mock
// ---------------------------------------------------------------------------

export type MockBridge = BaseMockBridge;
export type { MockBridgeConfig, FaultInjectionConfig, FaultInjectableMockBridge };

export function createMockBridge(
  config: MockBridgeConfig & { faultInjection?: FaultInjectionConfig } = {}
): MockBridge | FaultInjectableMockBridge {
  const { faultInjection, ...baseConfig } = config;
  if (faultInjection) {
    return new FaultInjectableMockBridge(baseConfig, faultInjection);
  }
  return new BaseMockBridge(baseConfig);
}

// ---------------------------------------------------------------------------
// Connection mock (full-featured)
// ---------------------------------------------------------------------------

// Handler type aliases — defined here to avoid circular imports with mock-services.ts
type DefinitionHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<
  | import('vscode-languageserver/node.js').Location
  | import('vscode-languageserver/node.js').Location[]
  | null
>;

type DeclarationHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<import('vscode-languageserver/node.js').Location | null>;

type TypeDefinitionHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<import('vscode-languageserver/node.js').Location | null>;

type ReferencesHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
  context: { includeDeclaration: boolean };
}) => Promise<import('vscode-languageserver/node.js').Location[]>;

type DocumentHighlightHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<import('vscode-languageserver/node.js').DocumentHighlight[] | null>;

type ImplementationHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<import('vscode-languageserver/node.js').Location[]>;

type DocumentSymbolHandler = (params: {
  textDocument: { uri: string };
}) => Promise<import('vscode-languageserver/node.js').DocumentSymbol[] | null>;

type TypeHierarchyPrepareHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<import('vscode-languageserver/node.js').TypeHierarchyItem[] | null>;

type TypeHierarchySupertypesHandler = (params: {
  item: import('vscode-languageserver/node.js').TypeHierarchyItem;
  direction: 'parents' | 'children';
}) => Promise<import('vscode-languageserver/node.js').TypeHierarchyItem[] | null>;

type TypeHierarchySubtypesHandler = (params: {
  item: import('vscode-languageserver/node.js').TypeHierarchyItem;
  direction: 'parents' | 'children';
}) => Promise<import('vscode-languageserver/node.js').TypeHierarchyItem[] | null>;

type LinkedEditingRangeHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => import('vscode-languageserver/node.js').LinkedEditingRanges | null;

export interface MockConnection {
  onDefinition: (handler: DefinitionHandler) => void;
  onDeclaration: (handler: DeclarationHandler) => void;
  onTypeDefinition: (handler: TypeDefinitionHandler) => void;
  onReferences: (handler: ReferencesHandler) => void;
  onDocumentHighlight: (handler: DocumentHighlightHandler) => void;
  onImplementation: (handler: ImplementationHandler) => void;
  onDocumentSymbol: (handler: DocumentSymbolHandler) => void;
  onWorkspaceSymbol: (handler: (...args: unknown[]) => unknown) => void;
  onLinkedEditingRange: (handler: LinkedEditingRangeHandler) => void;
  onCodeAction: (handler: unknown) => void;
  onCodeLens: (handler: unknown) => void;
  onCodeLensResolve: (handler: unknown) => void;
  onDidChangeConfiguration: (handler: unknown) => void;
  onDidChangeTextDocument: (handler: unknown) => void;
  onRequest: (method: string, handler: (params: unknown) => unknown) => void;
  sendDiagnostics: (params: { uri: string; version?: number; diagnostics: unknown[] }) => void;
  diagnosticsPublished: unknown[];
  getSentDiagnostics: () => unknown[];
  console: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  languages: {
    callHierarchy: {
      onPrepare: (
        handler: (params: {
          textDocument: { uri: string };
          position: { line: number; character: number };
        }) => Promise<import('vscode-languageserver/node.js').CallHierarchyItem[] | null>
      ) => void;
      onOutgoingCalls: (
        handler: (params: {
          item: import('vscode-languageserver/node.js').CallHierarchyItem;
        }) => Promise<import('vscode-languageserver/node.js').CallHierarchyOutgoingCall[] | null>
      ) => void;
      onIncomingCalls: (
        handler: (params: {
          item: import('vscode-languageserver/node.js').CallHierarchyItem;
        }) => Promise<import('vscode-languageserver/node.js').CallHierarchyIncomingCall[] | null>
      ) => void;
    };
    typeHierarchy: {
      onPrepare: (handler: TypeHierarchyPrepareHandler) => void;
      onSupertypes: (handler: TypeHierarchySupertypesHandler) => void;
      onSubtypes: (handler: TypeHierarchySubtypesHandler) => void;
    };
    semanticTokens: {
      on: (handler: unknown) => void;
      onDelta: (handler: unknown) => void;
    };
    moniker: {
      on: (handler: unknown) => void;
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
  semanticTokensHandler: unknown;
  semanticTokensDeltaHandler: unknown;
  monikerHandler: unknown;
  callHierarchyPrepareHandler: unknown;
  callHierarchyIncomingCallsHandler: unknown;
  callHierarchyOutgoingCallsHandler: unknown;
  codeActionHandler: unknown;
  codeLensHandler: unknown;
  codeLensResolveHandler: unknown;
  getRequestHandler(method: string): ((params: unknown) => unknown) | undefined;
}

/**
 * Create a mock LSP Connection that captures registered handlers.
 * Supports all navigation, reference, and symbol handlers.
 */

/**
 * Centralized type casts for test setup.
 * MockConnection implements all methods the registration functions actually call,
 * but doesn't satisfy the full Connection/Services/TextDocuments interfaces.
 * These helpers centralize the structural cast in one place.
 */
export function asConnection(conn: MockConnection): Connection {
  return conn as unknown as Connection;
}

export function asServices(services: object): Services {
  return services as unknown as Services;
}

export function asTextDocuments(docs: MockDocuments): TextDocuments<TextDocument> {
  return docs as unknown as TextDocuments<TextDocument>;
}

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
  let _typeHierarchySubtypesHandler: TypeHierarchySubtypesHandler | null = null;
  let _semanticTokensHandler: unknown = null;
  let _semanticTokensDeltaHandler: unknown = null;
  let _monikerHandler: unknown = null;
  let _callHierarchyPrepareHandler: unknown = null;
  let _callHierarchyOutgoingCallsHandler: unknown = null;
  let _callHierarchyIncomingCallsHandler: unknown = null;
  let _codeActionHandler: unknown = null;
  let _codeLensHandler: unknown = null;
  let _codeLensResolveHandler: unknown = null;
  const diagnosticsPublished: unknown[] = [];
  const _sentDiagnostics: Array<{ uri: string; version?: number; diagnostics: unknown[] }> = [];
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
    onCodeAction(handler: unknown) {
      _codeActionHandler = handler;
    },
    onCodeLens(handler: unknown) {
      _codeLensHandler = handler;
    },
    onCodeLensResolve(handler: unknown) {
      _codeLensResolveHandler = handler;
    },
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    onRequest(method: string, handler: (params: unknown) => unknown) {
      _requestHandlers.set(method, handler);
    },
    sendDiagnostics(params: { uri: string; version?: number; diagnostics: unknown[] }) {
      _sentDiagnostics.push(params);
      diagnosticsPublished.push(params);
    },
    diagnosticsPublished,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    languages: {
      callHierarchy: {
        onPrepare(handler: unknown) {
          _callHierarchyPrepareHandler = handler;
        },
        onOutgoingCalls(handler: unknown) {
          _callHierarchyOutgoingCallsHandler = handler;
        },
        onIncomingCalls(handler: unknown) {
          _callHierarchyIncomingCallsHandler = handler;
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
        on(handler: unknown) {
          _semanticTokensHandler = handler;
        },
        onDelta(handler: unknown) {
          _semanticTokensDeltaHandler = handler;
        },
      },
      moniker: {
        on(handler: unknown) {
          _monikerHandler = handler;
        },
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
    get semanticTokensHandler(): unknown {
      if (!_semanticTokensHandler) throw new Error('No semantic tokens handler registered');
      return _semanticTokensHandler;
    },
    get semanticTokensDeltaHandler(): unknown {
      if (!_semanticTokensDeltaHandler)
        throw new Error('No semantic tokens delta handler registered');
      return _semanticTokensDeltaHandler;
    },
    get monikerHandler(): unknown {
      if (!_monikerHandler) throw new Error('No moniker handler registered');
      return _monikerHandler;
    },
    get callHierarchyPrepareHandler(): unknown {
      return _callHierarchyPrepareHandler;
    },
    get callHierarchyIncomingCallsHandler(): unknown {
      return _callHierarchyIncomingCallsHandler;
    },
    get callHierarchyOutgoingCallsHandler(): unknown {
      return _callHierarchyOutgoingCallsHandler;
    },
    get codeActionHandler(): unknown {
      return _codeActionHandler;
    },
    get codeLensHandler(): unknown {
      return _codeLensHandler;
    },
    get codeLensResolveHandler(): unknown {
      return _codeLensResolveHandler;
    },
    getRequestHandler(method: string): ((params: unknown) => unknown) | undefined {
      return _requestHandlers.get(method);
    },
    getSentDiagnostics() {
      return _sentDiagnostics;
    },
  };
}

// ---------------------------------------------------------------------------
// Cache entry factory
// ---------------------------------------------------------------------------

export function makeCachedEntry(
  text: string,
  options: { parseFailed?: boolean; diagnostics?: unknown[] } = {}
): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: (options.diagnostics ?? []) as DocumentCacheEntry['diagnostics'],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash: computeContentHash(text),
    lineHashes: computeLineHashes(text),
    analysisState: { isStale: false, parseFailed: options.parseFailed ?? false },
  };
}

// ---------------------------------------------------------------------------
// Full services mock (for registerDiagnosticsHandlers, etc.)
// ---------------------------------------------------------------------------

export function createMockServices(
  uri: string,
  bridge: MockBridge,
  cachedEntry?: DocumentCacheEntry
) {
  let entry = cachedEntry;

  return {
    services: {
      bridge,
      documentCache: {
        get(requestedUri: string) {
          return requestedUri === uri ? entry : undefined;
        },
        setPending() {},
        set(requestedUri: string, e: DocumentCacheEntry) {
          if (requestedUri === uri) entry = e;
        },
        delete() {},
      },
      typeDatabase: {
        setProgram() {},
        removeProgram() {},
        getMemoryStats() {
          return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
        },
      },
      workspaceIndex: { indexDocument() {}, removeDocument() {} },
      includeResolver: null,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    } as unknown as Services,
    get cachedEntry() {
      return entry;
    },
  };
}

// ---------------------------------------------------------------------------
// Pika analyzer simulation (for scenarios)
// ---------------------------------------------------------------------------

export function pikeAnalyzer(text: string): { hasError: boolean; errorMessage?: string } {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    if (/=\s*;/.test(trimmed) || (/=\s*$/.test(trimmed) && !trimmed.endsWith('{'))) {
      return { hasError: true, errorMessage: 'Syntax error: expected expression' };
    }
  }
  return { hasError: false };
}
