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
// Connection mock
// ---------------------------------------------------------------------------

export interface MockConnection {
  sendDiagnostics(params: { uri: string; diagnostics: unknown[] }): void;
  onDidChangeConfiguration(handler: (params: { settings: Record<string, unknown> }) => void): void;
  onDidChangeTextDocument(
    handler: (params: {
      textDocument: { uri: string; version: number };
      contentChanges: unknown[];
    }) => void
  ): void;
  console: { log(): void; warn(): void; error(): void };
}

export function createMockConnection(): MockConnection & { diagnosticsPublished: unknown[] } {
  const diagnosticsPublished: unknown[] = [];

  return {
    diagnosticsPublished,
    sendDiagnostics(params: { uri: string; diagnostics: unknown[] }) {
      diagnosticsPublished.push(params);
    },
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    console: { log() {}, warn() {}, error() {} },
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
