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

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import {
  MockBridge as BaseMockBridge,
  FaultInjectableMockBridge,
  type FaultInjectionConfig,
  type MockBridgeConfig,
} from './mock-bridge.js';

// ---------------------------------------------------------------------------
// Document mock
// ---------------------------------------------------------------------------

type OpenHandler = (event: { document: TextDocument }) => void;
type SaveHandler = (event: { document: TextDocument }) => void;
type ChangeHandler = (event: { document: TextDocument }) => void;
type CloseHandler = (event: { document: TextDocument }) => void;

export interface MockDocuments {
  get(uri: string): TextDocument | undefined;
  all(): TextDocument[];
  onDidOpen(handler: OpenHandler): void;
  onDidSave(handler: SaveHandler): void;
  onDidChangeContent(handler: ChangeHandler): void;
  onDidClose(handler: CloseHandler): void;
  emitOpen(document: TextDocument): void;
  emitSave(document: TextDocument): void;
  emitChange(document: TextDocument): void;
  emitClose(document: TextDocument): void;
}

export interface MockDocumentHooks {
  onEvent?: (event: {
    type: 'open' | 'save' | 'change' | 'close';
    uri: string;
    version: number;
  }) => void;
}

export function createMockDocuments(hooks: MockDocumentHooks = {}): MockDocuments {
  let openHandler: OpenHandler | undefined;
  let saveHandler: SaveHandler | undefined;
  let changeHandler: ChangeHandler | undefined;
  let closeHandler: CloseHandler | undefined;
  const docs = new Map<string, TextDocument>();

  return {
    get(uri: string) {
      return docs.get(uri);
    },
    all() {
      return [...docs.values()];
    },
    onDidOpen(handler: OpenHandler) {
      openHandler = handler;
    },
    onDidSave(handler: SaveHandler) {
      saveHandler = handler;
    },
    onDidChangeContent(handler: ChangeHandler) {
      changeHandler = handler;
    },
    onDidClose(handler: CloseHandler) {
      closeHandler = handler;
    },
    emitOpen(document: TextDocument) {
      docs.set(document.uri, document);
      openHandler?.({ document });
      hooks.onEvent?.({ type: 'open', uri: document.uri, version: document.version });
    },
    emitSave(document: TextDocument) {
      docs.set(document.uri, document);
      saveHandler?.({ document });
      hooks.onEvent?.({ type: 'save', uri: document.uri, version: document.version });
    },
    emitChange(document: TextDocument) {
      docs.set(document.uri, document);
      changeHandler?.({ document });
      hooks.onEvent?.({ type: 'change', uri: document.uri, version: document.version });
    },
    emitClose(document: TextDocument) {
      docs.delete(document.uri);
      closeHandler?.({ document });
      hooks.onEvent?.({ type: 'close', uri: document.uri, version: document.version });
    },
  };
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
  onRequest: (method: string, handler: (params: unknown) => unknown) => void;
  sendDiagnostics: (params: { uri: string; diagnostics: unknown[] }) => void;
  diagnosticsPublished: unknown[];
  getSentDiagnostics: () => unknown[];
  console: { log: (...args: unknown[]) => void };
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
  let _typeHierarchySubtypesHandler: TypeHierarchySubtypesHandler | null = null;
  let _semanticTokensHandler: unknown = null;
  let _semanticTokensDeltaHandler: unknown = null;
  let _monikerHandler: unknown = null;
  const diagnosticsPublished: unknown[] = [];
  const _sentDiagnostics: Array<{ uri: string; diagnostics: unknown[] }> = [];
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
    sendDiagnostics(params: { uri: string; diagnostics: unknown[] }) {
      _sentDiagnostics.push(params);
    },
    diagnosticsPublished,
    console: { log: () => {} },
    languages: {
      callHierarchy: {
        onPrepare(_handler) {},
        onOutgoingCalls(_handler) {},
        onIncomingCalls(_handler) {},
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
